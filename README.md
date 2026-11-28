# TATTVA FORENSICS
### Look Beyond the Alert

**AI-Assisted Digital Evidence Correlation and Crime Reconstruction Platform**

TATTVA FORENSICS is a digital forensics platform that helps investigators analyze, correlate, and reconstruct incidents using digital evidence from multiple sources.

The platform brings together authentication logs, file activity, network events, and archive activity to help investigators identify suspicious patterns and understand how an incident unfolded.

## Key Features

- **Evidence Ingestion:** Upload digital evidence from multiple sources.
- **Evidence Integrity:** SHA-256 hashing for file integrity verification.
- **Detection Engine:** Identify suspicious activities and security events.
- **Anomaly Detection:** Highlight unusual patterns in digital evidence.
- **Evidence Correlation:** Discover relationships between events and evidence sources.
- **Incident Timeline:** Reconstruct event sequences using timestamps.
- **Evidence Graph:** Visualize relationships between users, devices, files, and events.
- **What-If Simulator:** Explore hypothetical investigation scenarios.
- **Investigation Management:** Create, update, and manage investigation cases.
- **Reports:** Present investigation findings in a structured format.
- **Administration:** Manage users, roles, and investigation access.
- **Audit History:** Maintain records of important administrative actions.

## Technology Stack

**Frontend**
- React
- Vite
- JavaScript
- CSS

**Backend**
- Python
- FastAPI
- SQLite
- Uvicorn

**Security**
- SHA-256 hashing
- Argon2id password hashing
- HttpOnly session cookies
- CSRF protection
- Role-based access control
- Case-scoped authorization

## Project Structure

```text
tattva-forensics/
│
├── backend/
│   ├── api/
│   ├── ingestion/
│   ├── integrity/
│   ├── requirements.txt
│   └── ...
│
├── frontend/
│   ├── public/
│   ├── src/
│   ├── package.json
│   └── ...
│
├── test_data/
├── test_simulation.py
└── README.md
```

## Installation and Setup

### Prerequisites
- Python 3.10+
- Node.js and npm
- Git

### 1. Clone the Repository

```bash
git clone https://github.com/Vriti29/tattva-forensics.git
cd tattva-forensics
```

### 2. Backend Setup

Create and activate a virtual environment:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

Install dependencies:

```powershell
pip install -r backend/requirements.txt
```

Configure development environment:

```powershell
$env:TATTVA_ENV = "development"
$env:TATTVA_DATA_DIR = Join-Path $env:TEMP "tattva-data"
$env:TATTVA_CORS_ORIGINS = "http://localhost:5174,http://127.0.0.1:5174"
```

Start the backend:

```powershell
python -m uvicorn backend.api.main:app --reload
```

Backend URL: `http://127.0.0.1:8000`

API Documentation: `http://127.0.0.1:8000/docs`

### 3. Frontend Setup

Open a separate terminal:

```powershell
cd frontend
npm install
npm run dev -- --port 5174
```

Open the application:

`http://localhost:5174`

Keep both frontend and backend servers running during local development.

## Authentication and Access Control

The platform supports multiple user roles:

- Admin
- Lead Investigator
- Investigator
- Viewer

Security capabilities include:

- Argon2id password hashing.
- Secure session management using HttpOnly cookies.
- CSRF protection for state-changing requests.
- Admin account management.
- Investigation assignments.
- Case-scoped authorization.
- Session revocation and password-change controls.

To provision the first Admin account:

```powershell
python -m backend.provision_admin
```

The command prompts for the password without displaying it. It refuses to bootstrap if an Admin account already exists.

New and reset passwords must contain 12 to 256 characters.

## Evidence Processing

Create an investigation using:

`POST /investigations`

Upload evidence using:

`POST /investigations/{investigation_id}/evidence`

The upload endpoint accepts multipart fields:

- `file`
- `source_type`

The legacy `POST /analyze` endpoint is also supported.

Investigation records, evidence metadata, original evidence files, analysis results, and simulator baseline analysis are persisted.

### Timestamp Handling

- Explicit-offset timestamps are normalized to UTC for analysis.
- Original timestamp strings are retained.
- Timestamps without offsets remain timezone-unspecified.
- Mixed offset-aware and offset-free timestamps are rejected until explicit offsets are supplied.

## Running Tests

Run the backend test suite:

```powershell
python -m pytest backend/test_backend.py backend/test_auth_foundation.py backend/test_auth_api.py backend/test_timestamps.py -v
```

**Latest validated result: 71 passed.**

The test suite covers evidence parsing, normalization, hashing, integrity, detection, anomaly analysis, correlation, investigation APIs, authentication, authorization, and timestamp handling.

## Production Deployment

The frontend and backend are deployed separately.

### Backend Environment Variables

| Variable | Purpose |
|---|---|
| `TATTVA_ENV` | Production environment |
| `TATTVA_DATA_DIR` | Persistent data directory |
| `TATTVA_CORS_ORIGINS` | Explicit frontend origin(s) |

Production deployment considerations:

- Use HTTPS.
- Configure exact frontend origins for CORS.
- Keep session cookies Secure.
- Use persistent storage for SQLite and uploaded evidence.
- Never commit passwords, secrets, or private environment variables.
- Provision the first Admin account securely.

**Important:** SQLite databases and uploaded evidence require persistent storage. Temporary deployment filesystems may lose data after restarts or redeployments.

## Forensic Limitations

- A matching SHA-256 hash supports integrity verification but does not independently prove original authenticity.
- An anomaly is an investigative indicator, not proof of malicious activity.
- Correlated events indicate potential relationships, not automatically established causation.
- What-If simulations are hypothetical and do not modify original evidence.

All findings should be validated against underlying evidence and relevant investigation context.

## Team Information

**Team Name:** Sherlock Bytes

**Project Name:** TATTVA FORENSICS

**Theme:** PS003 — Digital Evidence Correlation and Crime Reconstruction Engine

**Tagline:** Look Beyond the Alert

**Event:** SUTRAM 2026