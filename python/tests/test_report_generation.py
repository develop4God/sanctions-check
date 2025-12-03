"""
Tests for report generation API endpoints

These tests verify that the report generation endpoints correctly
use the backend's report_generator.py for consistent report generation
across all channels (web, PWA, electron).
"""

import pytest
from fastapi.testclient import TestClient
from datetime import datetime


# Configure pytest-asyncio mode
pytest_plugins = ["pytest_asyncio"]


@pytest.fixture
def client():
    """Create FastAPI test client."""
    from api.server import app
    return TestClient(app)


@pytest.fixture
def sample_screening_data():
    """Sample screening data for report generation."""
    return {
        "screening_id": "test-screening-123",
        "is_hit": True,
        "hit_count": 1,
        "processing_time_ms": 150,
        "input": {
            "name": "Juan Pérez",
            "document": "8-123-456",
            "country": "PA",
            "nationality": "PA",
            "date_of_birth": "1980-05-15"
        },
        "matches": [
            {
                "matched_name": "Juan Perez Garcia",
                "recommendation": "MANUAL_REVIEW",
                "match_layer": 3,
                "flags": ["HIGH_CONFIDENCE_MATCH"],
                "entity": {
                    "id": "OFAC-12345",
                    "source": "OFAC",
                    "type": "individual",
                    "name": "Juan Perez Garcia",
                    "all_names": ["Juan Perez Garcia", "Juan P. Garcia"],
                    "firstName": "Juan",
                    "lastName": "Perez Garcia",
                    "countries": ["PA", "US"],
                    "identity_documents": [
                        {"number": "8-123-456", "type": "Passport"}
                    ],
                    "program": "SDGT",
                    "dateOfBirth": "1980-05-15",
                    "nationality": "Panamanian"
                },
                "confidence": {
                    "overall": 85.5,
                    "name": 90.0,
                    "document": 100.0,
                    "dob": 100.0,
                    "nationality": 100.0,
                    "address": 0.0
                }
            }
        ]
    }


@pytest.fixture
def sample_bulk_data():
    """Sample bulk screening data for report generation."""
    return [
        {
            "screening_id": "bulk-1",
            "is_hit": True,
            "hit_count": 1,
            "input": {
                "nombre": "María López",
                "cedula": "9-999-9999",
                "pais": "PA"
            },
            "matches": [
                {
                    "recommendation": "MANUAL_REVIEW",
                    "entity": {"source": "UN"}
                }
            ]
        },
        {
            "screening_id": "bulk-2",
            "is_hit": False,
            "hit_count": 0,
            "input": {
                "nombre": "Carlos González",
                "cedula": "8-888-8888",
                "pais": "PA"
            },
            "matches": []
        }
    ]


class TestReportGeneration:
    """Test report generation endpoints."""

    def test_generate_individual_report_success(self, client, sample_screening_data):
        """Test successful individual report generation."""
        response = client.post(
            "/api/v1/reports/generate",
            json={"screening_data": sample_screening_data}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert data["success"] is True
        assert "html_content" in data
        assert data["report_type"] == "individual"
        assert "generated_at" in data
        
        # Verify HTML content contains expected elements
        html = data["html_content"]
        assert "<!DOCTYPE html>" in html
        assert "CONSTANCIA DE VERIFICACIÓN" in html or "Sanctions Check" in html
        assert "Juan Pérez" in html or "Juan Perez" in html  # Name should appear
        assert "8-123-456" in html  # Document should appear
        
    def test_generate_individual_report_no_hit(self, client):
        """Test report generation for no-hit result."""
        data = {
            "screening_id": "test-no-hit",
            "is_hit": False,
            "hit_count": 0,
            "input": {
                "name": "Safe Person",
                "document": "1-111-1111",
                "country": "PA"
            },
            "matches": []
        }
        
        response = client.post(
            "/api/v1/reports/generate",
            json={"screening_data": data}
        )
        
        assert response.status_code == 200
        result = response.json()
        
        assert result["success"] is True
        html = result["html_content"]
        assert "SIN COINCIDENCIAS" in html or "OK" in html or "No se encontraron" in html
        
    def test_generate_bulk_report_success(self, client, sample_bulk_data):
        """Test successful bulk report generation."""
        response = client.post(
            "/api/v1/reports/generate-bulk",
            json={"results": sample_bulk_data}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert data["success"] is True
        assert "html_content" in data
        assert data["report_type"] == "bulk"
        assert "generated_at" in data
        
        # Verify HTML content
        html = data["html_content"]
        assert "<!DOCTYPE html>" in html
        assert "Reporte Masivo" in html or "Bulk" in html
        assert "María López" in html
        assert "Carlos González" in html
        
    def test_generate_bulk_report_empty_results(self, client):
        """Test bulk report with empty results."""
        response = client.post(
            "/api/v1/reports/generate-bulk",
            json={"results": []}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        
    def test_percentage_values_correct(self, client, sample_screening_data):
        """Test that confidence percentages are in correct range (0-100)."""
        response = client.post(
            "/api/v1/reports/generate",
            json={"screening_data": sample_screening_data}
        )
        
        assert response.status_code == 200
        html = response.json()["html_content"]
        
        # The confidence overall is 85.5%, should appear as "85.5" or "85.50"
        # NOT as "8550%" (which would be the bug we're fixing)
        assert "85.5" in html or "85.50" in html
        # Make sure we don't have crazy percentages
        assert "8550" not in html
        assert "825%" not in html  # The example from the problem statement
        
    def test_report_contains_metadata(self, client, sample_screening_data):
        """Test that reports contain necessary metadata."""
        response = client.post(
            "/api/v1/reports/generate",
            json={"screening_data": sample_screening_data}
        )
        
        assert response.status_code == 200
        html = response.json()["html_content"]
        
        # Should contain screening ID
        assert "test-screening-123" in html
        
        # Should contain input data
        assert "Juan" in html
        assert "PA" in html or "Panama" in html
        
        # Should contain match information if it's a hit
        if sample_screening_data["is_hit"]:
            assert "OFAC" in html or "UN" in html  # Source
            assert "MANUAL_REVIEW" in html or "REVISAR" in html  # Recommendation


class TestReportValidation:
    """Test report generation with various data validation scenarios."""
    
    def test_missing_input_fields(self, client):
        """Test report generation with minimal input data."""
        data = {
            "screening_id": "minimal-test",
            "is_hit": False,
            "hit_count": 0,
            "input": {
                "name": "Test Person"
                # Missing document, country, etc.
            },
            "matches": []
        }
        
        response = client.post(
            "/api/v1/reports/generate",
            json={"screening_data": data}
        )
        
        # Should still generate report with available data
        assert response.status_code == 200
        assert response.json()["success"] is True
        
    def test_special_characters_in_name(self, client):
        """Test report generation with special characters."""
        data = {
            "screening_id": "special-chars",
            "is_hit": False,
            "hit_count": 0,
            "input": {
                "name": "José María Ñoño O'Brien",
                "document": "E-123-456",
                "country": "PA"
            },
            "matches": []
        }
        
        response = client.post(
            "/api/v1/reports/generate",
            json={"screening_data": data}
        )
        
        assert response.status_code == 200
        html = response.json()["html_content"]
        # Special characters should be preserved or properly encoded
        assert "Jos" in html  # At least partial match
        
    def test_multiple_matches(self, client):
        """Test report with multiple matches."""
        data = {
            "screening_id": "multi-match",
            "is_hit": True,
            "hit_count": 3,
            "input": {
                "name": "Common Name",
                "country": "US"
            },
            "matches": [
                {
                    "matched_name": f"Match {i}",
                    "recommendation": "MANUAL_REVIEW",
                    "entity": {
                        "id": f"ID-{i}",
                        "source": "OFAC" if i % 2 == 0 else "UN",
                        "name": f"Match {i}",
                        "type": "individual",
                        "all_names": [f"Match {i}"],
                        "countries": ["US"]
                    },
                    "confidence": {
                        "overall": 70.0 + i * 5,
                        "name": 80.0,
                        "document": 0.0,
                        "dob": 0.0,
                        "nationality": 0.0,
                        "address": 0.0
                    },
                    "flags": [],
                    "match_layer": 3
                }
                for i in range(3)
            ]
        }
        
        response = client.post(
            "/api/v1/reports/generate",
            json={"screening_data": data}
        )
        
        assert response.status_code == 200
        html = response.json()["html_content"]
        
        # All matches should appear
        assert "Match 0" in html
        assert "Match 1" in html
        assert "Match 2" in html


class TestBulkReportFormatting:
    """Test bulk report formatting and statistics."""
    
    def test_bulk_statistics_calculation(self, client):
        """Test that bulk report calculates statistics correctly."""
        results = [
            {
                "screening_id": f"test-{i}",
                "is_hit": i % 3 == 0,  # Every 3rd is a hit
                "hit_count": 1 if i % 3 == 0 else 0,
                "input": {
                    "nombre": f"Person {i}",
                    "cedula": f"{i}-000-0000",
                    "pais": "PA"
                },
                "matches": []
            }
            for i in range(10)
        ]
        
        response = client.post(
            "/api/v1/reports/generate-bulk",
            json={"results": results}
        )
        
        assert response.status_code == 200
        html = response.json()["html_content"]
        
        # Should show 10 total
        assert "10" in html
        
        # Should show 4 hits (indices 0, 3, 6, 9)
        expected_hits = sum(1 for r in results if r["is_hit"])
        assert str(expected_hits) in html
        
    def test_bulk_report_table_structure(self, client, sample_bulk_data):
        """Test that bulk report has proper table structure."""
        response = client.post(
            "/api/v1/reports/generate-bulk",
            json={"results": sample_bulk_data}
        )
        
        assert response.status_code == 200
        html = response.json()["html_content"]
        
        # Should have table elements
        assert "<table" in html
        assert "<thead>" in html
        assert "<tbody>" in html
        assert "<tr>" in html
        assert "<td>" in html or "<th>" in html


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
