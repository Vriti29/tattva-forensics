import hashlib
import sqlite3
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from backend.api.main import create_app
from backend.auth.passwords import hash_password


ADMIN_USERNAME = "root@example.test"
ADMIN_PASSWORD = "Admin123"


def _client_for(
    app,
    username=None,
    password=None,
    base_url="https://testserver",
):
    client = TestClient(app, base_url=base_url)
    csrf_token = client.get("/auth/csrf").json()["csrf_token"]
    client.headers.update(
        {
            "Origin": "http://127.0.0.1:5173",
            "X-CSRF-Token": csrf_token,
        }
    )
    if username is not None:
        response = client.post(
            "/auth/login",
            json={"username": username, "password": password},
        )
        if response.status_code == 200:
            client.headers.update(
                {"X-CSRF-Token": response.json()["csrf_token"]}
            )
        return client, response
    return client, None


@pytest.fixture
def auth_system(tmp_path, monkeypatch):
    monkeypatch.setenv("TATTVA_ENV", "test")
    monkeypatch.setenv(
        "TATTVA_CORS_ORIGINS",
        "http://127.0.0.1:5173,https://ui.example.test",
    )
    monkeypatch.setenv("TATTVA_SESSION_TTL_SECONDS", "3600")
    app = create_app(tmp_path)
    store = app.state.investigation_store
    admin = store.provision_initial_admin(
        ADMIN_USERNAME,
        hash_password(ADMIN_PASSWORD),
    )
    client, response = _client_for(app, ADMIN_USERNAME, ADMIN_PASSWORD)
    assert response.status_code == 200
    return app, store, admin, client


def _create_investigation(client, name="Protected investigation"):
    response = client.post("/investigations", json={"name": name})
    assert response.status_code == 201
    return response.json()["investigation_id"]


def _create_user(client, username, password, role):
    response = client.post(
        "/users",
        json={"username": username, "password": password, "role": role},
    )
    assert response.status_code == 201
    return response.json()


def _login(app, username, password):
    client, response = _client_for(app, username, password)
    return client, response


def _create_active_assigned_user(
    app,
    admin_client,
    investigation_id,
    username,
    role="INVESTIGATOR",
):
    initial_password = "TempPass123"
    changed_password = "Changed123"
    user = _create_user(admin_client, username, initial_password, role)
    assignment = admin_client.post(
        f"/investigations/{investigation_id}/assignments",
        json={"user_id": user["user_id"]},
    )
    assert assignment.status_code == 201

    initial_client, response = _login(app, username, initial_password)
    assert response.status_code == 200
    change = initial_client.post(
        "/auth/password",
        json={
            "current_password": initial_password,
            "new_password": changed_password,
        },
    )
    assert change.status_code == 204
    assert initial_client.get("/auth/me").status_code == 401

    active_client, response = _login(app, username, changed_password)
    assert response.status_code == 200
    return user, assignment.json()["assignment_id"], active_client


def test_login_uses_secure_cookie_and_stores_only_token_hash(auth_system):
    app, store, admin, client = auth_system
    csrf = client.get("/auth/csrf")
    assert csrf.status_code == 200
    token = csrf.json()["csrf_token"]
    response = client.post(
        "/auth/login",
        headers={"X-CSRF-Token": token},
        json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD},
    )

    assert response.status_code == 200
    assert response.json()["user"]["user_id"] == admin["user_id"]
    assert "session_token" not in response.json()
    session_cookie = response.cookies.get("tattva_session")
    assert session_cookie
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie
    assert "secure" in cookie
    assert "samesite=lax" in cookie
    assert client.get("/auth/me").json()["role"] == "ADMIN"

    with sqlite3.connect(store.database_path) as connection:
        stored_hashes = [
            row[0]
            for row in connection.execute("SELECT token_hash FROM sessions")
        ]
    assert session_cookie not in stored_hashes
    assert len(stored_hashes[-1]) == 64
    assert hashlib.sha256(session_cookie.encode("utf-8")).hexdigest() in (
        stored_hashes
    )


def test_invalid_and_inactive_credentials_are_rejected(auth_system):
    app, store, admin, client = auth_system
    _, response = _login(app, ADMIN_USERNAME, "not-the-password")
    assert response.status_code == 401

    created = _create_user(
        client,
        "inactive@example.test",
        "TempPass123",
        "INVESTIGATOR",
    )
    active_client, active_response = _login(
        app,
        "inactive@example.test",
        "TempPass123",
    )
    assert active_response.status_code == 200
    store.update_user(created["user_id"], is_active=False)
    assert active_client.get("/auth/me").status_code == 401
    inactive, response = _login(
        app,
        "inactive@example.test",
        "TempPass123",
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid username or password"


def test_login_rate_limit_blocks_repeated_password_guesses(auth_system):
    app, _, _, _ = auth_system
    client, _ = _client_for(app)

    for _ in range(5):
        response = client.post(
            "/auth/login",
            json={"username": ADMIN_USERNAME, "password": "wrong-password"},
        )
        assert response.status_code == 401

    blocked = client.post(
        "/auth/login",
        json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD},
    )
    assert blocked.status_code == 429
    assert blocked.headers["retry-after"].isdigit()
    assert blocked.json()["detail"] == (
        "Too many login attempts. Try again later."
    )


def test_session_expiration_logout_and_immediate_revocation(auth_system):
    app, store, admin, client = auth_system
    expired_token = "expired-test-token"
    expiry = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
    store.create_session(admin["user_id"], expired_token, expiry)
    expired_client = TestClient(app, base_url="https://testserver")
    expired_client.cookies.set(
        "tattva_session",
        expired_token,
        domain="testserver",
        path="/",
    )
    assert expired_client.get("/auth/me").status_code == 401

    client, response = _login(app, ADMIN_USERNAME, ADMIN_PASSWORD)
    assert response.status_code == 200
    session_cookie = client.cookies.get("tattva_session")
    logout_response = client.post("/auth/logout")
    assert logout_response.status_code == 204
    assert client.get("/auth/me").status_code == 401
    session = store.get_session_by_token(session_cookie)
    assert session["revoked_at"] is not None


def test_password_change_revokes_all_existing_sessions(auth_system):
    app, _, _, admin_client = auth_system
    investigation_id = _create_investigation(admin_client)
    username = "password-revocation@example.test"
    _, _, first_client = _create_active_assigned_user(
        app,
        admin_client,
        investigation_id,
        username,
    )
    second_client, response = _login(
        app,
        username,
        "Changed123",
    )
    assert response.status_code == 200
    assert first_client.get(
        f"/investigations/{investigation_id}"
    ).status_code == 200
    assert second_client.get(
        f"/investigations/{investigation_id}"
    ).status_code == 200

    changed = second_client.post(
        "/auth/password",
        json={
            "current_password": "Changed123",
            "new_password": "FinalPass123",
        },
    )
    assert changed.status_code == 204
    assert first_client.get(
        f"/investigations/{investigation_id}"
    ).status_code == 401
    assert second_client.get(
        f"/investigations/{investigation_id}"
    ).status_code == 401

    replacement, response = _login(
        app,
        username,
        "FinalPass123",
    )
    assert response.status_code == 200
    assert replacement.get(
        f"/investigations/{investigation_id}"
    ).status_code == 200


def test_deactivation_rejects_an_existing_session(auth_system):
    app, _, _, admin_client = auth_system
    investigation_id = _create_investigation(admin_client)
    user, _, active_client = _create_active_assigned_user(
        app,
        admin_client,
        investigation_id,
        "deactivation-session@example.test",
    )
    assert active_client.get(
        f"/investigations/{investigation_id}"
    ).status_code == 200

    deactivated = admin_client.patch(
        f"/users/{user['user_id']}",
        json={"is_active": False},
    )
    assert deactivated.status_code == 200
    assert active_client.get(
        f"/investigations/{investigation_id}"
    ).status_code == 401


def test_role_changes_apply_to_an_existing_session(auth_system):
    app, _, _, admin_client = auth_system
    investigation_id = _create_investigation(admin_client)
    user, _, active_client = _create_active_assigned_user(
        app,
        admin_client,
        investigation_id,
        "role-session@example.test",
        role="VIEWER",
    )
    upload = {
        "files": {
            "file": (
                "role-change.log",
                b"2026-11-09 09:00:00 LOGIN_FAILED user01 192.168.1.10\n",
                "text/plain",
            )
        },
        "data": {"source_type": "authentication"},
    }

    denied = active_client.post(
        f"/investigations/{investigation_id}/evidence",
        **upload,
    )
    assert denied.status_code == 403

    promoted = admin_client.patch(
        f"/users/{user['user_id']}",
        json={"role": "INVESTIGATOR"},
    )
    assert promoted.status_code == 200
    assert active_client.post(
        f"/investigations/{investigation_id}/evidence",
        **upload,
    ).status_code == 200

    demoted = admin_client.patch(
        f"/users/{user['user_id']}",
        json={"role": "VIEWER"},
    )
    assert demoted.status_code == 200
    assert active_client.post(
        f"/investigations/{investigation_id}/evidence",
        **upload,
    ).status_code == 403


def test_assignment_revocation_denies_an_existing_session(auth_system):
    app, _, _, admin_client = auth_system
    investigation_id = _create_investigation(admin_client)
    _, assignment_id, active_client = _create_active_assigned_user(
        app,
        admin_client,
        investigation_id,
        "assignment-session@example.test",
    )
    assert active_client.get(
        f"/investigations/{investigation_id}"
    ).status_code == 200

    revoked = admin_client.delete(
        f"/investigations/{investigation_id}/assignments/{assignment_id}"
    )
    assert revoked.status_code == 204
    assert active_client.get(
        f"/investigations/{investigation_id}"
    ).status_code == 404


def test_logout_preserves_other_sessions_until_password_change(auth_system):
    app, _, _, admin_client = auth_system
    investigation_id = _create_investigation(admin_client)
    username = "multiple-sessions@example.test"
    _, _, logout_client = _create_active_assigned_user(
        app,
        admin_client,
        investigation_id,
        username,
    )
    remaining_client, response = _login(
        app,
        username,
        "Changed123",
    )
    assert response.status_code == 200
    other_client, response = _login(
        app,
        username,
        "Changed123",
    )
    assert response.status_code == 200

    assert logout_client.post("/auth/logout").status_code == 204
    assert logout_client.get("/auth/me").status_code == 401
    assert remaining_client.get(
        f"/investigations/{investigation_id}"
    ).status_code == 200
    assert other_client.get(
        f"/investigations/{investigation_id}"
    ).status_code == 200

    changed = remaining_client.post(
        "/auth/password",
        json={
            "current_password": "Changed123",
            "new_password": "FinalPass123",
        },
    )
    assert changed.status_code == 204
    assert remaining_client.get("/auth/me").status_code == 401
    assert other_client.get(
        f"/investigations/{investigation_id}"
    ).status_code == 401

    replacement, response = _login(
        app,
        username,
        "FinalPass123",
    )
    assert response.status_code == 200
    assert replacement.get(
        f"/investigations/{investigation_id}"
    ).status_code == 200


def test_authentication_required_for_investigation_and_simulator_routes(
    auth_system,
):
    app, _, _, _ = auth_system
    anonymous = TestClient(app, base_url="https://testserver")

    assert anonymous.get("/investigations").status_code == 401
    assert anonymous.get("/api/simulations").status_code == 401
    assert anonymous.get("/users").status_code == 401


def test_admin_user_management_and_last_admin_protection(auth_system):
    app, store, admin, client = auth_system
    created = _create_user(
        client,
        "analyst@example.test",
        "Initial123",
        "VIEWER",
    )
    assert created["password_change_required"]
    assert "password_hash" not in created

    listed = client.get("/users")
    assert listed.status_code == 200
    assert {item["user_id"] for item in listed.json()} >= {
        admin["user_id"],
        created["user_id"],
    }
    assert client.get(f"/users/{created['user_id']}").status_code == 200

    changed = client.patch(
        f"/users/{created['user_id']}",
        json={"role": "INVESTIGATOR", "is_active": False},
    )
    assert changed.status_code == 200
    assert changed.json()["role"] == "INVESTIGATOR"
    assert not changed.json()["is_active"]

    activated = client.patch(
        f"/users/{created['user_id']}",
        json={"is_active": True},
    )
    assert activated.status_code == 200
    reset = client.post(
        f"/users/{created['user_id']}/password-reset",
        json={"password": "Reset123"},
    )
    assert reset.status_code == 204
    reset_client, reset_login = _login(
        app,
        "analyst@example.test",
        "Reset123",
    )
    assert reset_login.status_code == 200
    assert reset_client.get("/users").status_code == 403
    assert reset_client.post(
        "/auth/password",
        json={
            "current_password": "Reset123",
            "new_password": "PostReset123",
        },
    ).status_code == 204
    assert client.patch(
        f"/users/{admin['user_id']}",
        json={"is_active": False},
    ).status_code == 409


def test_investigator_assigned_access_and_cross_case_isolation(auth_system):
    app, store, admin, admin_client = auth_system
    assigned_case = _create_investigation(admin_client, "Assigned")
    unassigned_case = _create_investigation(admin_client, "Unassigned")
    investigator = _create_user(
        admin_client,
        "investigator@example.test",
        "Invest123",
        "INVESTIGATOR",
    )
    assignment = admin_client.post(
        f"/investigations/{assigned_case}/assignments",
        json={"user_id": investigator["user_id"], "reason": "Case work"},
    )
    assert assignment.status_code == 201
    admin_client.post(
        f"/investigations/{assigned_case}/evidence",
        files={
            "file": (
                "assigned.log",
                b"2026-11-09 09:00:00 LOGIN_FAILED user01 192.168.1.10\n",
                "text/plain",
            )
        },
        data={"source_type": "authentication"},
    )

    investigator_client, login_response = _login(
        app,
        "investigator@example.test",
        "Invest123",
    )
    assert login_response.status_code == 200
    changed = investigator_client.post(
        "/auth/password",
        json={
            "current_password": "Invest123",
            "new_password": "Changed123",
        },
    )
    assert changed.status_code == 204
    investigator_client, login_response = _login(
        app,
        "investigator@example.test",
        "Changed123",
    )
    assert login_response.status_code == 200

    listed = investigator_client.get("/investigations")
    assert [
        item["investigation_id"] for item in listed.json()
    ] == [assigned_case]
    assert investigator_client.get(
        f"/investigations/{assigned_case}"
    ).status_code == 200
    for endpoint in (
        "summary",
        "findings",
        "anomalies",
        "timeline",
        "graph",
    ):
        assert investigator_client.get(
            f"/investigations/{assigned_case}/{endpoint}"
        ).status_code == 200
    assert investigator_client.get(
        f"/investigations/{unassigned_case}"
    ).status_code == 404
    assert investigator_client.get(
        f"/investigations/{unassigned_case}/summary"
    ).status_code == 404
    assert investigator_client.patch(
        f"/investigations/{assigned_case}",
        json={"description": "not allowed"},
    ).status_code == 403

    upload = investigator_client.post(
        f"/investigations/{assigned_case}/evidence",
        files={
            "file": (
                "added.log",
                b"2026-11-09 09:01:00 LOGIN_FAILED user01 192.168.1.10\n",
                "text/plain",
            )
        },
        data={"source_type": "authentication"},
    )
    assert upload.status_code == 200
    detail = store.get_investigation(assigned_case)
    assert len(detail["evidence_files"]) == 2
    with sqlite3.connect(store.database_path) as connection:
        uploaders = connection.execute(
            """
            SELECT COUNT(*) FROM evidence_files
            WHERE investigation_id = ? AND uploader_user_id = ?
            """,
            (assigned_case, investigator["user_id"]),
        ).fetchone()[0]
    assert uploaders == 1


def test_viewer_is_read_only_and_admin_only_routes_are_denied(auth_system):
    app, _, _, admin_client = auth_system
    investigation_id = _create_investigation(admin_client)
    viewer = _create_user(
        admin_client,
        "viewer@example.test",
        "Viewer123",
        "VIEWER",
    )
    assert admin_client.post(
        f"/investigations/{investigation_id}/assignments",
        json={"user_id": viewer["user_id"]},
    ).status_code == 201
    viewer_client, response = _login(
        app,
        "viewer@example.test",
        "Viewer123",
    )
    assert response.status_code == 200
    viewer_client.post(
        "/auth/password",
        json={
            "current_password": "Viewer123",
            "new_password": "ViewUp123",
        },
    )
    viewer_client, response = _login(
        app,
        "viewer@example.test",
        "ViewUp123",
    )
    assert response.status_code == 200
    assert viewer_client.get(
        f"/investigations/{investigation_id}"
    ).status_code == 200
    assert viewer_client.post(
        f"/investigations/{investigation_id}/evidence",
        files={"file": ("file.log", b"data", "text/plain")},
        data={"source_type": "authentication"},
    ).status_code == 403
    assert viewer_client.patch(
        f"/investigations/{investigation_id}",
        json={"description": "not allowed"},
    ).status_code == 403
    assert viewer_client.get("/users").status_code == 403
    assert viewer_client.post(
        "/users",
        json={
            "username": "unauthorized@example.test",
            "password": "New-password-123",
            "role": "INVESTIGATOR",
        },
    ).status_code == 403


def test_lead_can_manage_memberships_only_for_assigned_cases(auth_system):
    app, _, _, admin_client = auth_system
    assigned_case = _create_investigation(admin_client, "Lead case")
    other_case = _create_investigation(admin_client, "Other case")
    lead = _create_user(
        admin_client,
        "lead@example.test",
        "LeadPass123",
        "LEAD_INVESTIGATOR",
    )
    investigator = _create_user(
        admin_client,
        "lead-assignee@example.test",
        "Assign123",
        "INVESTIGATOR",
    )
    assert admin_client.post(
        f"/investigations/{assigned_case}/assignments",
        json={"user_id": lead["user_id"]},
    ).status_code == 201

    lead_client, response = _login(
        app,
        "lead@example.test",
        "LeadPass123",
    )
    assert response.status_code == 200
    assert lead_client.post(
        "/auth/password",
        json={
            "current_password": "LeadPass123",
            "new_password": "LeadUp123",
        },
    ).status_code == 204
    lead_client, response = _login(
        app,
        "lead@example.test",
        "LeadUp123",
    )
    assert response.status_code == 200
    assert lead_client.patch(
        f"/investigations/{assigned_case}",
        json={"description": "Lead-reviewed"},
    ).status_code == 200
    assignment = lead_client.post(
        f"/investigations/{assigned_case}/assignments",
        json={"user_id": investigator["user_id"], "reason": "Lead assignment"},
    )
    assert assignment.status_code == 201
    assert lead_client.get(
        f"/investigations/{assigned_case}/assignments"
    ).status_code == 200
    assert lead_client.post(
        f"/investigations/{other_case}/assignments",
        json={"user_id": investigator["user_id"]},
    ).status_code == 404
    assert lead_client.delete(
        f"/investigations/{assigned_case}/assignments/"
        f"{assignment.json()['assignment_id']}"
    ).status_code == 204


def test_csrf_cors_and_legacy_analyze_compatibility(auth_system):
    app, _, _, admin_client = auth_system
    no_csrf = admin_client.post(
        "/investigations",
        json={"name": "Blocked"},
        headers={"X-CSRF-Token": ""},
    )
    assert no_csrf.status_code == 403
    valid_csrf = admin_client.get("/auth/csrf").json()["csrf_token"]
    admin_client.headers.update({"X-CSRF-Token": valid_csrf})
    wrong_origin = admin_client.post(
        "/investigations",
        json={"name": "Blocked origin"},
        headers={
            "Origin": "https://attacker.example",
            "X-CSRF-Token": valid_csrf,
        },
    )
    assert wrong_origin.status_code == 403

    preflight = admin_client.options(
        "/investigations",
        headers={
            "Origin": "http://127.0.0.1:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,x-csrf-token",
        },
    )
    assert preflight.status_code == 200
    assert preflight.headers["access-control-allow-origin"] == (
        "http://127.0.0.1:5173"
    )
    denied_origin = admin_client.options(
        "/investigations",
        headers={
            "Origin": "https://attacker.example",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert denied_origin.status_code == 400

    response = admin_client.post(
        "/analyze",
        files={
            "file": (
                "legacy.log",
                b"2026-11-09 09:00:00 LOGIN_SUCCESS user02 192.168.1.15\n",
                "text/plain",
            )
        },
        data={"source_type": "authentication"},
    )
    assert response.status_code == 200
    assert set(response.json()) == {
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


def test_simulator_authorization_for_assigned_investigator_and_viewer(auth_system):
    app, store, _, admin_client = auth_system
    investigation_id = _create_investigation(admin_client, "Simulator case")
    unassigned_id = _create_investigation(admin_client, "Unassigned simulator")
    upload = admin_client.post(
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
    analysis = upload.json()["analysis"]
    unassigned_upload = admin_client.post(
        f"/investigations/{unassigned_id}/evidence",
        files={
            "file": (
                "other-simulator.log",
                b"2026-11-09 09:02:00 LOGIN_FAILED user03 192.168.1.11\n",
                "text/plain",
            )
        },
        data={"source_type": "authentication"},
    )
    unassigned_analysis = unassigned_upload.json()["analysis"]
    unassigned_scenario = admin_client.post(
        "/api/simulations",
        json={
            "investigation_id": unassigned_id,
            "baseline_analysis_id": unassigned_analysis[
                "baseline_analysis_id"
            ],
            "scenario_name": "Unassigned scenario",
        },
    ).json()
    investigator = _create_user(
        admin_client,
        "simulator-user@example.test",
        "SimPass123",
        "INVESTIGATOR",
    )
    viewer = _create_user(
        admin_client,
        "simulator-viewer@example.test",
        "Viewer123",
        "VIEWER",
    )
    for user in (investigator, viewer):
        assert admin_client.post(
            f"/investigations/{investigation_id}/assignments",
            json={"user_id": user["user_id"]},
        ).status_code == 201

    investigator_client, login_response = _login(
        app,
        "simulator-user@example.test",
        "SimPass123",
    )
    assert login_response.status_code == 200
    investigator_client.post(
        "/auth/password",
        json={
            "current_password": "SimPass123",
            "new_password": "SimUp123",
        },
    )
    investigator_client, login_response = _login(
        app,
        "simulator-user@example.test",
        "SimUp123",
    )
    scenario = investigator_client.post(
        "/api/simulations",
        json={
            "investigation_id": investigation_id,
            "baseline_analysis_id": analysis["baseline_analysis_id"],
            "scenario_name": "Authorized scenario",
            "actor_user_id": "forged-user-id",
        },
    )
    assert scenario.status_code == 201
    scenario_id = scenario.json()["scenario_id"]
    assert investigator_client.post(
        f"/api/simulations/{scenario_id}/exclude",
        json={
            "evidence_id": analysis["evidence_records"][0]["evidence_id"]
        },
    ).status_code == 200
    scenario_history = investigator_client.get(
        f"/api/simulations/{scenario_id}/history"
    )
    assert scenario_history.status_code == 200
    actor_user_id = investigator_client.get("/auth/me").json()["user_id"]
    assert {
        item["actor_user_id"] for item in scenario_history.json()
    } == {actor_user_id}
    audit_events = store.list_audit_events(investigation_id)
    assert any(
        event["action"] == "SIMULATOR_EVENT_EXCLUDED"
        and event["actor_user_id"] == actor_user_id
        and event["target_id"] == scenario_id
        for event in audit_events
    )
    assert any(
        event["action"] == "SIMULATOR_SCENARIO_CREATED"
        and event["actor_user_id"] == actor_user_id
        and event["target_id"] == scenario_id
        for event in audit_events
    )
    assert investigator_client.get(
        f"/api/simulations/{scenario_id}"
    ).status_code == 200
    assert investigator_client.post(
        f"/api/simulations/{scenario_id}/run"
    ).status_code == 200
    assert investigator_client.get(
        f"/api/simulations/{scenario_id}/compare"
    ).status_code == 200
    assert investigator_client.get(
        f"/api/simulations/{scenario_id}/history"
    ).status_code == 200
    assert investigator_client.get(
        f"/api/simulations/{unassigned_scenario['scenario_id']}"
    ).status_code == 404

    viewer_client, login_response = _login(
        app,
        "simulator-viewer@example.test",
        "Viewer123",
    )
    assert login_response.status_code == 200
    viewer_client.post(
        "/auth/password",
        json={
            "current_password": "Viewer123",
            "new_password": "ViewSim123",
        },
    )
    viewer_client, login_response = _login(
        app,
        "simulator-viewer@example.test",
        "ViewSim123",
    )
    assert viewer_client.get(
        f"/api/simulations/{scenario_id}"
    ).status_code == 200
    assert viewer_client.post(
        f"/api/simulations/{scenario_id}/reset"
    ).status_code == 403


def test_development_http_cookie_is_loopback_only(tmp_path, monkeypatch):
    monkeypatch.setenv("TATTVA_ENV", "development")
    monkeypatch.setenv(
        "TATTVA_CORS_ORIGINS",
        "http://127.0.0.1:5173",
    )
    app = create_app(tmp_path)
    store = app.state.investigation_store
    store.provision_initial_admin(
        ADMIN_USERNAME,
        hash_password(ADMIN_PASSWORD),
    )
    _, response = _client_for(
        app,
        ADMIN_USERNAME,
        ADMIN_PASSWORD,
        base_url="http://127.0.0.1",
    )
    assert response.status_code == 200
    assert "secure" not in response.headers["set-cookie"].lower()

    remote_client = TestClient(app, base_url="https://testserver")
    remote_csrf = remote_client.get("/auth/csrf").json()["csrf_token"]
    remote_response = remote_client.post(
        "/auth/login",
        headers={
            "Origin": "http://127.0.0.1:5173",
            "X-CSRF-Token": remote_csrf,
        },
        json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD},
    )
    assert remote_response.status_code == 200
    assert "secure" in remote_response.headers["set-cookie"].lower()


def test_standalone_simulator_demo_routes_require_authentication(
    tmp_path,
    monkeypatch,
):
    import importlib

    monkeypatch.setenv("TATTVA_ENV", "test")
    monkeypatch.setenv("TATTVA_DATA_DIR", str(tmp_path))
    monkeypatch.setenv(
        "TATTVA_CORS_ORIGINS",
        "http://127.0.0.1:5173",
    )
    from backend.api import dev_app

    demo = importlib.reload(dev_app).app
    client = TestClient(demo, base_url="https://testserver")
    assert client.get("/").status_code == 200
    assert client.get("/api/simulations").status_code == 401
