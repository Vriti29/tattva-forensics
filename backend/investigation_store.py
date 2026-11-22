from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
import sqlite3
from contextlib import closing
from pathlib import Path
from uuid import uuid4

from backend.auth.passwords import is_argon2id_hash


ROLES = {
    "ADMIN",
    "LEAD_INVESTIGATOR",
    "INVESTIGATOR",
    "VIEWER",
}


def _now():
    return datetime.now(timezone.utc).isoformat()


def _normalize_username(username):
    if not isinstance(username, str):
        raise ValueError("Username or email must be text")
    normalized = username.strip().casefold()
    if not normalized or len(normalized) > 320:
        raise ValueError("Username or email must contain 1 to 320 characters")
    return normalized


class InvestigationStore:
    def __init__(self, data_directory):
        self.data_directory = Path(data_directory).resolve()
        self.database_path = self.data_directory / "investigations.sqlite3"
        self.evidence_directory = self.data_directory / "evidence"

        self.data_directory.mkdir(parents=True, exist_ok=True)
        self.evidence_directory.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self):
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 5000")
        return connection

    def _initialize(self):
        with closing(self._connect()) as connection:
            connection.execute("BEGIN IMMEDIATE")
            try:
                connection.execute(
                    """
                    CREATE TABLE IF NOT EXISTS schema_migrations (
                        version INTEGER PRIMARY KEY,
                        name TEXT NOT NULL,
                        applied_at TEXT NOT NULL
                    )
                    """
                )
                migrations = (
                    (1, "investigation_storage", self._migration_1),
                    (2, "identity_and_audit_foundation", self._migration_2),
                    (3, "login_attempt_rate_limits", self._migration_3),
                )
                applied_versions = {
                    row["version"]
                    for row in connection.execute(
                        "SELECT version FROM schema_migrations"
                    )
                }
                for version, name, migration in migrations:
                    if version in applied_versions:
                        continue
                    migration(connection)
                    connection.execute(
                        """
                        INSERT INTO schema_migrations (
                            version, name, applied_at
                        ) VALUES (?, ?, ?)
                        """,
                        (version, name, _now()),
                    )
                connection.commit()
            except Exception:
                connection.rollback()
                raise

    @staticmethod
    def _migration_1(connection):
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS investigations (
                investigation_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                status TEXT NOT NULL,
                analysis_json TEXT,
                baseline_analysis_id TEXT,
                baseline_analysis_json TEXT
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS evidence_files (
                file_id TEXT PRIMARY KEY,
                investigation_id TEXT NOT NULL,
                source_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                metadata_json TEXT NOT NULL,
                analysis_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (investigation_id)
                    REFERENCES investigations(investigation_id)
            )
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS evidence_files_investigation_idx
            ON evidence_files(investigation_id, created_at)
            """
        )

    @staticmethod
    def _migration_2(connection):
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                user_id TEXT PRIMARY KEY,
                username TEXT NOT NULL,
                normalized_username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL CHECK (
                    role IN (
                        'ADMIN',
                        'LEAD_INVESTIGATOR',
                        'INVESTIGATOR',
                        'VIEWER'
                    )
                ),
                is_active INTEGER NOT NULL DEFAULT 1
                    CHECK (is_active IN (0, 1)),
                created_at TEXT NOT NULL,
                created_by TEXT,
                deactivated_at TEXT,
                password_change_required INTEGER NOT NULL DEFAULT 1
                    CHECK (password_change_required IN (0, 1)),
                FOREIGN KEY (created_by) REFERENCES users(user_id)
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                session_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                token_hash TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL,
                revoked_at TEXT,
                FOREIGN KEY (user_id) REFERENCES users(user_id)
            )
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS sessions_user_expiry_idx
            ON sessions(user_id, expires_at)
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS investigation_assignments (
                assignment_id TEXT PRIMARY KEY,
                investigation_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                assigned_by TEXT NOT NULL,
                assigned_at TEXT NOT NULL,
                revoked_at TEXT,
                reason TEXT NOT NULL DEFAULT '',
                FOREIGN KEY (investigation_id)
                    REFERENCES investigations(investigation_id),
                FOREIGN KEY (user_id) REFERENCES users(user_id),
                FOREIGN KEY (assigned_by) REFERENCES users(user_id)
            )
            """
        )
        connection.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS
                investigation_assignments_active_idx
            ON investigation_assignments(investigation_id, user_id)
            WHERE revoked_at IS NULL
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS audit_events (
                event_id TEXT PRIMARY KEY,
                actor_user_id TEXT,
                action TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                investigation_id TEXT,
                evidence_id TEXT,
                target_id TEXT,
                request_id TEXT,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                FOREIGN KEY (actor_user_id) REFERENCES users(user_id)
            )
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS audit_events_investigation_time_idx
            ON audit_events(investigation_id, timestamp)
            """
        )
        connection.execute(
            """
            CREATE TRIGGER IF NOT EXISTS audit_events_no_update
            BEFORE UPDATE ON audit_events
            BEGIN
                SELECT RAISE(ABORT, 'audit events are append-only');
            END
            """
        )
        connection.execute(
            """
            CREATE TRIGGER IF NOT EXISTS audit_events_no_delete
            BEFORE DELETE ON audit_events
            BEGIN
                SELECT RAISE(ABORT, 'audit events are append-only');
            END
            """
        )

        evidence_columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(evidence_files)")
        }
        if "uploader_user_id" not in evidence_columns:
            connection.execute(
                """
                ALTER TABLE evidence_files
                ADD COLUMN uploader_user_id TEXT
                    REFERENCES users(user_id)
                """
            )

    @staticmethod
    def _migration_3(connection):
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS login_attempt_buckets (
                scope TEXT NOT NULL CHECK (
                    scope IN ('account_source', 'source')
                ),
                bucket_hash TEXT NOT NULL,
                attempt_count INTEGER NOT NULL CHECK (attempt_count > 0),
                window_started_at TEXT NOT NULL,
                PRIMARY KEY (scope, bucket_hash)
            )
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS login_attempt_buckets_window_idx
            ON login_attempt_buckets(window_started_at)
            """
        )

    @staticmethod
    def _decode(value):
        return json.loads(value) if value is not None else None

    @staticmethod
    def _investigation_from_row(row):
        return {
            "investigation_id": row["investigation_id"],
            "name": row["name"],
            "description": row["description"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "status": row["status"],
        }

    def create_investigation(
        self,
        investigation_id,
        name,
        description,
        created_at,
        status
    ):
        with closing(self._connect()) as connection:
            with connection:
                connection.execute(
                    """
                    INSERT INTO investigations (
                        investigation_id, name, description,
                        created_at, updated_at, status
                    ) VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        investigation_id,
                        name,
                        description,
                        created_at,
                        created_at,
                        status,
                    ),
                )
        return self.get_investigation(investigation_id)

    def list_investigations(self):
        with closing(self._connect()) as connection:
            rows = connection.execute(
                """
                SELECT i.*,
                    COUNT(e.file_id) AS evidence_file_count
                FROM investigations AS i
                LEFT JOIN evidence_files AS e
                    ON e.investigation_id = i.investigation_id
                GROUP BY i.investigation_id
                ORDER BY i.updated_at DESC, i.investigation_id
                """
            ).fetchall()
        return [
            {
                **self._investigation_from_row(row),
                "evidence_file_count": row["evidence_file_count"],
            }
            for row in rows
        ]

    def get_investigation(self, investigation_id):
        with closing(self._connect()) as connection:
            row = connection.execute(
                """
                SELECT * FROM investigations
                WHERE investigation_id = ?
                """,
                (investigation_id,),
            ).fetchone()
            if row is None:
                return None

            evidence_rows = connection.execute(
                """
                SELECT source_id, metadata_json, created_at
                FROM evidence_files
                WHERE investigation_id = ?
                ORDER BY created_at, file_id
                """,
                (investigation_id,),
            ).fetchall()

        return {
            **self._investigation_from_row(row),
            "evidence_files": [
                {
                    **self._decode(item["metadata_json"]),
                    "source_id": item["source_id"],
                    "added_at": item["created_at"],
                }
                for item in evidence_rows
            ],
            "analysis": self._decode(row["analysis_json"]),
            "baseline_analysis_id": row["baseline_analysis_id"],
            "baseline_analysis": self._decode(
                row["baseline_analysis_json"]
            ),
        }

    def get_evidence_analyses(self, investigation_id):
        with closing(self._connect()) as connection:
            rows = connection.execute(
                """
                SELECT analysis_json FROM evidence_files
                WHERE investigation_id = ?
                ORDER BY created_at, file_id
                """,
                (investigation_id,),
            ).fetchall()
        return [self._decode(row["analysis_json"]) for row in rows]

    def update_investigation(self, investigation_id, fields, updated_at):
        if not fields:
            return self.get_investigation(investigation_id)

        allowed_fields = {"name", "description", "status"}
        if not fields.keys() <= allowed_fields:
            raise ValueError("Unsupported investigation field")

        assignments = ", ".join(f"{field} = ?" for field in fields)
        values = list(fields.values())
        values.extend([updated_at, investigation_id])

        with closing(self._connect()) as connection:
            with connection:
                cursor = connection.execute(
                    f"""
                    UPDATE investigations
                    SET {assignments}, updated_at = ?
                    WHERE investigation_id = ?
                    """,
                    values,
                )
                if cursor.rowcount == 0:
                    return None

        return self.get_investigation(investigation_id)

    def delete_investigation(self, investigation_id):
        with closing(self._connect()) as connection:
            with connection:
                connection.execute(
                    "DELETE FROM evidence_files WHERE investigation_id = ?",
                    (investigation_id,),
                )
                connection.execute(
                    "DELETE FROM investigations WHERE investigation_id = ?",
                    (investigation_id,),
                )

    def add_evidence(
        self,
        investigation_id,
        file_id,
        source_id,
        filename,
        metadata,
        file_analysis,
        combined_analysis,
        baseline_analysis_id,
        baseline_analysis,
        updated_at,
        uploader_user_id=None,
    ):
        with closing(self._connect()) as connection:
            with connection:
                connection.execute(
                    """
                    INSERT INTO evidence_files (
                        file_id, investigation_id, source_id, filename,
                        metadata_json, analysis_json, created_at,
                        uploader_user_id
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        file_id,
                        investigation_id,
                        source_id,
                        filename,
                        json.dumps(metadata, ensure_ascii=False),
                        json.dumps(file_analysis, ensure_ascii=False),
                        updated_at,
                        uploader_user_id,
                    ),
                )
                cursor = connection.execute(
                    """
                    UPDATE investigations
                    SET updated_at = ?, analysis_json = ?,
                        baseline_analysis_id = ?,
                        baseline_analysis_json = ?
                    WHERE investigation_id = ?
                    """,
                    (
                        updated_at,
                        json.dumps(combined_analysis, ensure_ascii=False),
                        baseline_analysis_id,
                        json.dumps(baseline_analysis, ensure_ascii=False),
                        investigation_id,
                    ),
                )
                if cursor.rowcount == 0:
                    raise ValueError("Investigation not found")
                if uploader_user_id is not None:
                    connection.execute(
                        """
                        INSERT INTO audit_events (
                            event_id, actor_user_id, action, timestamp,
                            investigation_id, evidence_id, target_id,
                            metadata_json
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            uuid4().hex,
                            uploader_user_id,
                            "EVIDENCE_UPLOADED",
                            updated_at,
                            investigation_id,
                            file_id,
                            file_id,
                            json.dumps(
                                {
                                    "filename": filename,
                                    "sha256": metadata.get("sha256"),
                                },
                                ensure_ascii=False,
                                sort_keys=True,
                            ),
                        ),
                    )

    @staticmethod
    def _user_from_row(row):
        if row is None:
            return None
        return {
            "user_id": row["user_id"],
            "username": row["username"],
            "role": row["role"],
            "is_active": bool(row["is_active"]),
            "created_at": row["created_at"],
            "created_by": row["created_by"],
            "deactivated_at": row["deactivated_at"],
            "password_change_required": bool(
                row["password_change_required"]
            ),
        }

    @staticmethod
    def _insert_user(
        connection,
        username,
        normalized_username,
        password_hash,
        role,
        created_by,
        password_change_required,
        user_id=None,
    ):
        user_id = user_id or uuid4().hex
        connection.execute(
            """
            INSERT INTO users (
                user_id, username, normalized_username, password_hash,
                role, is_active, created_at, created_by,
                password_change_required
            ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
            """,
            (
                user_id,
                username.strip(),
                normalized_username,
                password_hash,
                role,
                _now(),
                created_by,
                int(password_change_required),
            ),
        )
        return user_id

    def create_user(
        self,
        username,
        password_hash,
        role,
        created_by=None,
        password_change_required=True,
    ):
        normalized_username = _normalize_username(username)
        if not isinstance(role, str) or role not in ROLES:
            raise ValueError(f"Unsupported role: {role}")
        if not is_argon2id_hash(password_hash):
            raise ValueError("An Argon2id password hash is required")
        if not isinstance(password_change_required, bool):
            raise ValueError("password_change_required must be a boolean")

        with closing(self._connect()) as connection:
            with connection:
                user_id = self._insert_user(
                    connection,
                    username,
                    normalized_username,
                    password_hash,
                    role,
                    created_by,
                    password_change_required,
                )
        return self.get_user(user_id)

    def provision_initial_admin(self, username, password_hash):
        normalized_username = _normalize_username(username)
        if not is_argon2id_hash(password_hash):
            raise ValueError("An Argon2id password hash is required")

        with closing(self._connect()) as connection:
            connection.execute("BEGIN IMMEDIATE")
            try:
                existing_admin = connection.execute(
                    "SELECT 1 FROM users WHERE role = 'ADMIN' LIMIT 1"
                ).fetchone()
                if existing_admin is not None:
                    raise ValueError("An Admin account already exists")
                user_id = self._insert_user(
                    connection,
                    username,
                    normalized_username,
                    password_hash,
                    "ADMIN",
                    None,
                    False,
                )
                connection.commit()
            except Exception:
                connection.rollback()
                raise
        return self.get_user(user_id)

    def has_admin(self):
        with closing(self._connect()) as connection:
            row = connection.execute(
                "SELECT 1 FROM users WHERE role = 'ADMIN' LIMIT 1"
            ).fetchone()
        return row is not None

    def get_user(self, user_id):
        with closing(self._connect()) as connection:
            row = connection.execute(
                "SELECT * FROM users WHERE user_id = ?", (user_id,)
            ).fetchone()
        return self._user_from_row(row)

    def get_user_by_username(self, username):
        normalized_username = _normalize_username(username)
        with closing(self._connect()) as connection:
            row = connection.execute(
                """
                SELECT * FROM users WHERE normalized_username = ?
                """,
                (normalized_username,),
            ).fetchone()
        return self._user_from_row(row)

    def get_user_auth_record(self, username):
        normalized_username = _normalize_username(username)
        with closing(self._connect()) as connection:
            row = connection.execute(
                """
                SELECT * FROM users WHERE normalized_username = ?
                """,
                (normalized_username,),
            ).fetchone()
        if row is None:
            return None
        return {
            "user": self._user_from_row(row),
            "password_hash": row["password_hash"],
        }

    def begin_login_attempt(self, username, source, now=None):
        normalized_username = username.strip().casefold()
        source = source or "unknown"
        now = now or datetime.now(timezone.utc)
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)
        now = now.astimezone(timezone.utc)

        window_seconds = 15 * 60
        account_limit = 5
        source_limit = 20
        window_start = now.isoformat()
        bucket_keys = (
            (
                "account_source",
                hashlib.sha256(
                    f"{normalized_username}\0{source}".encode("utf-8")
                ).hexdigest(),
                account_limit,
            ),
            (
                "source",
                hashlib.sha256(source.encode("utf-8")).hexdigest(),
                source_limit,
            ),
        )

        with closing(self._connect()) as connection:
            connection.execute("BEGIN IMMEDIATE")
            try:
                cutoff = (
                    now - timedelta(seconds=window_seconds)
                ).isoformat()
                connection.execute(
                    """
                    DELETE FROM login_attempt_buckets
                    WHERE window_started_at <= ?
                    """,
                    (cutoff,),
                )
                retry_after = 0
                updated = []
                for scope, bucket_hash, limit in bucket_keys:
                    row = connection.execute(
                        """
                        SELECT attempt_count, window_started_at
                        FROM login_attempt_buckets
                        WHERE scope = ? AND bucket_hash = ?
                        """,
                        (scope, bucket_hash),
                    ).fetchone()
                    if row is not None:
                        bucket_started = datetime.fromisoformat(
                            row["window_started_at"]
                        )
                        if bucket_started.tzinfo is None:
                            bucket_started = bucket_started.replace(
                                tzinfo=timezone.utc
                            )
                        expires_at = bucket_started + timedelta(
                            seconds=window_seconds
                        )
                        if expires_at <= now:
                            connection.execute(
                                """
                                DELETE FROM login_attempt_buckets
                                WHERE scope = ? AND bucket_hash = ?
                                """,
                                (scope, bucket_hash),
                            )
                            row = None
                        elif row["attempt_count"] >= limit:
                            retry_after = max(
                                retry_after,
                                int((expires_at - now).total_seconds()) + 1,
                            )
                    updated.append((scope, bucket_hash, row))

                if retry_after:
                    connection.commit()
                    return retry_after

                for scope, bucket_hash, row in updated:
                    if row is None:
                        connection.execute(
                            """
                            INSERT INTO login_attempt_buckets (
                                scope, bucket_hash, attempt_count,
                                window_started_at
                            ) VALUES (?, ?, 1, ?)
                            """,
                            (scope, bucket_hash, window_start),
                        )
                    else:
                        connection.execute(
                            """
                            UPDATE login_attempt_buckets
                            SET attempt_count = attempt_count + 1
                            WHERE scope = ? AND bucket_hash = ?
                            """,
                            (scope, bucket_hash),
                        )
                connection.commit()
                return None
            except Exception:
                connection.rollback()
                raise

    def clear_login_attempts(self, username, source):
        source = source or "unknown"
        bucket_hash = hashlib.sha256(
            f"{username.strip().casefold()}\0{source}".encode("utf-8")
        ).hexdigest()
        with closing(self._connect()) as connection:
            with connection:
                connection.execute(
                    """
                    DELETE FROM login_attempt_buckets
                    WHERE scope = 'account_source' AND bucket_hash = ?
                    """,
                    (bucket_hash,),
                )

    def list_users(self):
        with closing(self._connect()) as connection:
            rows = connection.execute(
                "SELECT * FROM users ORDER BY created_at, user_id"
            ).fetchall()
        return [self._user_from_row(row) for row in rows]

    def update_user(self, user_id, role=None, is_active=None, changed_at=None):
        if role is not None and (not isinstance(role, str) or role not in ROLES):
            raise ValueError(f"Unsupported role: {role}")
        if is_active is not None and not isinstance(is_active, bool):
            raise ValueError("is_active must be a boolean")
        if role is None and is_active is None:
            raise ValueError("At least one account field must be updated")

        changed_at = changed_at or _now()
        with closing(self._connect()) as connection:
            connection.execute("BEGIN IMMEDIATE")
            try:
                row = connection.execute(
                    "SELECT role, is_active FROM users WHERE user_id = ?",
                    (user_id,),
                ).fetchone()
                if row is None:
                    connection.rollback()
                    return None

                next_role = role if role is not None else row["role"]
                next_active = (
                    is_active if is_active is not None else bool(row["is_active"])
                )
                if (
                    row["role"] == "ADMIN"
                    and row["is_active"]
                    and (next_role != "ADMIN" or not next_active)
                ):
                    other_admin = connection.execute(
                        """
                        SELECT 1 FROM users
                        WHERE role = 'ADMIN' AND is_active = 1
                            AND user_id != ?
                        LIMIT 1
                        """,
                        (user_id,),
                    ).fetchone()
                    if other_admin is None:
                        raise ValueError(
                            "At least one active Admin account must remain"
                        )

                updates = []
                values = []
                if role is not None:
                    updates.append("role = ?")
                    values.append(role)
                if is_active is not None:
                    updates.extend(["is_active = ?", "deactivated_at = ?"])
                    values.extend(
                        [int(is_active), None if is_active else changed_at]
                    )
                values.append(user_id)
                connection.execute(
                    f"UPDATE users SET {', '.join(updates)} WHERE user_id = ?",
                    values,
                )
                if is_active is False:
                    connection.execute(
                        """
                        UPDATE sessions SET revoked_at = ?
                        WHERE user_id = ? AND revoked_at IS NULL
                        """,
                        (changed_at, user_id),
                    )
                connection.commit()
            except Exception:
                connection.rollback()
                raise
        return self.get_user(user_id)

    def update_user_password(
        self,
        user_id,
        password_hash,
        password_change_required,
        changed_at=None,
    ):
        if not is_argon2id_hash(password_hash):
            raise ValueError("An Argon2id password hash is required")
        if not isinstance(password_change_required, bool):
            raise ValueError("password_change_required must be a boolean")
        changed_at = changed_at or _now()
        with closing(self._connect()) as connection:
            with connection:
                cursor = connection.execute(
                    """
                    UPDATE users
                    SET password_hash = ?, password_change_required = ?
                    WHERE user_id = ?
                    """,
                    (
                        password_hash,
                        int(password_change_required),
                        user_id,
                    ),
                )
                if cursor.rowcount == 0:
                    return None
                connection.execute(
                    """
                    UPDATE sessions SET revoked_at = ?
                    WHERE user_id = ? AND revoked_at IS NULL
                    """,
                    (changed_at, user_id),
                )
        return self.get_user(user_id)

    def set_user_active(self, user_id, is_active, changed_at=None):
        if not isinstance(is_active, bool):
            raise ValueError("is_active must be a boolean")
        changed_at = changed_at or _now()
        deactivated_at = None if is_active else changed_at
        with closing(self._connect()) as connection:
            with connection:
                cursor = connection.execute(
                    """
                    UPDATE users
                    SET is_active = ?, deactivated_at = ?
                    WHERE user_id = ?
                    """,
                    (int(is_active), deactivated_at, user_id),
                )
                if cursor.rowcount == 0:
                    return None
                if not is_active:
                    connection.execute(
                        """
                        UPDATE sessions SET revoked_at = ?
                        WHERE user_id = ? AND revoked_at IS NULL
                        """,
                        (changed_at, user_id),
                    )
        return self.get_user(user_id)

    @staticmethod
    def _token_hash(token):
        if not isinstance(token, str) or not token:
            raise ValueError("A session token is required")
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    def create_session(
        self,
        user_id,
        token,
        expires_at,
        created_at=None,
        expected_password_hash=None,
    ):
        token_hash = self._token_hash(token)
        created_at = created_at or _now()
        session_id = uuid4().hex
        with closing(self._connect()) as connection:
            with connection:
                user = connection.execute(
                    """
                    SELECT is_active, password_hash
                    FROM users WHERE user_id = ?
                    """,
                    (user_id,),
                ).fetchone()
                if user is None or not user["is_active"]:
                    raise ValueError("An active user is required for a session")
                if (
                    expected_password_hash is not None
                    and not hmac.compare_digest(
                        user["password_hash"],
                        expected_password_hash,
                    )
                ):
                    raise ValueError("Credentials changed during login")
                connection.execute(
                    """
                    INSERT INTO sessions (
                        session_id, user_id, token_hash, created_at,
                        expires_at, last_seen_at
                    ) VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        session_id,
                        user_id,
                        token_hash,
                        created_at,
                        expires_at,
                        created_at,
                    ),
                )
        return session_id

    def get_session_by_token(self, token):
        token_hash = self._token_hash(token)
        with closing(self._connect()) as connection:
            row = connection.execute(
                """
                SELECT s.session_id, s.user_id, s.created_at, s.expires_at,
                    s.last_seen_at, s.revoked_at,
                    u.username, u.role, u.is_active, u.created_by,
                    u.deactivated_at, u.password_change_required
                FROM sessions AS s
                JOIN users AS u ON u.user_id = s.user_id
                WHERE s.token_hash = ?
                """,
                (token_hash,),
            ).fetchone()
        if row is None:
            return None
        return {
            "session_id": row["session_id"],
            "user_id": row["user_id"],
            "created_at": row["created_at"],
            "expires_at": row["expires_at"],
            "last_seen_at": row["last_seen_at"],
            "revoked_at": row["revoked_at"],
            "user": self._user_from_row(row),
        }

    def touch_session(self, session_id, last_seen_at=None):
        last_seen_at = last_seen_at or _now()
        with closing(self._connect()) as connection:
            with connection:
                cursor = connection.execute(
                    """
                    UPDATE sessions SET last_seen_at = ?
                    WHERE session_id = ? AND revoked_at IS NULL
                    """,
                    (last_seen_at, session_id),
                )
        return cursor.rowcount > 0

    def revoke_session(self, session_id, revoked_at=None):
        revoked_at = revoked_at or _now()
        with closing(self._connect()) as connection:
            with connection:
                cursor = connection.execute(
                    """
                    UPDATE sessions SET revoked_at = ?
                    WHERE session_id = ? AND revoked_at IS NULL
                    """,
                    (revoked_at, session_id),
                )
        return cursor.rowcount > 0

    def create_assignment(
        self,
        investigation_id,
        user_id,
        assigned_by,
        reason="",
        assigned_at=None,
    ):
        assignment_id = uuid4().hex
        assigned_at = assigned_at or _now()
        with closing(self._connect()) as connection:
            with connection:
                connection.execute(
                    """
                    INSERT INTO investigation_assignments (
                        assignment_id, investigation_id, user_id,
                        assigned_by, assigned_at, reason
                    ) VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        assignment_id,
                        investigation_id,
                        user_id,
                        assigned_by,
                        assigned_at,
                        reason,
                    ),
                )
        return self.get_assignment(assignment_id)

    def get_assignment(self, assignment_id):
        with closing(self._connect()) as connection:
            row = connection.execute(
                """
                SELECT * FROM investigation_assignments
                WHERE assignment_id = ?
                """,
                (assignment_id,),
            ).fetchone()
        return dict(row) if row is not None else None

    def list_assignments(self, investigation_id=None, user_id=None):
        conditions = []
        parameters = []
        if investigation_id is not None:
            conditions.append("investigation_id = ?")
            parameters.append(investigation_id)
        if user_id is not None:
            conditions.append("user_id = ?")
            parameters.append(user_id)
        where_clause = (
            f"WHERE {' AND '.join(conditions)}" if conditions else ""
        )
        with closing(self._connect()) as connection:
            rows = connection.execute(
                f"""
                SELECT * FROM investigation_assignments
                {where_clause}
                ORDER BY assigned_at, assignment_id
                """,
                parameters,
            ).fetchall()
        return [dict(row) for row in rows]

    def revoke_assignment(self, assignment_id, revoked_at=None):
        revoked_at = revoked_at or _now()
        with closing(self._connect()) as connection:
            with connection:
                cursor = connection.execute(
                    """
                    UPDATE investigation_assignments SET revoked_at = ?
                    WHERE assignment_id = ? AND revoked_at IS NULL
                    """,
                    (revoked_at, assignment_id),
                )
        return self.get_assignment(assignment_id) if cursor.rowcount else None

    def append_audit_event(
        self,
        action,
        actor_user_id=None,
        investigation_id=None,
        evidence_id=None,
        target_id=None,
        request_id=None,
        metadata=None,
        timestamp=None,
    ):
        if not isinstance(action, str) or not action.strip():
            raise ValueError("An audit action is required")
        if metadata is not None and not isinstance(metadata, dict):
            raise ValueError("Audit metadata must be a dictionary")
        event_id = uuid4().hex
        with closing(self._connect()) as connection:
            with connection:
                connection.execute(
                    """
                    INSERT INTO audit_events (
                        event_id, actor_user_id, action, timestamp,
                        investigation_id, evidence_id, target_id, request_id,
                        metadata_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        event_id,
                        actor_user_id,
                        action.strip(),
                        timestamp or _now(),
                        investigation_id,
                        evidence_id,
                        target_id,
                        request_id,
                        json.dumps(
                            metadata or {},
                            ensure_ascii=False,
                            sort_keys=True,
                        ),
                    ),
                )
        return self.get_audit_event(event_id)

    def get_audit_event(self, event_id):
        with closing(self._connect()) as connection:
            row = connection.execute(
                "SELECT * FROM audit_events WHERE event_id = ?",
                (event_id,),
            ).fetchone()
        if row is None:
            return None
        event = dict(row)
        event["metadata"] = json.loads(event.pop("metadata_json"))
        return event

    def list_audit_events(self, investigation_id=None, limit=100):
        if not isinstance(limit, int) or limit < 1:
            raise ValueError("Audit event limit must be a positive integer")
        with closing(self._connect()) as connection:
            if investigation_id is None:
                rows = connection.execute(
                    """
                    SELECT * FROM audit_events
                    ORDER BY timestamp, event_id LIMIT ?
                    """,
                    (limit,),
                ).fetchall()
            else:
                rows = connection.execute(
                    """
                    SELECT * FROM audit_events
                    WHERE investigation_id = ?
                    ORDER BY timestamp, event_id LIMIT ?
                    """,
                    (investigation_id, limit),
                ).fetchall()
        events = []
        for row in rows:
            event = dict(row)
            event["metadata"] = json.loads(event.pop("metadata_json"))
            events.append(event)
        return events
