
import { useState } from "react";
import "./App.css";

function App() {
  const [activePage, setActivePage] = useState("Dashboard");
  const [selectedEvidence, setSelectedEvidence] = useState(null);
  const [evidenceRecords, setEvidenceRecords] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [sourceType, setSourceType] = useState("authentication");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");
  const [investigationId, setInvestigationId] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);

  const filteredEvidence = evidenceRecords.map((record) => ({
    id: record.evidence_id,
    name: record.file_path || record.raw_record_reference || record.evidence_id,
    type: record.source_type,
    status: "Processed",
  }));
  const handleUpload = async (event) => {
    event.preventDefault();

    if (!selectedFile) {
      setUploadError("Please select a file first.");
      return;
    }

    setUploading(true);
    setUploadError("");
    setUploadSuccess("");

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("source_type", sourceType);

    try {
      const response = await fetch("/analyze", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Evidence upload failed.");
      }

      setEvidenceRecords(data.evidence_records || []);
      setInvestigationId(data.investigation_id);
      setAnalysisResult(data);

      setUploadSuccess("Evidence uploaded and analyzed successfully!");
      setSelectedFile(null);
    } catch (error) {
      setUploadError(error.message);
    } finally {
      setUploading(false);
    }
  };
  const menuItems = [
    "Dashboard",
    "Evidence Explorer",
    "Incident Timeline",
    "Evidence Graph",
    "What-If Simulator",
    "Reports",
  ];

  const stats = [
    { title: "Total Evidence", value: "40", note: "Evidence records", icon: "▣" },
    { title: "Active Investigations", value: "04", note: "Currently active", icon: "⌕" },
    { title: "Detected Findings", value: "08", note: "Findings identified", icon: "◈" },
    { title: "Relationships", value: "12", note: "Connections identified", icon: "⌘" },
  ];

  const activities = [
    { title: "New evidence uploaded", detail: "Evidence record EVD-001 added.", time: "10 minutes ago", color: "blue" },
    { title: "Finding detected", detail: "Suspicious activity identified in Case #104.", time: "35 minutes ago", color: "purple" },
    { title: "Evidence relationship identified", detail: "Two digital evidence records connected.", time: "1 hour ago", color: "green" },
    { title: "Investigation updated", detail: "Case #102 status changed.", time: "3 hours ago", color: "orange" },
  ];

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">TF</div>
          <div>
            <h2>Tattva Forensics</h2>
            <span>Digital Investigation Platform</span>
          </div>
        </div>

        <p className="menu-heading">WORKSPACE</p>

        <nav>
          {menuItems.map((item, index) => (
            <button
              key={item}
              className={`nav-item ${activePage === item ? "active" : ""}`}
              onClick={() => setActivePage(item)}
            >
              <span className="nav-icon">
                {["▦", "▣", "◷", "◎", "⇄", "▤"][index]}
              </span>
              {item}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-avatar">TF</div>
          <div>
            <strong>Investigation Team</strong>
            <small>Workspace Member</small>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <span className="eyebrow">INVESTIGATION WORKSPACE</span>
            <h1>{activePage}</h1>
          </div>
          <button className="primary-button">
            + New Investigation
          </button>
        </header>

        {activePage === "Dashboard" ? (
          <>
            <section className="welcome-card">
              <div>
                <span className="eyebrow">CASE MONITORING</span>
                <h2>Investigation Overview</h2>
                <p>
                  Monitor evidence, findings and investigation activity
                  from one workspace.
                </p>
              </div>
              <div className="system-status">
                <span className="status-dot"></span>
                SYSTEM READY
              </div>
            </section>

            <section className="information-card">
              <h3>Upload Digital Evidence</h3>
              <p>Upload forensic logs for automated investigation and analysis.</p>

              <form onSubmit={handleUpload}>
                <input
                  type="file"
                  accept=".log,.txt,.csv,.json"
                  onChange={(event) => setSelectedFile(event.target.files[0] || null)}
                />

                <select
                  value={sourceType}
                  onChange={(event) => setSourceType(event.target.value)}
                >
                  <option value="authentication">Authentication</option>
                  <option value="file">File Activity</option>
                  <option value="network">Network</option>
                  <option value="archive">Archive</option>
                </select>

                <button type="submit" className="primary-button" disabled={uploading}>
                  {uploading ? "Analyzing..." : "Upload & Analyze"}
                </button>
              </form>

              {uploadError && <p role="alert">{uploadError}</p>}
              {uploadSuccess && <p>{uploadSuccess}</p>}

              {investigationId && (
                <p>
                  Investigation ID: <strong>{investigationId}</strong>
                </p>
              )}

              {analysisResult && (
                <p>
                  Evidence: {analysisResult.evidence_records?.length || 0} |
                  Findings: {analysisResult.detection?.total_findings || 0} |
                  Anomalies: {analysisResult.anomaly_detection?.anomaly_count || 0}
                </p>
              )}
            </section>

            <section className="stats-grid">
              {stats.map((stat) => (
                <div className="stat-card" key={stat.title}>
                  <div className="stat-top">
                    <span>{stat.title}</span>
                    <span className="stat-icon">{stat.icon}</span>
                  </div>
                  <h2>{stat.value}</h2>
                  <p>{stat.note}</p>
                </div>
              ))}
            </section>

            <section className="activity-section">
              <div className="section-heading">
                <div>
                  <h2>Recent Activity</h2>
                  <p>Latest updates across your investigations</p>
                </div>
                <button className="text-button">View all</button>
              </div>

              <div className="activity-card">
                {activities.map((activity) => (
                  <div className="activity-item" key={activity.title}>
                    <span className={`activity-marker ${activity.color}`}></span>
                    <div className="activity-details">
                      <strong>{activity.title}</strong>
                      <p>{activity.detail}</p>
                    </div>
                    <span className="activity-time">{activity.time}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="bottom-grid">
              <div className="information-card">
                <h3>Investigation Status</h3>
                <p>Overview of current case progress</p>
                <div className="progress-row">
                  <span>Under Investigation</span>
                  <strong>2 cases</strong>
                </div>
                <div className="progress-track">
                  <div className="progress-fill first"></div>
                </div>
                <div className="progress-row">
                  <span>Review Pending</span>
                  <strong>1 case</strong>
                </div>
                <div className="progress-track">
                  <div className="progress-fill second"></div>
                </div>
                <div className="progress-row">
                  <span>Completed</span>
                  <strong>1 case</strong>
                </div>
                <div className="progress-track">
                  <div className="progress-fill third"></div>
                </div>
              </div>

              <div className="information-card quick-card">
                <h3>Quick Access</h3>
                <p>Navigate to important investigation tools</p>
                <button onClick={() => setActivePage("Evidence Explorer")}>
                  + Explore Evidence
                </button>
                <button onClick={() => setActivePage("Incident Timeline")}>
                  ◷ View Incident Timeline
                </button>
                <button onClick={() => setActivePage("Evidence Graph")}>
                  ◎ Open Evidence Graph
                </button>
              </div>
            </section>
          </>
        ) : activePage === "Evidence Explorer" ? (
<>
          <section className="evidence-page">
  <div className="page-heading">
    <div>
      <span className="eyebrow">INVESTIGATION WORKSPACE</span>
      <h2>Evidence Explorer</h2>
      <p>View and examine digital evidence collected during investigations.</p>
    </div>
  </div>

  <div className="information-card">
    <h3>Evidence Records</h3>
    <p>Sample evidence records for the frontend demonstration.</p>

    <table className="evidence-table">
      <thead>
        <tr>
          <th>Evidence ID</th>
          <th>Evidence Name</th>
          <th>Evidence Type</th>
          <th>Status</th>
        </tr>
      </thead>

      <tbody>
        {filteredEvidence.map((evidence) => (
          <tr key={evidence.id}>
            <td>{evidence.id}</td>
            <td>{evidence.name}</td>
            <td>{evidence.type}</td>
            <td>{evidence.status}</td>
          </tr>
        ))}
        <tr>
          <td>EV-002</td>
          <td>Network Traffic</td>
          <td>Network</td>
          <td>Under Review</td>
        </tr>
        <tr>
          <td>EV-003</td>
          <td>Disk Image</td>
          <td>Disk</td>
          <td>Processed</td>
        </tr>
        <tr>
          <td>EV-004</td>
          <td>Browser History</td>
          <td>Browser</td>
          <td>Pending</td>
        </tr>
      </tbody>
    </table>
  </div>
</section>
</>
) : activePage === "Incident Timeline" ? (
          <>
            <section className="timeline-page">
              <div className="page-heading">
                <div>
                  <span className="eyebrow">INVESTIGATION WORKSPACE</span>
                  <h2>Incident Timeline</h2>
                  <p>
                    View and track important events in chronological order.
                  </p>
                </div>
              </div>

              <div className="information-card">
                <h3>Investigation Activity</h3>
                <p>
                  A chronological record of events identified during the
                  investigation.
                </p>
              </div>

              <div className="timeline-container">

                <div className="timeline-item">
                  <div className="timeline-dot"></div>
                  <div className="timeline-content">
                    <span className="timeline-time">09:15 AM · 18 Nov 2026</span>
                    <h3>System Log Generated</h3>
                    <p>
                      A new system log entry was recorded and added to the
                      investigation.
                    </p>
                    <span className="timeline-evidence">Evidence: EV-001</span>
                  </div>
                </div>

                <div className="timeline-item">
                  <div className="timeline-dot"></div>
                  <div className="timeline-content">
                    <span className="timeline-time">10:30 AM · 18 Nov 2026</span>
                    <h3>Network Traffic Captured</h3>
                    <p>
                      Network traffic data was collected for further
                      examination.
                    </p>
                    <span className="timeline-evidence">Evidence: EV-002</span>
                  </div>
                </div>

                <div className="timeline-item">
                  <div className="timeline-dot"></div>
                  <div className="timeline-content">
                    <span className="timeline-time">11:45 AM · 18 Nov 2026</span>
                    <h3>Disk Image Added</h3>
                    <p>
                      A disk image was added to the evidence collection.
                    </p>
                    <span className="timeline-evidence">Evidence: EV-003</span>
                  </div>
                </div>

                <div className="timeline-item">
                  <div className="timeline-dot"></div>
                  <div className="timeline-content">
                    <span className="timeline-time">01:00 PM · 18 Nov 2026</span>
                    <h3>Browser History Received</h3>
                    <p>
                      Browser history evidence was received and marked as
                      pending review.
                    </p>
                    <span className="timeline-evidence">Evidence: EV-004</span>
                  </div>
                </div>

              </div>
            </section>
          </>
        
) : activePage === "Evidence Graph" ? (
  <>
    <section className="graph-page">

      <div className="page-heading">
        <div>
          <span className="eyebrow">INVESTIGATION WORKSPACE</span>
          <h2>Evidence Graph</h2>
          <p>
            Explore relationships and connections between digital evidence.
          </p>
        </div>
      </div>

      <div className="information-card">
        <h3>Evidence Relationship Map</h3>
        <p>
          Visual representation of evidence items and their associated
          relationships.
        </p>
      </div>

      <div className="graph-layout">

        <div className="graph-canvas">

          <svg className="graph-connections" viewBox="0 0 700 420">
            <line x1="350" y1="210" x2="150" y2="90" />
            <line x1="350" y1="210" x2="550" y2="90" />
            <line x1="350" y1="210" x2="150" y2="330" />
            <line x1="350" y1="210" x2="550" y2="330" />
          </svg>

          <div className="graph-node node-center">
            <span>CASE</span>
            <strong>Investigation</strong>
          </div>

          
<div
  className="graph-node node-one"
  onClick={() =>
    setSelectedEvidence({
      id: "EV-001",
      name: "System Log File",
      type: "Log",
      status: "Processed",
      description: "System activity records collected during the investigation."
    })
  }
>
  <span>LOG</span>
  <strong>EV-001</strong>
  <small>System Log</small>
</div>

<div
  className="graph-node node-two"
  onClick={() =>
    setSelectedEvidence({
      id: "EV-002",
      name: "Network Traffic",
      type: "Network",
      status: "Under Review",
      description: "Network communication records collected for analysis."
    })
  }
>
  <span>NETWORK</span>
  <strong>EV-002</strong>
  <small>Network Traffic</small>
</div>

<div
  className="graph-node node-three"
  onClick={() =>
    setSelectedEvidence({
      id: "EV-003",
      name: "Disk Image",
      type: "Disk",
      status: "Processed",
      description: "A digital disk image retained for forensic examination."
    })
  }
>
  <span>DISK</span>
  <strong>EV-003</strong>
  <small>Disk Image</small>
</div>

<div
  className="graph-node node-four"
  onClick={() =>
    setSelectedEvidence({
      id: "EV-004",
      name: "Browser History",
      type: "Browser",
      status: "Pending",
      description: "Browser activity records awaiting forensic examination."
    })
  }
>
  <span>BROWSER</span>
  <strong>EV-004</strong>
  <small>Browser History</small>
</div>


        </div>

        <div className="graph-legend">
          {selectedEvidence && (
            <div className="information-card">
              <h3>{selectedEvidence.name}</h3>
              <p>Evidence ID: {selectedEvidence.id}</p>
              <p>Type: {selectedEvidence.type}</p>
              <p>Status: {selectedEvidence.status}</p>
              <p>{selectedEvidence.description}</p>

              <button onClick={() => setSelectedEvidence(null)}>
                Close Details
              </button>
            </div>
          )}
          <h3>Graph Legend</h3>
          <p>Blue: Investigation node</p>
          <p>Green: Log evidence</p>
          <p>Orange: Network evidence</p>
          <p>Purple: Disk evidence</p>
          <p>Pink: Browser evidence</p>
        </div>

      </div>

    </section>
  </>
) : (

          <section className="welcome-card page-placeholder">
            <div>
              <span className="eyebrow">TATTVA FORENSICS WORKSPACE</span>
              <h2>{activePage}</h2>
              <p>
                This module is being prepared. Its interface and functionality
                will be added in the next development steps.
              </p>
              <button
                className="primary-button"
                onClick={() => setActivePage("Dashboard")}
              >
                Back to Dashboard
              </button>
            </div>
          </section>
        )}

        <footer className="footer">
          Tattva Forensics · AI-Assisted Digital Evidence Correlation
        </footer>
      </main>
    </div>
  );
}

export default App;
