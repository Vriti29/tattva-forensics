# tattva-forensics
AI-Assisted Digital Evidence Correlation and Crime Reconstruction Platform

## Investigation API storage

The FastAPI application persists investigations in SQLite and stores original
evidence files under `backend/data/evidence` by default. Set `TATTVA_DATA_DIR`
to use a different persistent data directory. Investigation records, evidence
metadata, per-file analysis, combined analysis, and simulator baseline analysis
are restored when the application is initialized.

Create an investigation with `POST /investigations`, then upload one or more
files to `POST /investigations/{investigation_id}/evidence` using multipart
fields `file` and `source_type`. The legacy `POST /analyze` endpoint remains
available and creates a new investigation for each upload.

## Authentication foundation

The backend applies versioned SQLite migrations at startup. Existing
investigations, evidence metadata, analysis results, file paths, hashes, and
simulator baselines are retained. User passwords are stored as Argon2id hashes;
the account, session, assignment, and append-only audit tables are database
foundations only. Login enforcement and authenticated API access are not yet
enabled.

Install backend dependencies with `pip install -r backend/requirements.txt`.
To interactively provision the first Admin, run:

```powershell
python -m backend.provision_admin
```

The command reads the persistent location from `TATTVA_DATA_DIR` (or uses
`backend/data`) and prompts for the password without echoing it. It refuses to
bootstrap if any Admin account already exists.
