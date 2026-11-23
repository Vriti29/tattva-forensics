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
