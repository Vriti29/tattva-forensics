import json
import sqlite3
from contextlib import closing
from pathlib import Path


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
        return connection

    def _initialize(self):
        with closing(self._connect()) as connection:
            with connection:
                connection.executescript(
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
                    );

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
                    );

                    CREATE INDEX IF NOT EXISTS
                        evidence_files_investigation_idx
                    ON evidence_files(investigation_id, created_at);
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
        updated_at
    ):
        with closing(self._connect()) as connection:
            with connection:
                connection.execute(
                    """
                    INSERT INTO evidence_files (
                        file_id, investigation_id, source_id, filename,
                        metadata_json, analysis_json, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        file_id,
                        investigation_id,
                        source_id,
                        filename,
                        json.dumps(metadata, ensure_ascii=False),
                        json.dumps(file_analysis, ensure_ascii=False),
                        updated_at,
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
