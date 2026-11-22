import atexit
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import pytest
from fastapi.testclient import TestClient

from backend.api.main import create_app
from backend.auth.passwords import hash_password
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
_TEST_DATA_DIRECTORY = TemporaryDirectory(prefix="tattva-backend-tests-")


def _create_test_app(data_directory):
    env_values = {
        "TATTVA_ENV": os.environ.get("TATTVA_ENV"),
        "TATTVA_CORS_ORIGINS": os.environ.get("TATTVA_CORS_ORIGINS"),
    }
    os.environ["TATTVA_ENV"] = "test"
    os.environ["TATTVA_CORS_ORIGINS"] = "http://127.0.0.1:5173"
    try:
        return create_app(data_directory)
    finally:
        for key, value in env_values.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


def _authenticated_client(data_directory):
    application = _create_test_app(data_directory)
    store = application.state.investigation_store
    if not store.has_admin():
        store.provision_initial_admin(
            "test-admin",
            hash_password("test-admin-password"),
        )
    client = TestClient(application, base_url="https://testserver")
    csrf_token = client.get("/auth/csrf").json()["csrf_token"]
    response = client.post(
        "/auth/login",
        headers={
            "Origin": "http://127.0.0.1:5173",
            "X-CSRF-Token": csrf_token,
        },
        json={
            "username": "test-admin",
            "password": "test-admin-password",
        },
    )
    assert response.status_code == 200
    client.headers.update(
        {
            "Origin": "http://127.0.0.1:5173",
            "X-CSRF-Token": response.json()["csrf_token"],
        }
    )
    return client


client = _authenticated_client(_TEST_DATA_DIRECTORY.name)
atexit.register(client.close)

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


def test_create_list_retrieve_and_update_investigation(tmp_path):
    test_client = _authenticated_client(tmp_path)

    created = test_client.post(
        "/investigations",
        json={"name": "Incident 42", "description": "Initial description"}
    )
    assert created.status_code == 201
    investigation = created.json()
    investigation_id = investigation["investigation_id"]
    assert investigation["name"] == "Incident 42"
    assert investigation["status"] == "open"

    listed = test_client.get("/investigations")
    assert listed.status_code == 200
    assert listed.json()[0]["investigation_id"] == investigation_id

    retrieved = test_client.get(f"/investigations/{investigation_id}")
    assert retrieved.status_code == 200
    assert retrieved.json()["description"] == "Initial description"

    updated = test_client.patch(
        f"/investigations/{investigation_id}",
        json={"name": "Incident 42 - reviewed", "status": "in_progress"}
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Incident 42 - reviewed"
    assert updated.json()["status"] == "in_progress"


def test_multiple_uploads_are_combined_and_keep_file_metadata(tmp_path):
    test_client = _authenticated_client(tmp_path)
    created = test_client.post(
        "/investigations",
        json={"name": "Combined evidence case"}
    )
    investigation_id = created.json()["investigation_id"]

    first_content = (
        b"2026-11-09 09:00:00 LOGIN_FAILED user01 192.168.1.10\n"
        b"2026-11-09 09:01:00 LOGIN_FAILED user01 192.168.1.10\n"
    )
    second_content = (
        b"2026-11-09 09:02:00 LOGIN_FAILED user01 192.168.1.10\n"
    )
    for filename, content in (
        ("auth-first.log", first_content),
        ("auth-second.log", second_content),
    ):
        response = test_client.post(
            f"/investigations/{investigation_id}/evidence",
            files={"file": (filename, content, "text/plain")},
            data={"source_type": "authentication"},
        )
        assert response.status_code == 200
        assert response.json()["investigation_id"] == investigation_id

    detail = test_client.get(f"/investigations/{investigation_id}").json()
    records = detail["analysis"]["evidence_records"]
    assert len(records) == 3
    assert len({record["evidence_id"] for record in records}) == 3
    assert len({record["source_id"] for record in records}) == 2
    assert any(
        finding["rule_id"] == "R01"
        for finding in detail["analysis"]["detection"]["findings"]
    )
    assert [item["filename"] for item in detail["evidence_files"]] == [
        "auth-first.log",
        "auth-second.log",
    ]
    for item in detail["evidence_files"]:
        evidence_path = Path(item["file_path"])
        assert evidence_path.is_file()
        assert evidence_path.name != item["filename"]
        assert len(item["sha256"]) == 64

    summary = test_client.get(
        f"/investigations/{investigation_id}/summary"
    ).json()
    assert summary["total_evidence"] == 3
    assert test_client.get("/investigations").json()[0][
        "evidence_file_count"
    ] == 2


def test_investigations_and_evidence_survive_app_reinitialization(tmp_path):
    first_client = _authenticated_client(tmp_path)
    created = first_client.post(
        "/investigations",
        json={"name": "Persistent case"}
    ).json()
    investigation_id = created["investigation_id"]
    upload = first_client.post(
        f"/investigations/{investigation_id}/evidence",
        files={
            "file": (
                "persistent.log",
                b"2026-11-09 09:00:00 LOGIN_SUCCESS user02 192.168.1.15\n",
                "text/plain",
            )
        },
        data={"source_type": "authentication"},
    )
    assert upload.status_code == 200
    baseline_analysis_id = upload.json()["baseline_analysis_id"]

    restored_client = _authenticated_client(tmp_path)
    restored_app = restored_client.app
    restored = restored_client.get(
        f"/investigations/{investigation_id}"
    )
    assert restored.status_code == 200
    assert restored.json()["analysis"]["evidence_records"]
    assert restored_client.get(
        f"/investigations/{investigation_id}/summary"
    ).status_code == 200
    assert restored_client.get(
        f"/investigations/{investigation_id}/findings"
    ).status_code == 200
    assert restored_app.state.simulation_evidence_store[investigation_id]
    assert baseline_analysis_id in restored_app.state.baseline_analysis_store


def test_analyze_response_remains_compatible_and_file_is_durable():
    path = DATA / "authentication" / "sample.log"
    with path.open("rb") as file:
        response = client.post(
            "/analyze",
            files={"file": ("original-auth-name.log", file, "text/plain")},
            data={"source_type": "authentication"}
        )

    assert response.status_code == 200
    result = response.json()
    assert set(result) == {
        "source_id",
        "metadata",
        "ingestion",
        "normalization",
        "evidence_records",
        "detection",
        "anomaly_detection",
        "correlation",
        "investigation_id",
        "baseline_analysis_id",
    }
    assert result["metadata"]["filename"] == "original-auth-name.log"
    assert Path(result["metadata"]["file_path"]).is_file()
    assert result["evidence_records"][0]["evidence_id"] == "EV-0001"


def test_simulator_uses_persisted_investigation_evidence():
    created = client.post(
        "/investigations",
        json={"name": "Simulator integration"}
    ).json()
    investigation_id = created["investigation_id"]
    upload = client.post(
        f"/investigations/{investigation_id}/evidence",
        files={
            "file": (
                "simulator.log",
                b"2026-11-09 09:00:00 LOGIN_SUCCESS user01 192.168.1.10\n"
                b"2026-11-09 09:01:00 LOGIN_FAILED user02 192.168.1.15\n",
                "text/plain",
            )
        },
        data={"source_type": "authentication"},
    )
    assert upload.status_code == 200
    analysis = upload.json()["analysis"]

    scenario = client.post(
        "/api/simulations",
        json={
            "investigation_id": investigation_id,
            "baseline_analysis_id": analysis["baseline_analysis_id"],
            "scenario_name": "Exclude one record",
            "description": "Simulator integration test",
        },
    )
    assert scenario.status_code == 201
    scenario_id = scenario.json()["scenario_id"]
    excluded = client.post(
        f"/api/simulations/{scenario_id}/exclude",
        json={
            "evidence_id": analysis["evidence_records"][0]["evidence_id"]
        },
    )
    assert excluded.status_code == 200
    run = client.post(f"/api/simulations/{scenario_id}/run")
    assert run.status_code == 200
    assert run.json()["result"]["status"] == "COMPLETED"