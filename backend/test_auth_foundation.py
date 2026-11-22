import json
import shutil
import sqlite3
from pathlib import Path

import pytest

from backend.auth.passwords import hash_password, verify_password
from backend.investigation_store import InvestigationStore
from backend.provision_admin import main as provision_admin_main


BACKEND_ROOT = Path(__file__).resolve().parent
LIVE_DATABASE = BACKEND_ROOT / "data" / "investigations.sqlite3"


def _create_legacy_database(database_path):
    connection = sqlite3.connect(database_path)
    try:
        connection.executescript(
            """
            CREATE TABLE investigations (
                investigation_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                status TEXT NOT NULL,
                analysis_json TEXT,
                baseline_analysis_id TEXT,
                baseline_analysis_json TEXT
            );
            CREATE TABLE evidence_files (
                file_id TEXT PRIMARY KEY,
                investigation_id TEXT NOT NULL,
                source_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                metadata_json TEXT NOT NULL,
                analysis_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (investigation_id)
                    REFERENCES investigations(investigation_id)
            );
            """
        )
        connection.execute(
            """
            INSERT INTO investigations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "INV-LEGACY-1",
                "Legacy case",
                "Preserve this record",
                "2026-01-01T00:00:00+00:00",
                "2026-01-02T00:00:00+00:00",
                "open",
                '{"analysis":"preserved"}',
                "BASELINE-1",
                '{"baseline":"preserved"}',
            ),
        )
        connection.execute(
            """
            INSERT INTO evidence_files VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "FILE-LEGACY-1",
                "INV-LEGACY-1",
                "SOURCE-LEGACY-1",
                "original evidence.log",
                json.dumps(
                    {
                        "file_path": "evidence/INV-LEGACY-1/file.log",
                        "sha256": "a" * 64,
                    }
                ),
                '{"findings":["preserved"]}',
                "2026-01-02T00:00:00+00:00",
            ),
        )
        connection.commit()
    finally:
        connection.close()


def _read_legacy_rows(database_path):
    connection = sqlite3.connect(database_path)
    try:
        investigations = connection.execute(
            "SELECT * FROM investigations ORDER BY investigation_id"
        ).fetchall()
        evidence = connection.execute(
            """
            SELECT file_id, investigation_id, source_id, filename,
                metadata_json, analysis_json, created_at
            FROM evidence_files ORDER BY file_id
            """
        ).fetchall()
        return investigations, evidence
    finally:
        connection.close()


def test_legacy_database_migration_preserves_records(tmp_path):
    data_directory = tmp_path / "legacy"
    data_directory.mkdir()
    database_path = data_directory / "investigations.sqlite3"
    _create_legacy_database(database_path)
    rows_before = _read_legacy_rows(database_path)

    store = InvestigationStore(data_directory)
    rows_after = _read_legacy_rows(database_path)
    assert rows_after == rows_before

    connection = sqlite3.connect(database_path)
    try:
        uploader = connection.execute(
            """
            SELECT uploader_user_id FROM evidence_files
            WHERE file_id = 'FILE-LEGACY-1'
            """
        ).fetchone()
        versions = connection.execute(
            "SELECT version FROM schema_migrations ORDER BY version"
        ).fetchall()
    finally:
        connection.close()

    assert uploader == (None,)
    assert versions == [(1,), (2,)]
    assert store.get_investigation("INV-LEGACY-1")["baseline_analysis_id"] == (
        "BASELINE-1"
    )


def test_migration_of_copy_of_repository_database_preserves_records(tmp_path):
    if not LIVE_DATABASE.exists():
        pytest.skip("Repository database is not present in this checkout")

    data_directory = tmp_path / "database-copy"
    data_directory.mkdir()
    copied_database = data_directory / LIVE_DATABASE.name
    shutil.copy2(LIVE_DATABASE, copied_database)
    rows_before = _read_legacy_rows(copied_database)

    InvestigationStore(data_directory)
    rows_after = _read_legacy_rows(copied_database)

    assert rows_after == rows_before
    connection = sqlite3.connect(copied_database)
    try:
        assert connection.execute(
            "SELECT COUNT(*) FROM schema_migrations"
        ).fetchone()[0] == 2
        assert connection.execute(
            """
            SELECT COUNT(*) FROM evidence_files
            WHERE uploader_user_id IS NOT NULL
            """
        ).fetchone()[0] == 0
    finally:
        connection.close()


def test_migrations_are_repeatable(tmp_path):
    store = InvestigationStore(tmp_path)
    InvestigationStore(tmp_path)

    with sqlite3.connect(store.database_path) as connection:
        assert connection.execute(
            "SELECT version FROM schema_migrations ORDER BY version"
        ).fetchall() == [(1,), (2,)]


def test_user_creation_normalization_and_role_validation(tmp_path):
    store = InvestigationStore(tmp_path)
    hashed = hash_password("test-password")

    user = store.create_user(" Analyst@Example.COM ", hashed, "INVESTIGATOR")

    assert user["username"] == "Analyst@Example.COM"
    assert store.get_user_by_username(" analyst@example.com ")["user_id"] == (
        user["user_id"]
    )
    with pytest.raises(sqlite3.IntegrityError):
        store.create_user("analyst@example.com", hashed, "VIEWER")
    with pytest.raises(ValueError, match="Unsupported role"):
        store.create_user("other@example.com", hashed, "SUPERUSER")
    with pytest.raises(ValueError, match="Argon2id"):
        store.create_user("plain@example.com", "plaintext-password", "VIEWER")

    with sqlite3.connect(store.database_path) as connection:
        stored_hash = connection.execute(
            "SELECT password_hash FROM users WHERE user_id = ?",
            (user["user_id"],),
        ).fetchone()[0]
    assert stored_hash != "test-password"
    assert verify_password("test-password", stored_hash)


def test_argon2id_password_hashing_and_verification():
    encoded = hash_password("secure-test-password")

    assert encoded.startswith("$argon2id$")
    assert encoded != "secure-test-password"
    assert verify_password("secure-test-password", encoded)
    assert not verify_password("wrong-password", encoded)
    with pytest.raises(ValueError):
        hash_password("")


def test_sessions_store_only_token_hashes_and_deactivation_revokes_them(
    tmp_path,
):
    store = InvestigationStore(tmp_path)
    user = store.create_user(
        "session-user",
        hash_password("session-password"),
        "INVESTIGATOR",
    )
    token = "random-session-token"
    session_id = store.create_session(
        user["user_id"],
        token,
        "2099-01-01T00:00:00+00:00",
    )

    with sqlite3.connect(store.database_path) as connection:
        stored_token_hash = connection.execute(
            "SELECT token_hash FROM sessions WHERE session_id = ?",
            (session_id,),
        ).fetchone()[0]
    assert stored_token_hash != token
    assert len(stored_token_hash) == 64

    deactivated = store.set_user_active(user["user_id"], False)
    assert not deactivated["is_active"]
    with sqlite3.connect(store.database_path) as connection:
        revoked_at = connection.execute(
            "SELECT revoked_at FROM sessions WHERE session_id = ?",
            (session_id,),
        ).fetchone()[0]
    assert revoked_at is not None
    assert store.set_user_active(user["user_id"], True)["is_active"]


def test_admin_bootstrap_cli_and_duplicate_rejection(
    tmp_path, monkeypatch, capsys
):
    responses = iter(["root@example.test"])
    passwords = iter(["chosen-secret", "chosen-secret"])
    monkeypatch.setattr("builtins.input", lambda _prompt: next(responses))
    monkeypatch.setattr(
        "backend.provision_admin.getpass.getpass",
        lambda _prompt: next(passwords),
    )

    assert provision_admin_main(["--data-directory", str(tmp_path)]) == 0
    output = capsys.readouterr()
    assert "Initial Admin provisioned" in output.out
    assert "chosen-secret" not in output.out
    assert "chosen-secret" not in output.err

    store = InvestigationStore(tmp_path)
    admin = store.get_user_by_username("ROOT@example.test")
    assert admin["role"] == "ADMIN"
    assert not admin["password_change_required"]

    assert provision_admin_main(["--data-directory", str(tmp_path)]) == 1
    duplicate_output = capsys.readouterr()
    assert "already exists" in duplicate_output.err


def test_initial_admin_provisioning_is_atomic_and_rejects_duplicate(tmp_path):
    store = InvestigationStore(tmp_path)
    store.provision_initial_admin("first-admin", hash_password("admin-secret"))

    with pytest.raises(ValueError, match="already exists"):
        store.provision_initial_admin(
            "second-admin", hash_password("another-secret")
        )
    assert [user["username"] for user in store.list_users()] == ["first-admin"]


def test_assignment_history_is_retained_after_revocation(tmp_path):
    store = InvestigationStore(tmp_path)
    investigation = store.create_investigation(
        "INV-ASSIGN-1",
        "Assignment test",
        "",
        "2026-01-01T00:00:00+00:00",
        "open",
    )
    admin = store.create_user("admin", hash_password("admin-secret"), "ADMIN")
    investigator = store.create_user(
        "investigator",
        hash_password("investigator-secret"),
        "INVESTIGATOR",
    )

    first = store.create_assignment(
        investigation["investigation_id"],
        investigator["user_id"],
        admin["user_id"],
        reason="Initial assignment",
    )
    assert store.revoke_assignment(first["assignment_id"])["revoked_at"]
    second = store.create_assignment(
        investigation["investigation_id"],
        investigator["user_id"],
        admin["user_id"],
        reason="Reassigned",
    )

    history = store.list_assignments(
        investigation_id=investigation["investigation_id"],
        user_id=investigator["user_id"],
    )
    assert len(history) == 2
    assert history[0]["assignment_id"] == first["assignment_id"]
    assert history[0]["revoked_at"] is not None
    assert history[1]["assignment_id"] == second["assignment_id"]
    assert history[1]["revoked_at"] is None


def test_audit_events_are_structured_and_append_only(tmp_path):
    store = InvestigationStore(tmp_path)
    actor = store.create_user("auditor", hash_password("audit-secret"), "ADMIN")
    event = store.append_audit_event(
        "EVIDENCE_UPLOADED",
        actor_user_id=actor["user_id"],
        investigation_id="INV-AUDIT-1",
        evidence_id="EV-1",
        target_id="FILE-1",
        request_id="REQ-1",
        metadata={"filename": "source.log", "sha256": "b" * 64},
    )

    assert event["metadata"]["filename"] == "source.log"
    assert store.list_audit_events("INV-AUDIT-1") == [event]

    with store._connect() as connection:
        with pytest.raises(sqlite3.IntegrityError, match="append-only"):
            connection.execute(
                "UPDATE audit_events SET action = 'ALTERED' WHERE event_id = ?",
                (event["event_id"],),
            )
        with pytest.raises(sqlite3.IntegrityError, match="append-only"):
            connection.execute(
                "DELETE FROM audit_events WHERE event_id = ?",
                (event["event_id"],),
            )

