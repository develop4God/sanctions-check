"""
FastAPI Sanctions Screening API Server

Provides REST API endpoints for sanctions screening functionality.
Supports two data modes:
1. XML Mode (default): Loads entities from XML files at startup
2. Database Mode: Queries PostgreSQL database for screening (preferred for production)

The mode is controlled by the USE_DATABASE environment variable.

Usage:
    # XML mode (default)
    uvicorn api.server:app --reload --port 8000
    
    # Database mode
    USE_DATABASE=true uvicorn api.server:app --reload --port 8000
"""

import os
import time
from fastapi import Request
import uuid
import logging
import tempfile
import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Union
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, UploadFile, File, Depends, Security
from fastapi.security import APIKeyHeader

from api.models import (
    ScreeningRequest,
    ScreeningResponse,
    MatchDetail,
    ConfidenceBreakdownResponse,
    EntityDetail,
    BulkScreeningResponse,
    BulkScreeningItem,
    HealthResponse,
    DataFileInfo,
    DataUpdateResponse,
    ErrorResponse,
    ReportRequest,
    BulkReportRequest,
    ReportResponse,
)
from api.middleware import (
    setup_cors,
    setup_exception_handlers,
    RequestLoggingMiddleware,
    get_recent_connection_logs,
    get_connection_log_file_content,
)
from screener import EnhancedSanctionsScreener, InputValidationError
from config_manager import ConfigManager, ConfigurationError, init_config, get_config_dependency
from downloader import EnhancedSanctionsDownloader

# Setup logging
logging.basicConfig(
    level=logging.DEBUG, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Environment variables with defaults
API_HOST = os.getenv("API_HOST", "127.0.0.1")
API_PORT = int(os.getenv("API_PORT", "8000"))
DATA_DIR = os.getenv("DATA_DIR", "sanctions_data")
MAX_UPLOAD_SIZE_MB = int(os.getenv("MAX_UPLOAD_SIZE_MB", "10"))
CONFIG_PATH = os.getenv("CONFIG_PATH", "config.yaml")
API_KEY = os.getenv("API_KEY", "")  # Required for authenticated endpoints
USE_DATABASE = os.getenv("USE_DATABASE", "false").lower() in ("true", "1", "yes")
DATABASE_URL = os.getenv("DATABASE_URL", "")  # Railway provides this

# Global state for dependency injection
_screener: Optional[EnhancedSanctionsScreener] = None
_config: Optional[ConfigManager] = None
_startup_time: Optional[datetime] = None
_screener_lock = asyncio.Lock()  # Lock for atomic screener updates
_executor = ThreadPoolExecutor(max_workers=2)  # For blocking I/O operations
_db_provider = None  # Database provider for PostgreSQL mode
_data_mode: str = "xml"  # Either "xml" or "database"

# API Key security scheme
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def verify_api_key(api_key: Optional[str] = Security(api_key_header)) -> str:
    """Verify API key for protected endpoints.

    If API_KEY environment variable is not set, authentication is disabled.
    """
    if not API_KEY:
        # API key not configured - allow all requests (development mode)
        return "dev-mode"

    if not api_key:
        raise HTTPException(
            status_code=401, detail="Missing API key. Provide X-API-Key header."
        )

    if api_key != API_KEY:
        raise HTTPException(status_code=403, detail="Invalid API key")

    return api_key


def get_screener() -> EnhancedSanctionsScreener:
    """Dependency to get the screener instance (XML mode).
    
    This function provides the screener for XML-based screening.
    For database mode, see get_database_screening_service().
    """
    global _screener
    if _screener is None:
        raise HTTPException(
            status_code=503, detail="Screener not initialized. Service is starting up."
        )
    return _screener


def get_config_instance() -> ConfigManager:
    """Dependency to get the config instance.
    
    Returns the global ConfigManager instance, initializing it if needed.
    """
    global _config
    if _config is None:
        _config = ConfigManager(CONFIG_PATH)
    return _config


def get_database_screening_service():
    """
    Dependency to get a DatabaseScreeningService instance.
    
    Only available when USE_DATABASE=true.
    Provides a database session-scoped screening service.
    """
    global _db_provider, _config
    
    if _db_provider is None:
        raise HTTPException(
            status_code=503,
            detail="Database mode not enabled. Set USE_DATABASE=true to use PostgreSQL."
        )
    
    from database.screening_service import DatabaseScreeningService
    
    # Use session_scope context manager for proper cleanup
    with _db_provider.session_scope() as session:
        yield DatabaseScreeningService(session, _config)


def get_data_mode() -> str:
    """Get the current data mode ('xml' or 'database')."""
    global _data_mode
    return _data_mode


# Create FastAPI application
app = FastAPI(
    title="Sanctions Screening API",
    description="API for screening individuals against OFAC and UN sanctions lists",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# Setup middleware - CORS debe agregarse DESPUÉS de otros middlewares
# porque en Starlette/FastAPI el orden es inverso (último agregado = primero en ejecutar)
app.add_middleware(RequestLoggingMiddleware)
setup_cors(app)  # CORS se agrega último para que se ejecute primero
setup_exception_handlers(app)


@app.on_event("startup")
async def startup():
    """Initialize screener and load sanctions data on startup.
    
    Supports two modes:
    1. XML Mode (default): Loads entities from XML files
    2. Database Mode (USE_DATABASE=true): Uses PostgreSQL for screening
    """
    global _screener, _config, _startup_time, _db_provider, _data_mode

    logger.info("🚀 Starting Sanctions Screening API...")
    start_time = time.time()

    try:
        # Load configuration (using DI pattern)
        _config = ConfigManager(CONFIG_PATH)
        logger.info(f"✓ Configuration loaded from {CONFIG_PATH}")
        
        # Check if we should use database mode
        if USE_DATABASE or DATABASE_URL:
            logger.info("🔧 Database mode enabled, initializing PostgreSQL connection...")
            try:
                from database.connection import DatabaseSessionProvider, DatabaseSettings
                from database.screening_service import DatabaseScreeningService
                
                # Configure database settings
                if DATABASE_URL:
                    # Railway-style DATABASE_URL
                    logger.info("Using DATABASE_URL from environment")
                    settings = DatabaseSettings()  # Will use DATABASE_URL if set
                else:
                    # Use individual env vars or config
                    settings = DatabaseSettings.from_env()
                
                _db_provider = DatabaseSessionProvider(settings=settings)
                _db_provider.init()
                
                # Test connection and get entity count
                if _db_provider.health_check():
                    with _db_provider.session_scope() as session:
                        service = DatabaseScreeningService(session, _config)
                        entity_count = service.get_entity_count()
                        counts_by_source = service.get_entity_count_by_source()
                    
                    _data_mode = "database"
                    logger.info(f"✓ Database mode active: {entity_count} entities in PostgreSQL")
                    for source, count in counts_by_source.items():
                        logger.info(f"  - {source}: {count} entities")
                else:
                    logger.warning("⚠ Database connection failed, falling back to XML mode")
                    _data_mode = "xml"
                    _db_provider = None
                    
            except ImportError as e:
                logger.warning(f"⚠ Database dependencies not available ({e}), using XML mode")
                _data_mode = "xml"
            except Exception as e:
                logger.warning(f"⚠ Database initialization failed ({e}), falling back to XML mode")
                _data_mode = "xml"
                _db_provider = None
        

        # If not in database mode, use XML mode
        if _data_mode == "xml":
            logger.info("🔧 XML mode: Downloading and loading entities...")
            # Download latest XMLs (with fallback to cached)
            try:
                loop = asyncio.get_event_loop()
                downloader = EnhancedSanctionsDownloader(config=_config)
                entities, validation = await loop.run_in_executor(
                    _executor, downloader.download_and_parse_all
                )
                if validation.is_valid:
                    logger.info(f"✓ Downloaded {len(entities)} fresh entities")
                else:
                    logger.warning(f"Download completed with {len(validation.warnings)} warnings")
            except Exception as e:
                logger.warning(f"Download failed, will use cached XMLs: {e}")

            # Initialize and load screener
            _screener = EnhancedSanctionsScreener(config=_config, data_dir=DATA_DIR)

            ofac_count = await loop.run_in_executor(_executor, _screener.load_ofac)
            logger.info(f"✓ Loaded {ofac_count} OFAC entities")

            un_count = await loop.run_in_executor(_executor, _screener.load_un)
            logger.info(f"✓ Loaded {un_count} UN entities")

            total_entities = len(_screener.entities)
            logger.info(f"✓ Total entities: {total_entities}")

        elapsed = time.time() - start_time
        _startup_time = datetime.now(timezone.utc)

        logger.info(
            "✓ API ready in %.2f seconds (mode: %s)", elapsed, _data_mode
        )

    except ConfigurationError as e:
        logger.error(f"✗ Configuration error: {e}")
        raise
    except Exception as e:
        logger.error(f"✗ Startup error: {e}")
        raise


@app.on_event("shutdown")
async def shutdown():
    """Cleanup on shutdown."""
    global _db_provider
    
    logger.info("Shutting down Sanctions Screening API...")
    
    # Close database provider if active
    if _db_provider is not None:
        try:
            _db_provider.close()
            logger.info("✓ Database connection closed")
        except Exception as e:
            logger.warning(f"⚠ Error closing database connection: {e}")


def _transform_match_to_response(match_dict: dict) -> MatchDetail:
    """Transform screener match dict to API response model."""
    entity_data = match_dict.get("entity", {})
    confidence_data = match_dict.get("confidence", {})

    # Build EntityDetail
    entity = EntityDetail(
        id=entity_data.get("id", ""),
        source=entity_data.get("source", ""),
        type=entity_data.get("type", "unknown"),
        name=entity_data.get("name", ""),
        all_names=entity_data.get("all_names", []),
        aliases=entity_data.get("aliases", []),
        firstName=entity_data.get("firstName"),
        lastName=entity_data.get("lastName"),
        countries=entity_data.get("countries", []),
        identity_documents=entity_data.get("identity_documents", []),
        program=entity_data.get("program"),
        dateOfBirth=entity_data.get("dateOfBirth"),
        nationality=entity_data.get("nationality"),
    )

    # Build ConfidenceBreakdownResponse
    confidence = ConfidenceBreakdownResponse(
        overall=confidence_data.get("overall", 0.0),
        name=confidence_data.get("name", 0.0),
        document=confidence_data.get("document", 0.0),
        dob=confidence_data.get("dob", 0.0),
        nationality=confidence_data.get("nationality", 0.0),
        address=confidence_data.get("address", 0.0),
    )

    return MatchDetail(
        entity=entity,
        confidence=confidence,
        flags=match_dict.get("flags", []),
        recommendation=match_dict.get("recommendation", "MANUAL_REVIEW"),
        match_layer=match_dict.get("match_layer", 4),
        matched_name=match_dict.get("matched_name", ""),
        matched_document=match_dict.get("matched_document"),
    )


@app.post(
    "/api/v1/screen",
    response_model=ScreeningResponse,
    responses={
        200: {
            "model": ScreeningResponse,
            "description": "Screening completed successfully",
        },
        401: {"model": ErrorResponse, "description": "Missing API key"},
        403: {"model": ErrorResponse, "description": "Invalid API key"},
        422: {"model": ErrorResponse, "description": "Validation error"},
        500: {"model": ErrorResponse, "description": "Internal server error"},
    },
    summary="Screen an individual",
    description="Screen an individual against OFAC and UN sanctions lists",
)
async def screen_individual(
    request: ScreeningRequest,
    api_key: str = Depends(verify_api_key),
):
    """Screen an individual against sanctions lists.

    This endpoint validates input, calls the screener, and returns matches.
    Supports both XML mode (default) and Database mode (USE_DATABASE=true).
    Requires API key authentication via X-API-Key header.
    """
    global _data_mode, _screener, _db_provider, _config
    
    start_time = time.time()

    try:
        # Use the appropriate screening method based on data mode
        if _data_mode == "database" and _db_provider is not None:
            # Database mode: use PostgreSQL
            from database.screening_service import DatabaseScreeningService
            
            with _db_provider.session_scope() as session:
                service = DatabaseScreeningService(session, _config)
                result = service.screen_individual(
                    name=request.name,
                    document=request.document_number,
                    document_type=request.document_type,
                    date_of_birth=request.date_of_birth,
                    nationality=request.nationality,
                    country=request.country,
                    analyst=request.analyst,
                    generate_report=False,
                )
        else:
            # XML mode: use in-memory screener
            if _screener is None:
                raise HTTPException(
                    status_code=503,
                    detail="Screener not initialized. Service is starting up."
                )
            result = _screener.screen_individual(
                name=request.name,
                document=request.document_number,
                document_type=request.document_type,
                date_of_birth=request.date_of_birth,
                nationality=request.nationality,
                country=request.country,
                analyst=request.analyst,
                generate_report=False,
            )

        # Transform matches to response format
        matches = [_transform_match_to_response(m) for m in result.get("matches", [])]

        processing_time_ms = int((time.time() - start_time) * 1000)

        return ScreeningResponse(
            screening_id=result.get("screening_id", str(uuid.uuid4())),
            screening_date=result.get(
                "screening_date", datetime.now(timezone.utc).isoformat()
            ),
            is_hit=result.get("is_hit", False),
            hit_count=result.get("hit_count", 0),
            matches=matches,
            processing_time_ms=processing_time_ms,
            algorithm_version=result.get("algorithm_version", "2.0.0"),
        )

    except InputValidationError:
        # Re-raise to be handled by exception handler
        raise
    except Exception as e:
        logger.error(
            "Screening error: type=%s message=%s name=%s",
            type(e).__name__,
            str(e),
            request.name[:50] if request.name else "N/A",
        )
        raise HTTPException(status_code=500, detail="Screening failed")


@app.post(
    "/api/v1/screen/bulk",
    response_model=BulkScreeningResponse,
    responses={
        200: {
            "model": BulkScreeningResponse,
            "description": "Bulk screening completed",
        },
        400: {"model": ErrorResponse, "description": "Invalid CSV format"},
        401: {"model": ErrorResponse, "description": "Missing API key"},
        403: {"model": ErrorResponse, "description": "Invalid API key"},
        413: {"model": ErrorResponse, "description": "File too large"},
        500: {"model": ErrorResponse, "description": "Internal server error"},
    },
    summary="Bulk screen from CSV",
    description="Upload a CSV file for bulk screening. Required headers: nombre, cedula, pais",
)
async def bulk_screen(
    file: UploadFile = File(
        ..., description="CSV file with columns: nombre, cedula, pais"
    ),
    screener: EnhancedSanctionsScreener = Depends(get_screener),
    api_key: str = Depends(verify_api_key),
):
    """Bulk screen individuals from a CSV file.

    The CSV must have headers: nombre (name), cedula (document), pais (country).
    Streams file directly to disk to avoid memory issues with large files.
    Requires API key authentication via X-API-Key header.
    """
    start_time = time.time()
    screening_id = str(uuid.uuid4())

    # Allowed content types for CSV files
    ALLOWED_CONTENT_TYPES = {
        "text/csv",
        "text/plain",
        "application/octet-stream",
        "application/csv",
    }

    # Validate content type first (before reading)
    if file.content_type and file.content_type.lower() not in ALLOWED_CONTENT_TYPES:
        if "csv" not in file.content_type.lower():
            raise HTTPException(status_code=400, detail="File must be a CSV")

    max_size_bytes = MAX_UPLOAD_SIZE_MB * 1024 * 1024
    temp_path = None

    try:
        # Create temp directory with secure path
        temp_dir = Path(tempfile.gettempdir()) / "sanctions_bulk"
        temp_dir.mkdir(exist_ok=True)
        temp_path = temp_dir / f"{screening_id}.csv"

        # Validate path is within temp_dir (prevent path traversal)
        resolved_path = temp_path.resolve()
        if not resolved_path.is_relative_to(temp_dir.resolve()):
            raise HTTPException(status_code=400, detail="Invalid file path")

        # Stream file directly to disk to avoid memory accumulation
        total_size = 0
        file_handle = None
        try:
            file_handle = open(temp_path, "wb")
            while True:
                chunk = await file.read(8192)  # Read 8KB at a time
                if not chunk:
                    break
                total_size += len(chunk)
                if total_size > max_size_bytes:
                    # Immediately cleanup partial file on size exceeded
                    file_handle.close()
                    file_handle = None
                    try:
                        temp_path.unlink()
                    except OSError:
                        pass
                    raise HTTPException(
                        status_code=413,
                        detail=f"File too large. Maximum size is {MAX_UPLOAD_SIZE_MB}MB",
                    )
                file_handle.write(chunk)
        finally:
            if file_handle is not None:
                file_handle.close()

        # Validate CSV headers
        import csv

        with open(temp_path, "r", encoding="utf-8") as f:
            reader = csv.reader(f)
            try:
                headers = next(reader)
            except StopIteration:
                raise HTTPException(status_code=400, detail="CSV file is empty")

            headers_lower = [h.lower().strip() for h in headers]

            if "nombre" not in headers_lower:
                raise HTTPException(
                    status_code=400,
                    detail=f"Missing required header: 'nombre'. Found: {headers}",
                )

        # Call bulk screen
        summary = screener.bulk_screen(
            csv_file=str(temp_path), analyst=None, generate_individual_reports=False
        )

        # Transform results
        results = []
        for r in summary.get("results", []):
            matches = [_transform_match_to_response(m) for m in r.get("matches", [])]
            results.append(
                BulkScreeningItem(
                    screening_id=r.get("screening_id", ""),
                    input=r.get("input", {}),
                    is_hit=r.get("is_hit", False),
                    hit_count=r.get("hit_count", 0),
                    matches=matches,
                )
            )

        processing_time_ms = int((time.time() - start_time) * 1000)

        screening_info = summary.get("screening_info", {})

        return BulkScreeningResponse(
            screening_id=screening_id,
            total_processed=screening_info.get("total_screened", len(results)),
            hits=screening_info.get("total_hits", 0),
            hit_rate=screening_info.get("hit_rate", "0%"),
            results=results,
            processing_time_ms=processing_time_ms,
        )

    finally:
        # Simple and robust temp file cleanup
        if temp_path and temp_path.exists():
            try:
                temp_path.unlink()
            except OSError as e:
                logger.error(
                    "Failed to cleanup temp file: path=%s error=%s", temp_path, e
                )


@app.get(
    "/api/v1/health",
    response_model=HealthResponse,
    summary="Health check",
    description="Check service health and data status",
)
async def health_check(
    config: ConfigManager = Depends(get_config_instance),
):
    """Return health status including entity counts and data freshness. Always returns HTTP 200."""
    global _startup_time, _data_mode, _screener, _db_provider
    try:
        # Get entity count based on data mode
        entities_loaded = 0
        
        if _data_mode == "database" and _db_provider is not None:
            # Database mode
            try:
                from database.screening_service import DatabaseScreeningService
                with _db_provider.session_scope() as session:
                    service = DatabaseScreeningService(session, config)
                    entities_loaded = service.get_entity_count()
            except Exception as e:
                logger.warning(f"Failed to get entity count from database: {e}")
        elif _screener is not None:
            # XML mode
            entities_loaded = len(_screener.entities)

        # Get data file info
        data_dir = Path(DATA_DIR)
        data_files = []
        oldest_file_time = None

        # Initialize last update variables
        ofac_last_updated = None
        un_last_updated = None

        for pattern in ["*.xml", "*.zip"]:
            for f in data_dir.glob(pattern):
                try:
                    stat = f.stat()
                    modified_time = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
                    data_files.append(
                        DataFileInfo(
                            filename=f.name,
                            last_modified=modified_time.isoformat(),
                            size_bytes=stat.st_size,
                        )
                    )
                    if oldest_file_time is None or modified_time < oldest_file_time:
                        oldest_file_time = modified_time

                        # Parse OFAC XML for last update (fallback to file time)
                        if f.name == "SDN_ENHANCED.XML":
                            try:
                                import xml.etree.ElementTree as ET
                                tree = ET.parse(f)
                                root = tree.getroot()
                                # Try to get a date attribute from root (if exists)
                                ofac_last_updated = root.attrib.get("dateGenerated")
                                if not ofac_last_updated:
                                    ofac_last_updated = modified_time.isoformat()
                            except Exception:
                                ofac_last_updated = modified_time.isoformat()

                        # Parse UN XML for last update (prefer dateGenerated)
                        if f.name == "un_consolidated.xml":
                            try:
                                import xml.etree.ElementTree as ET
                                tree = ET.parse(f)
                                root = tree.getroot()
                                un_last_updated = root.attrib.get("dateGenerated")
                            except Exception:
                                un_last_updated = modified_time.isoformat()
                except Exception:
                    pass

        # Calculate data age
        data_age_days = None
        if oldest_file_time:
            age = datetime.now(timezone.utc) - oldest_file_time
            data_age_days = age.days

        # Calculate memory usage
        memory_usage_mb = None
        try:
            import psutil
            process = psutil.Process()
            memory_usage_mb = round(process.memory_info().rss / (1024 * 1024), 2)
        except ImportError:
            pass
        except Exception:
            pass

        # Calculate uptime
        uptime_seconds = None
        if _startup_time:
            uptime = datetime.now(timezone.utc) - _startup_time
            uptime_seconds = int(uptime.total_seconds())

        return HealthResponse(
            status="healthy",
            entities_loaded=entities_loaded,
            data_files=data_files,
            data_age_days=data_age_days,
            algorithm_version=config.algorithm.version,
            memory_usage_mb=memory_usage_mb,
            uptime_seconds=uptime_seconds,
            ofac_last_updated=ofac_last_updated,
            un_last_updated=un_last_updated,
        )
    except Exception as e:
        # Always return HTTP 200, but report error in JSON
        return HealthResponse(
            status="error",
            entities_loaded=0,
            data_files=[],
            data_age_days=None,
            algorithm_version="unknown",
            memory_usage_mb=None,
            uptime_seconds=None,
            ofac_last_updated=None,
            un_last_updated=None,
            error_message=str(e),
        )


@app.post(
    "/api/v1/data/update",
    response_model=DataUpdateResponse,
    responses={
        200: {"model": DataUpdateResponse, "description": "Data updated successfully"},
        401: {"model": ErrorResponse, "description": "Missing API key"},
        403: {"model": ErrorResponse, "description": "Invalid API key"},
        500: {"model": ErrorResponse, "description": "Update failed"},
    },
    summary="Update sanctions data",
    description="Download and reload OFAC and UN sanctions data",
)
async def update_data(
    config: ConfigManager = Depends(get_config_instance),
    api_key: str = Depends(verify_api_key),
):
    """Download fresh sanctions data and reload the screener.

    Uses a lock for atomic screener swap to prevent race conditions
    during concurrent requests.
    Requires API key authentication via X-API-Key header.
    """
    global _screener

    start_time = time.time()

    try:
        # Acquire lock to prevent race conditions during update
        async with _screener_lock:
            # Create downloader
            downloader = EnhancedSanctionsDownloader(config=config)

            # Download and parse all data in executor (blocking I/O)
            loop = asyncio.get_event_loop()
            entities, validation = await loop.run_in_executor(
                _executor, downloader.download_and_parse_all
            )

            # Count by source
            ofac_count = len([e for e in entities if e.source == "OFAC"])
            un_count = len([e for e in entities if e.source == "UN"])

            # Create new screener instance
            new_screener = EnhancedSanctionsScreener(config=config, data_dir=DATA_DIR)

            # Load data in executor (blocking I/O)
            await loop.run_in_executor(_executor, new_screener.load_ofac)
            await loop.run_in_executor(_executor, new_screener.load_un)

            # Atomic swap - only assign after fully loaded
            _screener = new_screener

            total_entities = len(_screener.entities)

        processing_time_ms = int((time.time() - start_time) * 1000)

        return DataUpdateResponse(
            success=validation.is_valid,
            ofac_entities=ofac_count,
            un_entities=un_count,
            total_entities=total_entities,
            validation_errors=validation.errors,
            validation_warnings=validation.warnings,
            processing_time_ms=processing_time_ms,
        )

    except Exception as e:
        logger.error(f"Data update failed: {e}")
        raise HTTPException(status_code=500, detail="Data update failed")


@app.post(
    "/api/v1/reports/generate",
    response_model=ReportResponse,
    responses={
        200: {"model": ReportResponse, "description": "Report generated successfully"},
        400: {"model": ErrorResponse, "description": "Invalid request data"},
        500: {"model": ErrorResponse, "description": "Report generation failed"},
    },
    summary="Generate individual screening report",
    description="Generate HTML report for individual screening using report_generator.py",
)
async def generate_individual_report(
    request: ReportRequest,
    config: ConfigManager = Depends(get_config_instance),
):
    """Generate HTML report for an individual screening result.
    
    This endpoint uses the backend's report_generator.py to ensure
    consistent report generation across all channels (web, PWA, electron).
    """
    try:
        from report_generator import (
            ConstanciaReportGenerator,
            ScreeningResult,
            ScreeningMatch,
            ScreeningConfig,
            ConfidenceBreakdown as ReportConfidenceBreakdown,
            ReportMetadataCollector,
        )
        from pathlib import Path
        
        # Extract screening data
        data = request.screening_data
        
        # Build matches for report
        matches = []
        for m in data.get("matches", []):
            entity = m.get("entity", {})
            confidence = m.get("confidence", {})
            
            # Create confidence breakdown
            conf_breakdown = ReportConfidenceBreakdown(
                overall=confidence.get("overall", 0.0),
                name=confidence.get("name", 0.0),
                document=confidence.get("document", 0.0),
                dob=confidence.get("dob", 0.0),
                nationality=confidence.get("nationality", 0.0),
                address=confidence.get("address", 0.0),
            )
            
            # Create screening match
            match = ScreeningMatch(
                matched_name=m.get("matched_name", entity.get("name", "")),
                match_score=confidence.get("overall", 0.0),
                entity_id=entity.get("id", ""),
                source=entity.get("source", ""),
                entity_type=entity.get("type", "individual"),
                program=entity.get("program", ""),
                countries=entity.get("countries", []),
                all_names=entity.get("all_names", [entity.get("name", "")]),
                confidence_breakdown=conf_breakdown,
                flags=m.get("flags", []),
                recommendation=m.get("recommendation", "MANUAL_REVIEW"),
                match_layer=m.get("match_layer", 4),
                first_name=entity.get("firstName") or entity.get("first_name"),
                last_name=entity.get("lastName") or entity.get("last_name"),
                nationality=entity.get("nationality"),
                date_of_birth=entity.get("dateOfBirth") or entity.get("date_of_birth"),
                identifications=entity.get("identity_documents", []),
            )
            matches.append(match)
        
        # Create screening config snapshot
        screening_config = ScreeningConfig(
            algorithm_version=config.algorithm.version,
            algorithm_name=config.algorithm.name,
            name_threshold=config.algorithm.name_threshold,
            short_name_threshold=config.algorithm.short_name_threshold,
        )
        
        # Get input data
        input_data = data.get("input", {})
        
        # Create screening result
        result = ScreeningResult(
            input_name=input_data.get("name", input_data.get("nombre", "Unknown")),
            input_document=input_data.get("document", input_data.get("cedula", input_data.get("documento", ""))),
            input_country=input_data.get("country", input_data.get("pais", "")),
            screening_date=datetime.now(timezone.utc),
            matches=matches,
            is_hit=data.get("is_hit", False),
            screening_id=data.get("screening_id", str(uuid.uuid4())),
            analyst_name=input_data.get("analyst", "Sistema Web"),
            config=screening_config,
            processing_time_ms=data.get("processing_time_ms"),
            input_dob=input_data.get("date_of_birth", input_data.get("fecha_nacimiento")),
            input_nationality=input_data.get("nationality", input_data.get("nacionalidad")),
        )
        
        # Collect list metadata
        metadata_collector = ReportMetadataCollector(
            data_dir=Path(__file__).parent.parent / "sanctions_data"
        )
        list_metadata = metadata_collector.collect_all_metadata()
        
        # Generate report using the generator directly
        generator = ConstanciaReportGenerator(
            output_dir=Path("/tmp/reports"),
            validate_before_generate=False,
        )
        
        # Generate HTML file temporarily and read content
        report_path = generator.generate_html_report(result, list_metadata, skip_validation=True)
        
        # Read the generated HTML
        with open(report_path, 'r', encoding='utf-8') as f:
            html_content = f.read()
        
        # Clean up temporary file
        try:
            Path(report_path).unlink()
        except Exception:
            pass
        
        return ReportResponse(
            success=True,
            html_content=html_content,
            report_type="individual",
            generated_at=datetime.now(timezone.utc).isoformat(),
        )
        
    except Exception as e:
        logger.error(f"Report generation failed: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Report generation failed: {str(e)}"
        )


@app.post(
    "/api/v1/reports/generate-bulk",
    response_model=ReportResponse,
    responses={
        200: {"model": ReportResponse, "description": "Bulk report generated successfully"},
        400: {"model": ErrorResponse, "description": "Invalid request data"},
        500: {"model": ErrorResponse, "description": "Report generation failed"},
    },
    summary="Generate bulk screening report",
    description="Generate HTML report for multiple screening results using report_generator.py",
)
async def generate_bulk_report(
    request: BulkReportRequest,
):
    """Generate HTML report for bulk screening results.
    
    This endpoint generates a summary report for multiple screenings,
    using consistent styling and data from the backend.
    """
    try:
        results = request.results
        timestamp = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')
        hits = [r for r in results if r.get("is_hit", False)]
        clears = [r for r in results if not r.get("is_hit", False)]
        
        # Generate HTML using template
        html_template = """
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reporte Masivo de Screening - Sanctions Check</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.5;
      color: #1e293b;
      background: #f8fafc;
      padding: 20px;
    }
    .report {
      max-width: 900px;
      margin: 0 auto;
      background: white;
      border-radius: 16px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .header {
      padding: 30px;
      text-align: center;
      color: white;
      background: linear-gradient(135deg, #0d1b2a 0%, #1b3a5c 100%);
    }
    .header h1 { font-size: 28px; margin-bottom: 8px; }
    .header .subtitle { opacity: 0.9; font-size: 14px; }
    .summary {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 15px;
      padding: 25px;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
    }
    .summary-card {
      text-align: center;
      padding: 15px;
      background: white;
      border-radius: 10px;
      border: 1px solid #e2e8f0;
    }
    .summary-card.hit { background: #fee2e2; border-color: #fecaca; }
    .summary-value { font-size: 28px; font-weight: 800; color: #0d1b2a; }
    .summary-card.hit .summary-value { color: #dc2626; }
    .summary-label { font-size: 12px; color: #64748b; text-transform: uppercase; margin-top: 5px; display: block; }
    .content { padding: 25px; }
    .section-title {
      font-size: 18px;
      color: #0d1b2a;
      margin: 25px 0 15px;
      padding-bottom: 10px;
      border-bottom: 2px solid #e2e8f0;
    }
    .results-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .results-table th {
      background: #0d1b2a;
      color: white;
      padding: 12px 10px;
      text-align: left;
      font-weight: 600;
    }
    .results-table td {
      padding: 10px;
      border-bottom: 1px solid #e2e8f0;
    }
    .results-table tr:hover { background: #f8fafc; }
    .results-table tr.row-hit { background: #fee2e2; }
    .results-table tr.row-hit:hover { background: #fecaca; }
    .badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
    }
    .badge.hit { background: #dc2626; color: white; }
    .badge.clear { background: #16a34a; color: white; }
    .badge.reject { background: #fee2e2; color: #dc2626; }
    .badge.review { background: #fef3c7; color: #d97706; }
    .badge.approve { background: #dcfce7; color: #16a34a; }
    .footer {
      padding: 20px;
      background: #f8fafc;
      font-size: 11px;
      color: #64748b;
      text-align: center;
      border-top: 1px solid #e2e8f0;
    }
    @media print {
      body { padding: 0; background: white; }
      .report { box-shadow: none; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="report">
    <div class="header">
      <h1>🛡️ Sanctions Check</h1>
      <div class="subtitle">Reporte Masivo de Verificación de Sanciones</div>
    </div>
    
    <div class="summary">
      <div class="summary-card">
        <div class="summary-value">{total}</div>
        <span class="summary-label">Total Procesados</span>
      </div>
      <div class="summary-card hit">
        <div class="summary-value">{hits_count}</div>
        <span class="summary-label">Coincidencias</span>
      </div>
      <div class="summary-card">
        <div class="summary-value">{clears_count}</div>
        <span class="summary-label">Sin Coincidencias</span>
      </div>
      <div class="summary-card">
        <div class="summary-value">{hit_rate}%</div>
        <span class="summary-label">Tasa de Hits</span>
      </div>
    </div>
    
    <div class="content">
      <div class="section-title">📊 Detalle de Resultados</div>
      <table class="results-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Nombre</th>
            <th>Documento</th>
            <th>País</th>
            <th>Estado</th>
            <th>Hits</th>
            <th>Recomendación</th>
          </tr>
        </thead>
        <tbody>
          {rows}
        </tbody>
      </table>
    </div>
    
    <div class="footer">
      <p><strong>Generado: {timestamp}</strong> | Sanctions Check - Verificación OFAC & ONU</p>
    </div>
  </div>
  
  <div class="no-print" style="text-align: center; margin-top: 20px;">
    <button onclick="window.print()" style="
      padding: 12px 30px;
      background: linear-gradient(135deg, #00b4d8 0%, #0096c7 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
    ">🖨️ Imprimir Reporte</button>
  </div>
</body>
</html>
"""
        
        # Generate table rows
        rows_html = []
        for i, r in enumerate(results, 1):
            rec = "APPROVE"
            if r.get("is_hit") and r.get("matches"):
                rec = r["matches"][0].get("recommendation", "MANUAL_REVIEW")
            
            input_data = r.get("input", {})
            nombre = input_data.get("nombre") or input_data.get("name", "-")
            documento = input_data.get("cedula") or input_data.get("document") or input_data.get("documento", "-")
            pais = input_data.get("pais") or input_data.get("country", "-")
            
            rec_text = {
                'AUTO_ESCALATE': 'ESCALAR',
                'REJECT': 'RECHAZAR',
                'AUTO_CLEAR': 'AUTO OK',
                'APPROVE': 'APROBAR',
            }.get(rec, 'REVISAR')
            
            rec_class = {
                'AUTO_ESCALATE': 'reject',
                'REJECT': 'reject',
                'MANUAL_REVIEW': 'review',
                'LOW_CONFIDENCE_REVIEW': 'review',
                'AUTO_CLEAR': 'approve',
                'APPROVE': 'approve',
            }.get(rec, 'review')
            
            row = f"""
              <tr class="{'row-hit' if r.get('is_hit') else ''}">
                <td>{i}</td>
                <td><strong>{nombre}</strong></td>
                <td>{documento}</td>
                <td>{pais}</td>
                <td><span class="badge {'hit' if r.get('is_hit') else 'clear'}">{'⚠️ HIT' if r.get('is_hit') else '✅ OK'}</span></td>
                <td>{r.get('hit_count', 0)}</td>
                <td><span class="badge {rec_class}">{rec_text}</span></td>
              </tr>
            """
            rows_html.append(row)
        
        # Calculate hit rate
        hit_rate = (len(hits) / len(results) * 100) if results else 0
        
        # Fill template
        html_content = html_template.format(
            total=len(results),
            hits_count=len(hits),
            clears_count=len(clears),
            hit_rate=f"{hit_rate:.1f}",
            rows="".join(rows_html),
            timestamp=timestamp,
        )
        
        return ReportResponse(
            success=True,
            html_content=html_content,
            report_type="bulk",
            generated_at=datetime.now(timezone.utc).isoformat(),
        )
        
    except Exception as e:
        logger.error(f"Bulk report generation failed: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Bulk report generation failed: {str(e)}"
        )


# Root redirect to docs
@app.get("/", include_in_schema=False)
async def root():
    """Redirect root to API documentation."""
    from fastapi.responses import RedirectResponse

    return RedirectResponse(url="/api/docs")


# ============================================================================
# ENDPOINTS DE DEPURACIÓN DE CONEXIÓN
# ============================================================================

@app.get(
    "/api/v1/debug/connection-logs",
    summary="Connection Debug Logs",
    description="Returns recent connection logs for debugging frontend-backend issues",
    tags=["Debug"],
)
async def get_connection_logs(limit: int = 50):
    """Retorna los últimos logs de conexión frontend-backend."""
    logs = get_recent_connection_logs(limit)
    return {
        "total_logs": len(logs),
        "logs": logs,
        "info": "Use this endpoint to debug CORS and connection issues"
    }


@app.get(
    "/api/v1/debug/connection-logs/file",
    summary="Connection Log File Content",
    description="Returns raw content from the connection log file",
    tags=["Debug"],
)
async def get_connection_log_file(lines: int = 100):
    """Retorna el contenido del archivo de log de conexiones."""
    content = get_connection_log_file_content(lines)
    return {
        "lines_requested": lines,
        "content": content
    }


@app.get(
    "/api/v1/debug/cors-test",
    summary="CORS Test Endpoint",
    description="Simple endpoint to test CORS configuration",
    tags=["Debug"],
)
async def cors_test(request: Request):
    """Endpoint simple para probar configuración CORS."""
    origin = request.headers.get("origin", "<no origin>")
    return {
        "message": "CORS test successful",
        "your_origin": origin,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "headers_received": dict(request.headers)
    }


@app.get(
    "/api/v1/debug/data-mode",
    summary="Data Mode Info",
    description="Returns information about the current data mode (XML or Database)",
    tags=["Debug"],
)
async def data_mode_info():
    """Returns current data mode and configuration."""
    global _data_mode, _db_provider, _screener
    
    db_connected = False
    db_entities = 0
    xml_entities = 0
    
    if _data_mode == "database" and _db_provider is not None:
        try:
            from database.screening_service import DatabaseScreeningService
            with _db_provider.session_scope() as session:
                service = DatabaseScreeningService(session, _config)
                db_entities = service.get_entity_count()
                db_connected = True
        except Exception:
            pass
    
    if _screener is not None:
        xml_entities = len(_screener.entities)
    
    return {
        "data_mode": _data_mode,
        "database_connected": db_connected,
        "database_entities": db_entities,
        "xml_entities": xml_entities,
        "use_database_env": USE_DATABASE,
        "database_url_set": bool(DATABASE_URL),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=API_HOST, port=API_PORT)
