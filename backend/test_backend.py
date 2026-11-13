from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.ingestion.auth_parser import parse_auth_log
from backend.ingestion.file_parser import parse_file_log
from backend.ingestion.network_parser import parse_network_log
from backend.ingestion.archive_parser import parse_archive_log
from backend.normalization.normalizer import normalize_records
from backend.integrity.hashing import calculate_file_hash, calculate_record_hash
from backend.integrity.verification import verify_record_integrity
from backend.detection.rule_engine import run_detection
from backend.anomaly_detection.isolation_forest import detect_anomalies
from backend.anomaly_detection.evaluation import evaluate_anomaly_detection
from backend.correlation.correlation_engine import correlate_evidence
from backend.pipeline import process_evidence_file
from backend.ingestion.structured_parser import parse_structured_content
ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "test_data"
client = TestClient(app)

def load_sample(category):
    return (DATA / category / "sample.log").read_text(encoding="utf-8")

def test_all_parsers():
    parsers = {
        "authentication": parse_auth_log,
        "file_access": parse_file_log,
        "network": parse_network_log,
        "archive": parse_archive_log
    }
    for category, parser in parsers.items():
        result = parser(load_sample(category))
        assert result["successful_records"] > 0
        assert result["total_records"] == (
            result["successful_records"] + result["failed_records"]
        )

def test_normalization():
    parsed = parse_auth_log(load_sample("authentication"))
    result = normalize_records(parsed["records"], source_id="TEST-SOURCE")
    assert result["successful_records"] > 0
    assert all(record.evidence_id for record in result["records"])
    assert all(record.event_type for record in result["records"])

def test_file_hashing():
    path = DATA / "authentication" / "sample.log"
    original_hash = calculate_file_hash(path)
    assert len(original_hash) == 64
    assert calculate_file_hash(path) == original_hash

def test_record_integrity():
    record = {
        "evidence_id": "EV-0001",
        "event_type": "LOGIN_SUCCESS"
    }
    original_hash = calculate_record_hash(record)
    assert verify_record_integrity(record, original_hash)["is_intact"]
    record["event_type"] = "LOGIN_FAILED"
    assert not verify_record_integrity(record, original_hash)["is_intact"]

def test_detection_engine():
    parsed = parse_auth_log(load_sample("authentication"))
    records = normalize_records(parsed["records"])["records"]
    result = run_detection(records)
    assert result["rules_evaluated"] == 7
    assert result["total_findings"] >= 0

def test_anomaly_detection():
    parsed = parse_auth_log(load_sample("authentication"))
    records = normalize_records(parsed["records"])["records"]
    result = detect_anomalies(records)
    assert result["total_records"] == len(records)
    assert 0 <= result["anomaly_count"] <= len(records)

def test_anomaly_evaluation():
    result = evaluate_anomaly_detection(
        [0, 0, 1, 1],
        [0, 1, 1, 1]
    )
    assert result["precision"] == 0.6667
    assert result["recall"] == 1.0
    assert "false_positive_rate" in result

def test_correlation_engine():
    parsed = parse_auth_log(load_sample("authentication"))
    records = normalize_records(parsed["records"])["records"]
    result = correlate_evidence(records)
    assert "relationships" in result
    assert "graph" in result
    assert "nodes" in result["graph"]
    assert "edges" in result["graph"]

@pytest.mark.parametrize("category", [
    "authentication", "file_access", "network", "archive"
])
def test_complete_pipeline(category):
    source_type = "file" if category == "file_access" else category
    path = DATA / category / "sample.log"
    result = process_evidence_file(path, source_type)
    assert result["source_id"]
    assert result["metadata"]["sha256"]
    assert result["evidence_records"]
    assert "detection" in result
    assert "anomaly_detection" in result
    assert "correlation" in result

def test_api_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"

@pytest.mark.parametrize("filename,source_type,expected_records", [
    ("sample.csv", "authentication", 5),
    ("sample.json", "authentication", 3)
])
def test_api_structured_upload(filename, source_type, expected_records):
    path = DATA / "authentication" / filename
    with path.open("rb") as file:
        response = client.post(
            "/analyze",
            files={"file": (filename, file, "application/octet-stream")},
            data={"source_type": source_type}
        )
    assert response.status_code == 200
    result = response.json()
    assert result["ingestion"]["successful_records"] == expected_records
    assert result["normalization"]["successful_records"] == expected_records
    assert len(result["evidence_records"]) == expected_records

def test_api_rejects_invalid_source():
    response = client.post(
        "/analyze",
        files={"file": ("sample.log", b"test", "text/plain")},
        data={"source_type": "invalid"}
    )
    assert response.status_code == 400

def test_csv_ingestion():
    path = DATA / "authentication" / "sample.csv"
    result = process_evidence_file(path, "authentication")
    assert result["ingestion"]["successful_records"] == 5
    assert len(result["evidence_records"]) == 5

def test_json_ingestion():
    path = DATA / "authentication" / "sample.json"
    result = process_evidence_file(path, "authentication")
    assert result["ingestion"]["successful_records"] == 3
    assert len(result["evidence_records"]) == 3

def test_malformed_json():
    with pytest.raises(ValueError):
        parse_structured_content(
            '{"records": [invalid]}',
            "authentication",
            ".json"
        )

def test_invalid_structured_record():
    result = parse_structured_content(
        '[{"user_id": "user01"}]',
        "authentication",
        ".json"
    )
    assert result["successful_records"] == 0
    assert result["failed_records"] == 1

@pytest.fixture
def uploaded_investigation():
    path = DATA / "authentication" / "sample.log"
    with path.open("rb") as file:
        response = client.post(
            "/analyze",
            files={"file": ("sample.log", file, "text/plain")},
            data={"source_type": "authentication"}
        )
    assert response.status_code == 200
    return response.json()["investigation_id"]


def test_investigation_summary(uploaded_investigation):
    response = client.get(
        f"/investigations/{uploaded_investigation}/summary"
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total_evidence"] > 0
    assert "severity_breakdown" in data


def test_investigation_findings(uploaded_investigation):
    response = client.get(
        f"/investigations/{uploaded_investigation}/findings"
    )
    assert response.status_code == 200
    assert "findings" in response.json()


def test_investigation_anomalies(uploaded_investigation):
    response = client.get(
        f"/investigations/{uploaded_investigation}/anomalies"
    )
    assert response.status_code == 200
    assert "anomalies" in response.json()


def test_investigation_timeline(uploaded_investigation):
    response = client.get(
        f"/investigations/{uploaded_investigation}/timeline"
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total_events"] > 0
    assert "timeline" in data


def test_investigation_graph(uploaded_investigation):
    response = client.get(
        f"/investigations/{uploaded_investigation}/graph"
    )
    assert response.status_code == 200
    assert "nodes" in response.json()
    assert "edges" in response.json()


def test_unknown_investigation():
    response = client.get("/investigations/INV-INVALID/summary")
    assert response.status_code == 404