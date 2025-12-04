"""
Integration tests for React frontend + FastAPI backend
Tests end-to-end flows including report generation
"""

import pytest
import subprocess
import time
import requests
import sys
from pathlib import Path


# Test configuration
BACKEND_PORT = 8888  # Use different port to avoid conflicts
FRONTEND_PORT = 3333
BACKEND_URL = f"http://localhost:{BACKEND_PORT}"
FRONTEND_URL = f"http://localhost:{FRONTEND_PORT}"


@pytest.fixture(scope="module")
def backend_server():
    """Start backend server for integration tests."""
    project_root = Path(__file__).parent.parent.parent
    python_dir = project_root / "python"
    
    # Start backend server
    print(f"\n🚀 Starting backend server on port {BACKEND_PORT}...")
    process = subprocess.Popen(
        [
            sys.executable, "-m", "uvicorn",
            "api.server:app",
            "--host", "127.0.0.1",
            "--port", str(BACKEND_PORT)
        ],
        cwd=str(python_dir),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    
    # Wait for server to be ready
    max_retries = 30
    for i in range(max_retries):
        try:
            response = requests.get(f"{BACKEND_URL}/api/v1/health", timeout=2)
            if response.status_code == 200:
                print(f"✓ Backend server ready on port {BACKEND_PORT}")
                break
        except requests.exceptions.RequestException:
            if i == max_retries - 1:
                process.kill()
                raise Exception("Backend server failed to start")
            time.sleep(1)
    
    yield process
    
    # Cleanup
    print("\n🛑 Stopping backend server...")
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()


class TestBackendHealth:
    """Test backend health and availability."""
    
    def test_health_endpoint(self, backend_server):
        """Test that health endpoint returns correct data."""
        response = requests.get(f"{BACKEND_URL}/api/v1/health")
        assert response.status_code == 200
        
        data = response.json()
        assert data["status"] == "healthy" or data["status"] == "error"
        assert "entities_loaded" in data
        assert "algorithm_version" in data
        
    def test_api_docs_available(self, backend_server):
        """Test that API documentation is accessible."""
        response = requests.get(f"{BACKEND_URL}/api/docs")
        assert response.status_code == 200
        
    def test_cors_headers(self, backend_server):
        """Test that CORS headers are properly set."""
        response = requests.options(
            f"{BACKEND_URL}/api/v1/health",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET"
            }
        )
        # CORS preflight should succeed or GET should work
        assert response.status_code in [200, 204]


class TestScreeningEndpoints:
    """Test screening endpoints with real backend."""
    
    def test_individual_screening(self, backend_server):
        """Test individual screening endpoint."""
        response = requests.post(
            f"{BACKEND_URL}/api/v1/screen",
            json={
                "name": "Vladimir Putin",
                "country": "RU"
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert "screening_id" in data
        assert "is_hit" in data
        assert "matches" in data
        assert data["is_hit"] is True  # Putin should be in sanctions
        assert len(data["matches"]) > 0
        
    def test_screening_with_no_match(self, backend_server):
        """Test screening that should not match."""
        response = requests.post(
            f"{BACKEND_URL}/api/v1/screen",
            json={
                "name": "Juan Pérez García",
                "document_number": "1-111-1111",
                "country": "PA"
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["is_hit"] is False
        assert len(data["matches"]) == 0
        
    def test_screening_validation_error(self, backend_server):
        """Test that validation errors are handled."""
        response = requests.post(
            f"{BACKEND_URL}/api/v1/screen",
            json={
                "name": "A",  # Too short (min 2 chars)
                "country": "US"
            }
        )
        
        assert response.status_code == 422  # Validation error


class TestReportGenerationIntegration:
    """Test report generation endpoints integration."""
    
    def test_generate_individual_report_with_hit(self, backend_server):
        """Test generating report for a screening with hits."""
        # First, do a screening
        screen_response = requests.post(
            f"{BACKEND_URL}/api/v1/screen",
            json={
                "name": "Bashar Assad",
                "country": "SY"
            }
        )
        assert screen_response.status_code == 200
        screening_data = screen_response.json()
        
        # Now generate report
        report_response = requests.post(
            f"{BACKEND_URL}/api/v1/reports/generate",
            json={"screening_data": screening_data}
        )
        
        assert report_response.status_code == 200
        report_data = report_response.json()
        
        assert report_data["success"] is True
        assert report_data["report_type"] == "individual"
        assert "html_content" in report_data
        
        html = report_data["html_content"]
        assert "<!DOCTYPE html>" in html
        assert "Bashar" in html or "Assad" in html
        
        # Verify percentages are correct (not 825%)
        # Confidence should be in range 0-100
        assert "825%" not in html
        assert "8250%" not in html
        
    def test_generate_report_with_no_hit(self, backend_server):
        """Test generating report for clean screening."""
        # Screen someone not in sanctions
        screen_response = requests.post(
            f"{BACKEND_URL}/api/v1/screen",
            json={
                "name": "John Doe Smith",
                "document_number": "123456",
                "country": "US"
            }
        )
        assert screen_response.status_code == 200
        screening_data = screen_response.json()
        
        # Generate report
        report_response = requests.post(
            f"{BACKEND_URL}/api/v1/reports/generate",
            json={"screening_data": screening_data}
        )
        
        assert report_response.status_code == 200
        report_data = report_response.json()
        
        html = report_data["html_content"]
        assert "SIN COINCIDENCIAS" in html or "No se encontraron" in html
        
    def test_generate_bulk_report(self, backend_server):
        """Test bulk report generation."""
        # Create multiple screening results
        results = []
        
        # Person in sanctions
        response1 = requests.post(
            f"{BACKEND_URL}/api/v1/screen",
            json={"name": "Kim Jong Un", "country": "KP"}
        )
        if response1.status_code == 200:
            results.append(response1.json())
        
        # Clean person
        response2 = requests.post(
            f"{BACKEND_URL}/api/v1/screen",
            json={"name": "Safe Person Test", "country": "PA"}
        )
        if response2.status_code == 200:
            results.append(response2.json())
        
        # Generate bulk report
        report_response = requests.post(
            f"{BACKEND_URL}/api/v1/reports/generate-bulk",
            json={"results": results}
        )
        
        assert report_response.status_code == 200
        report_data = report_response.json()
        
        assert report_data["success"] is True
        assert report_data["report_type"] == "bulk"
        
        html = report_data["html_content"]
        assert "Reporte Masivo" in html or "Bulk" in html
        assert "<table" in html
        
    def test_report_percentage_validation(self, backend_server):
        """Test that generated reports have correct percentage ranges."""
        # Create screening with known confidence score
        screening_data = {
            "screening_id": "test-percentage",
            "is_hit": True,
            "hit_count": 1,
            "input": {
                "name": "Test Person",
                "country": "US"
            },
            "matches": [
                {
                    "matched_name": "Test Match",
                    "recommendation": "MANUAL_REVIEW",
                    "match_layer": 3,
                    "flags": [],
                    "entity": {
                        "id": "TEST-001",
                        "source": "OFAC",
                        "type": "individual",
                        "name": "Test Match",
                        "all_names": ["Test Match"],
                        "countries": ["US"]
                    },
                    "confidence": {
                        "overall": 75.5,  # Should appear as 75.5%, not 7550%
                        "name": 80.0,
                        "document": 0.0,
                        "dob": 0.0,
                        "nationality": 0.0,
                        "address": 0.0
                    }
                }
            ]
        }
        
        report_response = requests.post(
            f"{BACKEND_URL}/api/v1/reports/generate",
            json={"screening_data": screening_data}
        )
        
        assert report_response.status_code == 200
        html = report_response.json()["html_content"]
        
        # Confidence 75.5 should appear correctly
        assert "75.5" in html or "75.50" in html
        # Should NOT appear as wrong percentage
        assert "7550" not in html
        assert "755%" not in html


class TestDataMode:
    """Test data mode endpoint."""
    
    def test_data_mode_info(self, backend_server):
        """Test data mode information endpoint."""
        response = requests.get(f"{BACKEND_URL}/api/v1/debug/data-mode")
        
        assert response.status_code == 200
        data = response.json()
        
        assert "data_mode" in data
        assert data["data_mode"] in ["xml", "database"]
        assert "xml_entities" in data or "database_entities" in data


if __name__ == "__main__":
    # Run tests
    pytest.main([__file__, "-v", "-s", "--tb=short"])
