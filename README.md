# TATTVA FORENSICS
### Look Beyond the Alert

**An End-to-End Digital Forensics, Evidence Correlation & Crime Reconstruction Workspace**

<p align="center">
  <strong>SUTRAM 2026 | Problem Statement: SUTRAMPS03 (PS003)</strong><br>
  Digital Evidence Correlation and Crime Reconstruction Engine
</p>

<p align="center">
  <a href="https://tattva-forensics.vercel.app/">Live Prototype</a> •
  <a href="https://tattva-forensics-backend.onrender.com/docs">API Documentation</a> •
  <a href="https://github.com/Vriti29/tattva-forensics">GitHub Repository</a>
</p>

---

## 1. Overview

Digital investigations often involve evidence collected from multiple sources, including authentication logs, system events, network activity, and application records.

Examining these records independently can make it difficult to identify suspicious patterns, establish event sequences, and understand how individual activities may be connected.

**TATTVA FORENSICS** is an end-to-end digital forensics workspace designed to help investigators transform raw digital evidence into structured, traceable, and explainable investigative insights.

The platform brings together evidence ingestion, integrity verification, event normalization, anomaly detection, evidence correlation, timeline reconstruction, graph-based visualization, and scenario simulation in a unified interface.

Rather than treating an alert as a conclusion, TATTVA helps investigators examine the underlying evidence and explore the relationships between events.

### Core Objective

To provide investigators with a structured environment for:

- Collecting and organizing digital evidence.
- Preserving evidence integrity through cryptographic hashing.
- Identifying suspicious activities and behavioural patterns.
- Connecting related events across evidence sources.
- Reconstructing chronological incident timelines.
- Visualizing relationships between entities and events.
- Exploring hypothetical investigative scenarios without intentionally modifying original evidence.

---

## 2. Live Prototype

| Component | Link |
|---|---|
| Frontend Application | https://tattva-forensics.vercel.app/ |
| Backend API | https://tattva-forensics-backend.onrender.com/ |
| Interactive API Documentation | https://tattva-forensics-backend.onrender.com/docs |
| Source Code | https://github.com/Vriti29/tattva-forensics |

The application provides role-based access to investigation workflows and administrative functionality.

---

## 3. Key Features

### 3.1 Evidence Ingestion
- Upload digital evidence files into an investigation.
- Organize evidence using investigation-specific records.
- Support structured processing of uploaded log data.
- Maintain source-file metadata.

### 3.2 Evidence Integrity Verification
- Generate SHA-256 cryptographic hashes for uploaded evidence.
- Maintain evidence integrity metadata.
- Support verification-oriented evidence handling.
- Preserve original uploaded evidence separately from processed records.

### 3.3 Event Normalization
- Convert supported log entries into structured event records.
- Extract relevant fields such as timestamps, event types, users, and IP addresses.
- Normalize timestamp representations for chronological analysis.
- Retain original timestamp information where available.

### 3.4 Detection and Anomaly Analysis
- Identify suspicious patterns in processed events.
- Highlight repeated authentication failures and unusual login behaviour.
- Surface potentially suspicious activities for investigator review.

### 3.5 Evidence Correlation
- Identify relationships between events and entities.
- Examine shared attributes and temporal relationships.
- Generate correlation findings to assist investigative analysis.

### 3.6 Incident Timeline
- Display normalized events in chronological order.
- Help investigators understand the sequence of activities.
- Support reconstruction of incident progression.

### 3.7 Evidence Relationship Graph
- Visualize connected evidence records and entities.
- Explore relationships between users, IP addresses, and events.
- Inspect individual nodes and their associated relationships.

### 3.8 What-If Scenario Simulator
- Create hypothetical investigative scenarios.
- Explore the effect of excluding selected evidence records.
- Compare simulated outcomes against a baseline.
- Maintain an audit history of simulation operations.

### 3.9 Investigation Management
- Create and manage investigations.
- Organize evidence and findings within investigation contexts.
- Support investigation-specific access permissions.

### 3.10 Reports and Audit History
- Present investigation summaries and analytical findings.
- Display evidence, entities, relationships, and anomalies.
- Maintain an audit trail of relevant operations.

### 3.11 Administration and Role-Based Access
- Manage user accounts and roles.
- Assign investigators to investigations.
- Support investigation-scoped access control.
- Provide administrative account-management functionality.

---

## 4. Application Workflow

TATTVA follows a structured investigative workflow:

```text
       DIGITAL EVIDENCE
              |
              v
      EVIDENCE INGESTION
              |
              v
     SHA-256 INTEGRITY HASH
              |
              v
      EVENT NORMALIZATION
              |
              v
      DETECTION & ANALYSIS
              |
              v
       ANOMALY IDENTIFICATION
              |
              v
       EVIDENCE CORRELATION
              |
        +-----+------+
        |            |
        v            v
   INCIDENT       EVIDENCE
   TIMELINE        GRAPH
        |            |
        +-----+------+
              |
              v
      INVESTIGATIVE FINDINGS
              |
              v
        REPORT GENERATION
```

The What-If Simulator provides an additional environment for exploring hypothetical investigative scenarios.

---

## 5. Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React, Vite, JavaScript, CSS |
| Backend | Python, FastAPI |
| Database | SQLite |
| API Server | Uvicorn |
| Evidence Integrity | SHA-256 |
| Password Security | Argon2id |
| Authentication | HttpOnly Session Cookies, CSRF Protection |
| Authorization | Role-Based Access Control (RBAC) |
| Testing | Pytest |

---

## 6. Project Structure

```text
tattva-forensics/
│
├── backend/
│   ├── api/
│   │   └── main.py
│   ├── auth/
│   │   └── security.py
│   ├── requirements.txt
│   ├── provision_admin.py
│   └── test_backend.py
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── AuthPages.jsx
│   │   └── investigationApi.js
│   ├── package.json
│   └── vercel.json
│
├── test_data/
│   └── authentication/
│
├── test_simulation.py
└── README.md
```

*The structure above highlights the principal project components; additional supporting files and modules are present in the repository.*

---

## 7. Getting Started — Local Setup

### Prerequisites

Install the following:

- Python 3.10 or later
- Node.js and npm
- Git

### Step 1: Clone the Repository

```bash
git clone https://github.com/Vriti29/tattva-forensics.git

cd tattva-forensics
```

### Step 2: Set Up the Python Environment

```bash
python -m venv .venv
```

Activate the environment.

**Windows:**

```bash
.venv\Scripts\activate
```

**Linux/macOS:**

```bash
source .venv/bin/activate
```

### Step 3: Install Backend Dependencies

```bash
pip install -r backend/requirements.txt
```

### Step 4: Configure Environment Variables

Set the following development environment variables.

**Windows PowerShell:**

```powershell
$env:TATTVA_ENV="development"
$env:TATTVA_DATA_DIR="$env:TEMP\tattva-forensics"
$env:TATTVA_CORS_ORIGINS="http://localhost:5174,http://127.0.0.1:5174"
```

Configure the equivalent environment variables in your shell when using Linux or macOS.

### Step 5: Start the Backend

From the repository root:

```bash
python -m uvicorn backend.api.main:app --reload
```

Backend:

```text
http://localhost:8000
```

Interactive API documentation:

```text
http://localhost:8000/docs
```

### Step 6: Start the Frontend

Open another terminal:

```bash
cd frontend
```

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev -- --port 5174
```

Frontend:

```text
http://localhost:5174
```

---

## 8. Authentication and Access Control

TATTVA uses role-based access control to organize access to investigative functionality.

### Supported Roles

| Role | Purpose |
|---|---|
| Admin | User management, role assignment, and administrative operations |
| Lead Investigator | Investigation oversight and investigative access |
| Investigator | Evidence examination and investigation workflows |
| Viewer | Restricted, view-oriented access |

### Security Mechanisms

- Password hashing using Argon2id.
- HttpOnly session cookies.
- CSRF protection.
- Investigation-scoped authorization.
- Role-based permissions.
- Account and access-management controls.
- Password-change controls.

### First Admin Provisioning

To provision the initial administrator account in a local environment:

```bash
python -m backend.provision_admin
```

The command prompts for an administrator password and refuses to provision another initial Admin if one already exists.

New and reset passwords must contain between 12 and 256 characters.

**Important:** Never publish administrator credentials, session secrets, or private judge credentials in the repository.

---

# 9. User Guide — How to Use TATTVA FORENSICS

This section provides a practical walkthrough of the application's primary investigative workflow.

## Step 1: Log In

Open the live application:

https://tattva-forensics.vercel.app/

Log in using the account credentials provided by the project team.

The application provides role-based access, so the available functionality depends on the assigned role.

## Step 2: Create an Investigation

Navigate to the **Investigations** section.

1. Create a new investigation.
2. Provide the required investigation details.
3. Open the created investigation.
4. Use its workspace to manage evidence and examine findings.

## Step 3: Upload Digital Evidence

Navigate to the evidence-management area of the investigation.

1. Select the evidence upload option.
2. Choose a supported log file.
3. Provide the required source information.
4. Submit the file for processing.

The application records evidence metadata and generates its SHA-256 integrity hash.

Sample authentication logs are available in the `test_data/` directory.

## Step 4: Examine Processed Evidence

After uploading evidence, examine the processed records.

Review the available event information, including:

- Event type.
- Timestamp.
- User or account.
- Source IP address.
- Associated evidence information.

The normalization process converts supported log entries into structured records for further analysis.

## Step 5: Review Detection and Anomalies

Open the detection and anomaly-analysis sections.

Examine the findings highlighted by the system, such as:

- Repeated failed login attempts.
- Successful authentication following repeated failures.
- Unusual login times.
- Potentially suspicious account activity.
- Multiple IP addresses associated with an account within a short time window.

These findings are intended to support investigator review rather than independently establish malicious activity.

## Step 6: Reconstruct the Incident Timeline

Open **Incident Timeline**.

Review the chronological sequence of normalized events.

The timeline helps investigators:

- Understand the order of recorded activities.
- Identify clusters of related events.
- Examine authentication sequences.
- Trace the progression of a potential incident.

## Step 7: Explore the Evidence Graph

Open **Evidence Graph**.

The graph provides a visual representation of relationships between evidence records and entities.

Investigators can explore nodes and inspect their associated relationships to understand how different records may be connected.

## Step 8: Generate and Review Reports

Navigate to the **Reports** section.

Review the investigation summary and available analytical information, including:

- Evidence and record counts.
- Findings.
- Entities.
- Relationships.
- Anomalies.

Use these results to support the investigation and communicate the observed evidence.

## Step 9: Explore What-If Scenarios

Open the **What-If Simulator**.

1. Select an investigation.
2. Create a hypothetical scenario.
3. Choose the evidence record to exclude from the simulation.
4. Execute the simulation.
5. Review the simulated findings and baseline comparison.
6. Examine the simulation audit history.

The simulator is intended to explore hypothetical investigative outcomes. Simulated findings should not be interpreted as changes to the original evidence.

## Step 10: Administration

Users with the Admin role can access the administrative functionality.

This includes:

- Creating and managing user accounts.
- Assigning user roles.
- Managing investigation assignments.
- Supporting controlled access to investigations.

Judges evaluating the investigative workflow can use the provided Investigator account. Administrative functionality can be demonstrated separately by the project team.

---

## 10. Recommended Demonstration Flow

For a quick evaluation of the platform, the following sequence demonstrates its major capabilities:

| Order | Module | Demonstration |
|---|---|---|
| 1 | Login | Authenticate using the provided account |
| 2 | Investigations | Open or create an investigation |
| 3 | Evidence Explorer | Upload sample authentication logs |
| 4 | Integrity | Show SHA-256 evidence hash |
| 5 | Detection | Examine suspicious activity findings |
| 6 | Timeline | Reconstruct the chronological event sequence |
| 7 | Evidence Graph | Explore connected entities and relationships |
| 8 | Reports | Review the investigation summary |
| 9 | What-If Simulator | Execute a hypothetical evidence-exclusion scenario |
| 10 | Administration | Demonstrate user and role management |

**Suggested evaluation approach:** Use a sample investigation with uploaded authentication logs so evaluators can observe the complete workflow from raw evidence to investigative insights.

---

## 11. API Overview

The backend exposes REST APIs through FastAPI.

Interactive API documentation:

https://tattva-forensics-backend.onrender.com/docs

Important evidence-related endpoints include:

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/investigations` | Create an investigation |
| POST | `/investigations/{investigation_id}/evidence` | Upload evidence to an investigation |
| POST | `/analyze` | Legacy analysis endpoint |

The evidence-upload endpoint accepts multipart form data, including the evidence file and source type.

Authentication-protected endpoints require an authorized session.

---

## 12. Timestamp Handling

Accurate event ordering is important in digital investigations.

TATTVA applies the following timestamp-handling rules:

- Timestamps containing explicit timezone offsets are normalized to UTC.
- Original timestamp information is retained.
- Timestamps without timezone information remain unspecified rather than being silently assigned a timezone.
- Mixed timezone-aware and timezone-naive timestamps are rejected until the missing timezone offsets are supplied.

This approach helps avoid misleading chronological interpretations caused by inconsistent timezone assumptions.

---

## 13. Testing

The project includes automated backend tests covering core functionality, authentication, API behaviour, and timestamp handling.

Run the test suite from the repository root:

```bash
python -m pytest backend/test_backend.py backend/test_auth_foundation.py backend/test_auth_api.py backend/test_timestamps.py -v
```

**Latest documented validation result: 71 tests passed.**

Run the tests again after making code changes to verify the current state of the application.

---

## 14. Deployment Configuration

The production application uses:

- **Frontend:** Vercel
- **Backend:** Render
- **Database:** SQLite

### Backend Environment Variables

| Variable | Purpose |
|---|---|
| `TATTVA_ENV` | Application environment |
| `TATTVA_DATA_DIR` | Application data directory |
| `TATTVA_CORS_ORIGINS` | Allowed frontend origins |

### Production Security Considerations

- Use HTTPS for production access.
- Configure only trusted frontend origins.
- Enable Secure cookie settings in production.
- Keep secrets and credentials outside source control.
- Use persistent storage for SQLite databases and uploaded evidence.

**Storage warning:** Temporary filesystems may lose application data after a restart or redeployment. Production deployments must use persistent storage for SQLite databases and uploaded evidence.

---

## 15. Forensic Considerations and Limitations

TATTVA is designed as an investigative assistance platform. Its analytical outputs must be interpreted carefully.

- **SHA-256 integrity:** A matching hash helps verify that a file has not changed relative to a previously recorded hash. It does not independently establish the authenticity or origin of the evidence.
- **Anomaly detection:** A detected anomaly indicates potentially unusual behaviour, not definitive proof of malicious activity.
- **Evidence correlation:** A relationship between records does not automatically establish causation or prove that the same actor performed every activity.
- **Timeline reconstruction:** Chronological ordering depends on the accuracy and availability of source timestamps.
- **What-If simulation:** Simulated outcomes are hypothetical and should not be treated as actual historical events.

Final investigative conclusions require human examination, contextual validation, and appropriate forensic procedures.

---

## 16. Future Scope

Potential areas for further development include:

- Support for additional digital evidence formats.
- More advanced cross-source correlation.
- Enhanced detection and explainability.
- Expanded forensic visualization.
- Additional report export formats.
- Integration with more digital forensic data sources.
- Extended audit and evidence-chain documentation.

---

## 17. Team Information

| Field | Details |
|---|---|
| Team Name | Sherlock Bytes |
| Project | TATTVA FORENSICS |
| Event | SUTRAM 2026 |
| Problem Statement | SUTRAMPS03 / PS003 |
| Problem Statement Title | Digital Evidence Correlation and Crime Reconstruction Engine |
| Team Lead | Vriti Goyal |

---

<p align="center">
  <strong>TATTVA FORENSICS</strong><br>
  <em>Look Beyond the Alert.</em><br><br>
  Built to help investigators connect evidence, reconstruct events, and uncover the bigger picture.
</p>
