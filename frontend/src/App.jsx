
import { useState } from "react";
import "./App.css";

function App() {
  const [activePage, setActivePage] = useState("Dashboard");

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
