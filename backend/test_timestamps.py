from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from backend.auth.passwords import hash_password
from backend.normalization.normalizer import normalize_records
from backend.normalization.timestamp_handler import normalize_timestamp
from backend.pipeline import analyze_evidence_records


ORIGIN = "http://127.0.0.1:5173"


@pytest.fixture
def authenticated_client(tmp_path, monkeypatch):
    monkeypatch.setenv("TATTVA_ENV", "test")
    monkeypatch.setenv("TATTVA_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("TATTVA_CORS_ORIGINS", ORIGIN)

    from backend.api.main import create_app

    app = create_app(tmp_path)
    store = app.state.investigation_store
    store.provision_initial_admin(
        "timestamp-admin@example.test",
        hash_password("Timestamp-admin-password-123!"),
    )
    client = TestClient(app, base_url="https://testserver")
    csrf_token = client.get("/auth/csrf").json()["csrf_token"]
    login = client.post(
        "/auth/login",
        headers={"Origin": ORIGIN, "X-CSRF-Token": csrf_token},
        json={
            "username": "timestamp-admin@example.test",
            "password": "Timestamp-admin-password-123!",
        },
    )
    assert login.status_code == 200
    client.headers.update(
        {
            "Origin": ORIGIN,
            "X-CSRF-Token": login.json()["csrf_token"],
        }
    )
    yield client
    client.close()


def _record(timestamp, evidence_id):
    return {
        "evidence_id": evidence_id,
        "timestamp": timestamp,
        "source_type": "authentication",
        "original_event_type": "LOGIN_SUCCESS",
        "event_type": "LOGIN_SUCCESS",
        "raw_record_reference": evidence_id,
    }


def _upload(client, investigation_id, filename, content):
    return client.post(
        f"/investigations/{investigation_id}/evidence",
        files={"file": (filename, content, "text/plain")},
        data={"source_type": "authentication"},
    )


def test_naive_timestamp_is_preserved_as_timezone_unspecified():
    raw_timestamp = "2026-11-09 09:00:00"
    result = normalize_records(
        [
            {
                "timestamp": raw_timestamp,
                "original_event_type": "LOGIN_SUCCESS",
                "source_type": "authentication",
                "raw_record_reference": "record:1",
            }
        ]
    )

    record = result["records"][0]
    assert record.timestamp == datetime(2026, 11, 9, 9, 0)
    assert record.timestamp.tzinfo is None
    assert record.original_timestamp == raw_timestamp


def test_aware_timestamp_normalizes_to_utc_and_retains_source_value():
    raw_timestamp = "2026-11-09T14:30:00+05:30"
    normalized = normalize_timestamp(raw_timestamp)
    result = normalize_records(
        [
            {
                "timestamp": raw_timestamp,
                "original_event_type": "LOGIN_SUCCESS",
                "source_type": "authentication",
                "raw_record_reference": "record:1",
            }
        ]
    )

    record = result["records"][0]
    assert normalized == datetime(2026, 11, 9, 9, 0, tzinfo=timezone.utc)
    assert record.timestamp == normalized
    assert record.original_timestamp == raw_timestamp


def test_mixed_naive_and_aware_analysis_returns_clear_validation_error():
    with pytest.raises(
        ValueError,
        match="both timezone-aware and timezone-naive timestamps",
    ):
        analyze_evidence_records(
            [
                _record("2026-11-09 09:00:00", "EV-NAIVE"),
                _record("2026-11-09T09:00:00Z", "EV-AWARE"),
            ]
        )


def test_invalid_timestamp_upload_returns_validation_error(
    authenticated_client,
):
    response = authenticated_client.post(
        "/analyze",
        files={
            "file": (
                "invalid-time.csv",
                b"timestamp,event_type,user_id,ip_address\n"
                b"not-a-timestamp,LOGIN_SUCCESS,user01,192.0.2.1\n",
                "text/csv",
            )
        },
        data={"source_type": "authentication"},
    )

    assert response.status_code == 400
    assert "Timestamp validation failed" in response.json()["detail"]
    assert "Invalid timestamp format" in response.json()["detail"]
    assert authenticated_client.get("/investigations").json() == []


def test_mixed_upload_is_rejected_without_replacing_existing_analysis(
    authenticated_client,
):
    investigation = authenticated_client.post(
        "/investigations",
        json={"name": "Mixed timestamp case"},
    ).json()
    investigation_id = investigation["investigation_id"]

    first = _upload(
        authenticated_client,
        investigation_id,
        "naive.log",
        b"2026-11-09 09:00:00 LOGIN_FAILED user01 192.0.2.1\n",
    )
    assert first.status_code == 200
    old_analysis = authenticated_client.get(
        f"/investigations/{investigation_id}"
    ).json()["analysis"]

    second = _upload(
        authenticated_client,
        investigation_id,
        "aware.log",
        b"2026-11-09T09:01:00Z LOGIN_SUCCESS user01 192.0.2.1\n",
    )

    assert second.status_code == 400
    assert "not assumed UTC" in second.json()["detail"]
    detail = authenticated_client.get(
        f"/investigations/{investigation_id}"
    ).json()
    assert len(detail["evidence_files"]) == 1
    assert detail["analysis"] == old_analysis


def test_combined_aware_uploads_keep_original_values_and_sort_by_instant(
    authenticated_client,
):
    investigation = authenticated_client.post(
        "/investigations",
        json={"name": "Timezone-aware combined case"},
    ).json()
    investigation_id = investigation["investigation_id"]

    first = _upload(
        authenticated_client,
        investigation_id,
        "offset.log",
        b"2026-11-09T11:05:00+02:00 LOGIN_SUCCESS user01 192.0.2.1\n",
    )
    second = _upload(
        authenticated_client,
        investigation_id,
        "utc.log",
        b"2026-11-09T09:00:00Z LOGIN_FAILED user02 192.0.2.2\n",
    )
    assert first.status_code == 200
    assert second.status_code == 200

    detail = authenticated_client.get(
        f"/investigations/{investigation_id}"
    ).json()
    records = detail["analysis"]["evidence_records"]
    assert len(records) == 2
    assert records[0]["timestamp"] == "2026-11-09T09:05:00Z"
    assert records[0]["original_timestamp"] == "2026-11-09T11:05:00+02:00"
    assert records[1]["timestamp"] == "2026-11-09T09:00:00Z"
    assert records[1]["original_timestamp"] == "2026-11-09T09:00:00Z"

    timeline = authenticated_client.get(
        f"/investigations/{investigation_id}/timeline"
    )
    assert timeline.status_code == 200
    assert [
        item["original_timestamp"] for item in timeline.json()["timeline"]
    ] == [
        "2026-11-09T09:00:00Z",
        "2026-11-09T11:05:00+02:00",
    ]
