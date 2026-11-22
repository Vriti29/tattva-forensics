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
authentication uses opaque HttpOnly session cookies backed by hashed tokens in
SQLite. Admin account management, investigation assignments, and case-scoped
authorization are enforced by the API.

Install backend dependencies with `pip install -r backend/requirements.txt`.
To interactively provision the first Admin, run:

```powershell
python -m backend.provision_admin
```

The command reads the persistent location from `TATTVA_DATA_DIR` (or uses
`backend/data`) and prompts for the password without echoing it. It refuses to
bootstrap if any Admin account already exists.

The browser must first call `GET /auth/csrf`, then send the returned value in
the `X-CSRF-Token` header for state-changing requests, including login. Browser
requests must include credentials so the session and CSRF cookies are stored
and sent. The local frontend origin `http://127.0.0.1:5173` is enabled by
default only when
`TATTVA_ENV=development`. Production deployments must set
`TATTVA_CORS_ORIGINS` to their explicit frontend origins; no cross-origin
origins are allowed by default in production. Cookies are Secure by default.
For local loopback HTTP only, set `TATTVA_ENV=development`; this does not
disable Secure cookies for non-loopback hosts.

`POST /auth/login`, `POST /auth/logout`, and `GET /auth/me` manage sessions.
Admin-only user management is provided under `/users`. Case memberships are
managed under `/investigations/{investigation_id}/assignments` by Admins or the
assigned Lead Investigator. Investigation and simulator APIs require an active
session and enforce assigned-case permissions. New and reset passwords must
contain 12 to 256 characters; Admins provide reset passwords out of band, and
the affected user must change a reset password before accessing other APIs.
