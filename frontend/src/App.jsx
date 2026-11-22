import { useCallback, useEffect, useState } from "react";
import {
  CreateInvestigationModal,
  InvestigationList,
  InvestigationWorkspace,
} from "./InvestigationManagement.jsx";
import { formatDate, requestJson } from "./investigationApi.js";
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
  const [investigationId, setInvestigationId] = useState(() => {
    try {
      return window.localStorage.getItem("tattva:selected-investigation") || "";
    } catch {
      return "";
    }
  });
  const [investigation, setInvestigation] = useState(null);
  const [investigations, setInvestigations] = useState([]);
  const [investigationsLoading, setInvestigationsLoading] = useState(false);
  const [investigationsError, setInvestigationsError] = useState("");
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState("");
  const [workspaceNotice, setWorkspaceNotice] = useState("");
  const [workspaceUploading, setWorkspaceUploading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [findingsData, setFindingsData] = useState(null);
  const [anomaliesData, setAnomaliesData] = useState(null);
  const [investigationSummary, setInvestigationSummary] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  // Backend timeline and evidence graph data
  const [timelineRecords, setTimelineRecords] = useState([]);
  const [graphData, setGraphData] = useState({
    nodes: [],
    edges: [],
  });
  // What-If Simulator state
  const [selectedEvidenceId, setSelectedEvidenceId] = useState("");
  const [scenarioName, setScenarioName] = useState(
    "Exclude selected evidence"
  );
  const [simulationLoading, setSimulationLoading] = useState(false);
  const [simulationError, setSimulationError] = useState("");
  const [simulationResult, setSimulationResult] = useState(null);
  const [simulationComparison, setSimulationComparison] = useState(null);
  const [scenarioId, setScenarioId] = useState(null);
  const [auditHistory, setAuditHistory] = useState([]);
  // Prepare actual evidence records received from the backend.
  const filteredEvidence = evidenceRecords.map((record) => ({
    id: record.evidence_id,
    name:
      record.file_path ||
      record.operation ||
      record.original_event_type ||
      record.event_type ||
      record.raw_record_reference ||
      record.evidence_id,
    type: record.source_type,
    status: "Processed",
  }));

  const refreshInvestigations = useCallback(async () => {
    setInvestigationsLoading(true);
    setInvestigationsError("");
    try {
      const rows = await requestJson("/investigations");
      const enrichedRows = await Promise.all(
        rows.map(async (item) => {
          const detail = await requestJson(
            `/investigations/${encodeURIComponent(item.investigation_id)}`
          );
          return {
            ...item,
            total_findings:
              detail.analysis?.detection?.total_findings ?? 0,
          };
        })
      );
      setInvestigations(enrichedRows);
      return enrichedRows;
    } catch (error) {
      setInvestigationsError(error.message);
      return null;
    } finally {
      setInvestigationsLoading(false);
    }
  }, []);

  const loadInvestigation = useCallback(async (id) => {
    setWorkspaceLoading(true);
    setWorkspaceError("");
    setInvestigation(null);
    setAnalysisResult(null);
    setEvidenceRecords([]);
    setFindingsData(null);
    setAnomaliesData(null);
    setInvestigationSummary(null);
    setTimelineRecords([]);
    setGraphData({ nodes: [], edges: [] });
    setSimulationResult(null);
    setSimulationComparison(null);
    setScenarioId(null);
    setAuditHistory([]);
    setSelectedEvidenceId("");
    setSelectedEvidence(null);

    try {
      const detail = await requestJson(
        `/investigations/${encodeURIComponent(id)}`
      );
      setInvestigation(detail);

      const analysis = detail.analysis;
      if (!analysis) {
        return detail;
      }

      const endpoints = [
        `/investigations/${encodeURIComponent(id)}/summary`,
        `/investigations/${encodeURIComponent(id)}/findings`,
        `/investigations/${encodeURIComponent(id)}/anomalies`,
        `/investigations/${encodeURIComponent(id)}/timeline`,
        `/investigations/${encodeURIComponent(id)}/graph`,
      ];
      const results = await Promise.allSettled(
        endpoints.map((endpoint) => requestJson(endpoint))
      );
      const failures = results.flatMap((result, index) =>
        result.status === "rejected"
          ? [endpoints[index].split("/").pop()]
          : []
      );
      const summary =
        results[0].status === "fulfilled"
          ? results[0].value
          : {
              total_evidence: analysis.evidence_records?.length ?? 0,
              total_findings: analysis.detection?.total_findings ?? 0,
              total_anomalies:
                analysis.anomaly_detection?.anomaly_count ?? 0,
              filename: analysis.metadata?.filename,
              integrity_status: analysis.metadata?.integrity_status,
            };
      const findings =
        results[1].status === "fulfilled"
          ? results[1].value
          : analysis.detection;
      const anomalies =
        results[2].status === "fulfilled"
          ? results[2].value
          : analysis.anomaly_detection;
      const timeline =
        results[3].status === "fulfilled"
          ? results[3].value.timeline
          : analysis.evidence_records || [];
      const graph =
        results[4].status === "fulfilled"
          ? results[4].value
          : analysis.correlation?.graph;

      setInvestigationSummary(summary);
      setFindingsData(findings);
      setAnomaliesData(anomalies);
      setEvidenceRecords(analysis.evidence_records || []);
      setAnalysisResult({
        ...analysis,
        detection: findings,
        anomaly_detection: anomalies,
      });
      setTimelineRecords(timeline || []);
      setGraphData({
        nodes: graph?.nodes || [],
        edges: graph?.edges || [],
      });
      setWorkspaceError(
        failures.length
          ? `Some investigation data could not be refreshed (${failures.join(
              ", "
            )}). Showing the persisted analysis where available.`
          : ""
      );
      return detail;
    } catch (error) {
      setWorkspaceError(error.message);
      throw error;
    } finally {
      setWorkspaceLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(refreshInvestigations);
  }, [refreshInvestigations]);

  useEffect(() => {
    try {
      if (investigationId) {
        window.localStorage.setItem(
          "tattva:selected-investigation",
          investigationId
        );
        Promise.resolve()
          .then(() => loadInvestigation(investigationId))
          .catch((error) => {
            if (error.status === 404) {
              setInvestigationId("");
              setActivePage("Investigations");
              setInvestigation(null);
              setAnalysisResult(null);
              setEvidenceRecords([]);
              setFindingsData(null);
              setAnomaliesData(null);
              setTimelineRecords([]);
              setGraphData({ nodes: [], edges: [] });
            }
          });
      } else {
        window.localStorage.removeItem("tattva:selected-investigation");
      }
    } catch {
      if (investigationId) {
        Promise.resolve()
          .then(() => loadInvestigation(investigationId))
          .catch(() => {});
      }
    }
  }, [investigationId, loadInvestigation]);

  const openInvestigation = useCallback(
    (id) => {
      setWorkspaceNotice("");
      setWorkspaceError("");
      setActivePage("Investigation Workspace");
      if (id === investigationId) {
        loadInvestigation(id).catch(() => {});
      } else {
        setInvestigationId(id);
      }
    },
    [investigationId, loadInvestigation]
  );

  const handleInvestigationCreated = async (created) => {
    await refreshInvestigations();
    setShowCreateModal(false);
    setWorkspaceNotice(
      `Investigation created successfully. ID: ${created.investigation_id}`
    );
    setActivePage("Investigation Workspace");
    setInvestigationId(created.investigation_id);
  };

  const handleAddEvidence = async (file, type) => {
    if (!investigationId) {
      setWorkspaceError("Select an investigation before adding evidence.");
      return false;
    }

    setWorkspaceUploading(true);
    setWorkspaceError("");
    setWorkspaceNotice("");
    const formData = new FormData();
    formData.append("file", file);
    formData.append("source_type", type);

    try {
      const result = await requestJson(
        `/investigations/${encodeURIComponent(investigationId)}/evidence`,
        { method: "POST", body: formData }
      );
      setWorkspaceNotice(
        `${result.evidence_file.filename} was uploaded and analyzed in this investigation.`
      );
      await refreshInvestigations();
      try {
        await loadInvestigation(investigationId);
      } catch {
        setWorkspaceError(
          "Evidence was uploaded, but the latest investigation details could not be refreshed."
        );
      }
      return true;
    } catch (error) {
      setWorkspaceError(error.message);
      return false;
    } finally {
      setWorkspaceUploading(false);
    }
  };
  // Create and execute a What-If simulation using the backend.
  const handleRunSimulation = async () => {
    setSimulationError("");
    setSimulationResult(null);
    setSimulationComparison(null);

    if (!investigationId || !analysisResult?.baseline_analysis_id) {
      setSimulationError(
        "Please upload and analyze evidence before running a simulation."
      );
      return;
    }

    if (!selectedEvidenceId) {
      setSimulationError("Please select an evidence record to exclude.");
      return;
    }

    setSimulationLoading(true);

    try {
      // 1. Create a scenario
      const createResponse = await fetch("/api/simulations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          investigation_id: investigationId,
          baseline_analysis_id: analysisResult.baseline_analysis_id,
          scenario_name: scenarioName,
          description: "Frontend-generated What-If simulation",
        }),
      });

      const createdScenario = await createResponse.json();

      if (!createResponse.ok) {
        throw new Error(
          createdScenario.detail || "Could not create simulation scenario."
        );
      }

      const newScenarioId = createdScenario.scenario_id;

      if (!newScenarioId) {
        throw new Error("Backend did not return a scenario ID.");
      }

      setScenarioId(newScenarioId);

      // 2. Exclude the selected evidence
      const excludeResponse = await fetch(
        `/api/simulations/${newScenarioId}/exclude`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            evidence_id: selectedEvidenceId,
          }),
        }
      );

      const excludeData = await excludeResponse.json();

      if (!excludeResponse.ok) {
        throw new Error(
          excludeData.detail || "Could not exclude selected evidence."
        );
      }

      // 3. Run the simulation
      const runResponse = await fetch(
        `/api/simulations/${newScenarioId}/run`,
        {
          method: "POST",
        }
      );

      const runData = await runResponse.json();

      if (!runResponse.ok) {
        throw new Error(
          runData.detail || "Simulation execution failed."
        );
      }

      setSimulationResult(runData.result);

      // 4. Compare simulated result with original baseline
      const compareResponse = await fetch(
        `/api/simulations/${newScenarioId}/compare`
      );

      const compareData = await compareResponse.json();

      if (!compareResponse.ok) {
        throw new Error(
          compareData.detail || "Could not compare simulation results."
        );
      }

      setSimulationComparison(compareData);
      // 5. Fetch scenario audit history
      const historyResponse = await fetch(
        `/api/simulations/${newScenarioId}/history`
      );

      const historyData = await historyResponse.json();

      if (!historyResponse.ok) {
        throw new Error(
          historyData.detail || "Could not fetch audit history."
        );
      }

      setAuditHistory(
        Array.isArray(historyData)
          ? historyData
          : historyData.history || historyData.audit_history || []
      );
    } catch (error) {
      setSimulationError(error.message);
    } finally {
      setSimulationLoading(false);
    }
  };

  // Keep the legacy quick-analysis workflow available from the dashboard.
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
      const data = await requestJson("/analyze", {
        method: "POST",
        body: formData,
      });

      setWorkspaceNotice(
        `Evidence analyzed successfully. Investigation ID: ${data.investigation_id}`
      );
      setActivePage("Investigation Workspace");
      setInvestigationId(data.investigation_id);
      setUploadSuccess(`Analysis complete for ${data.investigation_id}.`);
      setSelectedFile(null);
      await refreshInvestigations();
    } catch (error) {
      setUploadError(error.message);
    } finally {
      setUploading(false);
    }
  };

  const menuItems = [
    { label: "Dashboard", icon: "▦" },
    { label: "Evidence Explorer", icon: "▣" },
    { label: "Incident Timeline", icon: "◷" },
    { label: "Evidence Graph", icon: "◎" },
    { label: "What-If Simulator", icon: "⇄" },
    { label: "Reports", icon: "▤" },
    { label: "Investigations", icon: "⌕" },
  ];

  const totalInvestigations = investigations.length;
  const activeInvestigations = investigations.filter(
    (item) => !["completed", "closed"].includes(item.status.toLowerCase())
  ).length;
  const totalEvidenceFiles = investigations.reduce(
    (total, item) => total + (item.evidence_file_count || 0),
    0
  );
  const totalFindings = investigations.reduce(
    (total, item) => total + (item.total_findings || 0),
    0
  );

  const stats = [
    {
      title: "Total Investigations",
      value: String(totalInvestigations),
      note: "Cases in this workspace",
      icon: "▣",
    },
    {
      title: "Active Investigations",
      value: String(activeInvestigations),
      note: "Not completed or closed",
      icon: "⌕",
    },
    {
      title: "Evidence Files",
      value: String(totalEvidenceFiles),
      note: "Files across investigations",
      icon: "◈",
    },
    {
      title: "Total Findings",
      value: String(totalFindings),
      note: "Findings across investigations",
      icon: "⌘",
    },
  ];
  const recentInvestigations = investigations.slice(0, 5);

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
          {menuItems.map((item) => (
            <button
              key={item.label}
              className={`nav-item ${
                activePage === item.label ? "active" : ""
              }`}
              onClick={() => setActivePage(item.label)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
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
            <span className="eyebrow">
              INVESTIGATION WORKSPACE
            </span>

            <h1>{activePage}</h1>
          </div>

          <button
            className="primary-button"
            onClick={() => setShowCreateModal(true)}
          >
            + New Investigation
          </button>
        </header>

        {/* DASHBOARD */}
        {activePage === "Dashboard" ? (
          <>
            <section className="welcome-card">
              <div>
                <span className="eyebrow">
                  CASE MONITORING
                </span>

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

            {/* EVIDENCE UPLOAD */}
            <section className="information-card">
              <h3>Upload Digital Evidence</h3>

              <p>
                Upload forensic logs for automated investigation and
                analysis.
              </p>

              <form onSubmit={handleUpload}>
                <input
                  type="file"
                  accept=".log,.txt,.csv,.json"
                  onChange={(event) =>
                    setSelectedFile(
                      event.target.files[0] || null
                    )
                  }
                />

                <select
                  value={sourceType}
                  onChange={(event) =>
                    setSourceType(event.target.value)
                  }
                >
                  <option value="authentication">
                    Authentication
                  </option>

                  <option value="file">
                    File Activity
                  </option>

                  <option value="network">
                    Network
                  </option>

                  <option value="archive">
                    Archive
                  </option>
                </select>

                <button
                  type="submit"
                  className="primary-button"
                  disabled={uploading}
                >
                  {uploading
                    ? "Analyzing..."
                    : "Upload & Analyze"}
                </button>
              </form>

              {uploadError && (
                <p role="alert">{uploadError}</p>
              )}

              {uploadSuccess && (
                <p className="success-message" role="status">
                  {uploadSuccess}
                </p>
              )}

              {investigationId && investigation && (
                <p>
                  Current investigation: <strong>{investigation.name}</strong>
                  {" · "}
                  {investigationId}
                </p>
              )}
            </section>

            {/* DASHBOARD STATISTICS */}
            <section className="stats-grid">
              {stats.map((stat) => (
                <div className="stat-card" key={stat.title}>
                  <div className="stat-top">
                    <span>{stat.title}</span>
                    <span className="stat-icon">
                      {stat.icon}
                    </span>
                  </div>

                  <h2>{stat.value}</h2>
                  <p>{stat.note}</p>
                </div>
              ))}
            </section>

            {investigationsError && (
              <p className="management-message error-message" role="alert">
                {investigationsError}
                {" "}
                <button
                  className="text-button"
                  onClick={refreshInvestigations}
                >
                  Retry
                </button>
              </p>
            )}

            {/* RECENT INVESTIGATIONS */}
            <section className="activity-section">
              <div className="section-heading">
                <div>
                  <h2>Recent Investigations</h2>
                  <p>Recently updated cases in this workspace.</p>
                </div>
                <button
                  className="text-button"
                  onClick={() => setActivePage("Investigations")}
                >
                  View all investigations
                </button>
              </div>

              <div className="activity-card">
                {investigationsLoading ? (
                  <p className="management-state">
                    Loading recent investigations...
                  </p>
                ) : recentInvestigations.length ? (
                  recentInvestigations.map((item) => (
                  <div
                    className="activity-item"
                    key={item.investigation_id}
                  >
                    <div className="activity-details">
                      <strong>{item.name}</strong>
                      <p>
                        {item.investigation_id}
                        {" · "}
                        {item.evidence_file_count} evidence files
                        {" · "}
                        {item.total_findings} findings
                      </p>
                    </div>
                    <span className="activity-time">
                      {formatDate(item.updated_at)}
                    </span>
                    <span className="status-pill">{item.status}</span>
                    <button
                      className="secondary-button"
                      onClick={() => openInvestigation(item.investigation_id)}
                    >
                      Open
                    </button>
                  </div>
                  ))
                ) : (
                  <p className="management-state">
                    No investigations yet. Create one to begin.
                  </p>
                )}
              </div>
            </section>

            {/* DASHBOARD SHORTCUTS */}
            <section className="bottom-grid">
              <div className="information-card">
                <h3>Selected Investigation</h3>
                {investigation ? (
                  <>
                    <p>
                      {investigation.name} · {investigation.investigation_id}
                    </p>
                    <p>
                      {analysisResult?.evidence_records?.length ?? 0} records
                      {" · "}
                      {analysisResult?.detection?.total_findings ?? 0} findings
                    </p>
                    <button
                      className="text-button"
                      onClick={() => setActivePage("Investigation Workspace")}
                    >
                      Open workspace
                    </button>
                  </>
                ) : (
                  <p>Select an investigation to see its current analysis.</p>
                )}
              </div>

              <div className="information-card quick-card">
                <h3>Quick Access</h3>

                <p>
                  Navigate to important investigation tools
                </p>

                <button
                  onClick={() =>
                    setActivePage("Evidence Explorer")
                  }
                >
                  + Explore Evidence
                </button>

                <button
                  onClick={() =>
                    setActivePage("Incident Timeline")
                  }
                >
                  ◷ View Incident Timeline
                </button>

                <button
                  onClick={() =>
                    setActivePage("Evidence Graph")
                  }
                >
                  ◎ Open Evidence Graph
                </button>
              </div>
            </section>
          </>
        ) : activePage === "Investigations" ? (
          <InvestigationList
            investigations={investigations}
            loading={investigationsLoading}
            error={investigationsError}
            onRetry={refreshInvestigations}
            onOpen={openInvestigation}
            onCreate={() => setShowCreateModal(true)}
          />
        ) : activePage === "Investigation Workspace" ? (
          <InvestigationWorkspace
            investigation={investigation}
            analysis={analysisResult}
            summary={investigationSummary}
            findings={findingsData}
            anomalies={anomaliesData}
            loading={workspaceLoading}
            error={workspaceError}
            notice={workspaceNotice}
            uploading={workspaceUploading}
            onUpload={handleAddEvidence}
          />
        ) : activePage === "Evidence Explorer" ? (
          /* EVIDENCE EXPLORER */
          <section className="evidence-page">
            <div className="page-heading">
              <div>
                <span className="eyebrow">
                  INVESTIGATION WORKSPACE
                </span>

                <h2>Evidence Explorer</h2>

                <p>
                  View and examine digital evidence collected during
                  investigations.
                </p>
              </div>
            </div>

            <div className="information-card">
              <h3>Evidence Records</h3>

              <p>
                Actual digital evidence records collected and
                processed during the investigation.
              </p>

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
                  {filteredEvidence.length > 0 ? (
                    filteredEvidence.map((evidence) => (
                      <tr key={evidence.id}>
                        <td>{evidence.id}</td>
                        <td>{evidence.name}</td>
                        <td>{evidence.type}</td>
                        <td>{evidence.status}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4">
                        No evidence uploaded yet. Upload a forensic
                        file to begin.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : activePage === "Incident Timeline" ? (
          /* INCIDENT TIMELINE - REAL BACKEND DATA */
          <section className="timeline-page">
            <div className="page-heading">
              <div>
                <span className="eyebrow">
                  INVESTIGATION WORKSPACE
                </span>

                <h2>Incident Timeline</h2>

                <p>
                  View and track important events in chronological
                  order.
                </p>
              </div>
            </div>

            <div className="information-card">
              <h3>Investigation Activity</h3>

              <p>
                A chronological record of events identified during
                the investigation.
              </p>
            </div>

            <div className="timeline-container">
              {timelineRecords.length > 0 ? (
                timelineRecords.map((record, index) => (
                  <div
                    className="timeline-item"
                    key={record.evidence_id || index}
                  >
                    <div className="timeline-dot"></div>

                    <div className="timeline-content">
                      <span className="timeline-time">
                        {record.timestamp
                          ? new Date(record.timestamp).toLocaleString()
                          : "Timestamp unavailable"}
                      </span>

                      <h3>
                        {record.event_type ||
                          record.original_event_type ||
                          "Evidence Event"}
                      </h3>

                      <p>
                        {[
                          record.source_type &&
                            `Source: ${record.source_type}`,
                          record.user_id &&
                            `User: ${record.user_id}`,
                          record.ip_address &&
                            `IP: ${record.ip_address}`,
                          record.file_path &&
                            `File: ${record.file_path}`,
                          record.operation &&
                            `Operation: ${record.operation}`,
                        ]
                          .filter(Boolean)
                          .join(" | ") ||
                          "Evidence record received and processed."}
                      </p>

                      <span className="timeline-evidence">
                        Evidence: {record.evidence_id || "N/A"}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="information-card">
                  <h3>No Timeline Events</h3>

                  <p>
                    Upload and analyze an evidence file to view its
                    events in chronological order.
                  </p>
                </div>
              )}
            </div>
          </section>
        ) : activePage === "Evidence Graph" ? (
          /* EVIDENCE GRAPH - REAL BACKEND DATA */
          <section className="graph-page">
            <div className="page-heading">
              <div>
                <span className="eyebrow">
                  INVESTIGATION WORKSPACE
                </span>

                <h2>Evidence Graph</h2>

                <p>
                  Explore relationships and connections between
                  digital evidence.
                </p>
              </div>
            </div>

            <div className="information-card">
              <h3>Evidence Relationship Map</h3>

              <p>
                Visual representation of evidence items and their
                associated relationships.
              </p>

              <p>
                Evidence Nodes: {graphData.nodes.length} | Relationships:{" "}
                {graphData.edges.length}
              </p>
            </div>

            <div className="graph-layout">
              <div className="graph-canvas">
                {graphData.nodes.length > 0 ? (
                  <>
                    <svg
                      className="graph-connections"
                      viewBox="0 0 700 420"
                    >
                      {graphData.edges.map((edge, index) => {
                        const sourceIndex = graphData.nodes.findIndex(
                          (node) => node.id === edge.source
                        );

                        const targetIndex = graphData.nodes.findIndex(
                          (node) => node.id === edge.target
                        );

                        if (sourceIndex === -1 || targetIndex === -1) {
                          return null;
                        }

                        const count = graphData.nodes.length;

                        const sourceAngle =
                          -Math.PI / 2 +
                          (sourceIndex * 2 * Math.PI) / count;

                        const targetAngle =
                          -Math.PI / 2 +
                          (targetIndex * 2 * Math.PI) / count;

                        const sourceX = 350 + 224 * Math.cos(sourceAngle);
                        const sourceY = 210 + 147 * Math.sin(sourceAngle);

                        const targetX = 350 + 224 * Math.cos(targetAngle);
                        const targetY = 210 + 147 * Math.sin(targetAngle);

                        return (
                          <line
                            key={`${edge.source}-${edge.target}-${index}`}
                            x1={sourceX}
                            y1={sourceY}
                            x2={targetX}
                            y2={targetY}
                            stroke="#8bbcff"
                            strokeWidth="2"
                            strokeDasharray="6 5"
                          >
                            <title>
                              {edge.relationship_type || "Related evidence"}
                              {" | Score: "}
                              {edge.relationship_score ?? "N/A"}
                            </title>
                          </line>
                        );
                      })}
                    </svg>

                    <div className="graph-node node-center">
                      <span>CASE</span>
                      <strong>Investigation</strong>
                    </div>

                    {graphData.nodes.map((node, index) => {
                      const angle =
                        -Math.PI / 2 +
                        (index * 2 * Math.PI) / graphData.nodes.length;

                      const left = 50 + 32 * Math.cos(angle);
                      const top = 50 + 35 * Math.sin(angle);

                      return (
                        <div
                          key={node.id}
                          className="graph-node"
                          style={{
                            left: `${left}%`,
                            top: `${top}%`,
                            transform: "translate(-50%, -50%)",
                            cursor: "pointer",
                          }}
                          onClick={() =>
                            setSelectedEvidence({
                              id: node.id,
                              name: node.event_type || "Evidence Event",
                              type: node.node_type || "Evidence",
                              status: "Processed",
                              description: [
                                node.timestamp &&
                                  `Timestamp: ${node.timestamp}`,
                                node.user_id &&
                                  `User: ${node.user_id}`,
                              ]
                                .filter(Boolean)
                                .join(" | ") ||
                                "Evidence node from the current investigation.",
                            })
                          }
                        >
                          <span>
                            {node.node_type || "EVIDENCE"}
                          </span>

                          <strong>{node.id}</strong>

                          <small>
                            {node.event_type || "Evidence Record"}
                          </small>
                        </div>
                      );
                    })}
                  </>
                ) : (
                  <div className="information-card">
                    <h3>No Graph Data Available</h3>

                    <p>
                      Upload and analyze an evidence file to view
                      its nodes and relationships.
                    </p>
                  </div>
                )}
              </div>

              <div className="graph-legend">
                {selectedEvidence && (
                  <div className="information-card">
                    <h3>{selectedEvidence.name}</h3>

                    <p>
                      Evidence ID: {selectedEvidence.id}
                    </p>

                    <p>
                      Type: {selectedEvidence.type}
                    </p>

                    <p>
                      Status: {selectedEvidence.status}
                    </p>

                    <p>{selectedEvidence.description}</p>

                    <button
                      onClick={() => setSelectedEvidence(null)}
                    >
                      Close Details
                    </button>
                  </div>
                )}

                <h3>Graph Legend</h3>

                <p>Blue: Investigation node</p>
                <p>Connected lines: Evidence relationships</p>
                <p>Evidence nodes: Uploaded forensic records</p>

                <p>
                  Total Nodes: {graphData.nodes.length}
                </p>

                <p>
                  Total Relationships: {graphData.edges.length}
                </p>
              </div>
            </div>
          </section>
        ) : activePage === "What-If Simulator" ? (
          <section className="welcome-card">
            <div style={{ width: "100%" }}>
              <span className="eyebrow">
                FORENSIC SCENARIO ANALYSIS
              </span>

              <h2>What-If Investigation Simulator</h2>

              <p>
                Explore how excluding evidence changes the investigation
                results. Original evidence remains unchanged.
              </p>

              {!investigationId ? (
                <p>
                  Upload and analyze an evidence file before starting
                  a simulation.
                </p>
              ) : (
                <>
                  <p>
                    <strong>Investigation:</strong> {investigationId}
                  </p>

                  <label
                    htmlFor="scenarioName"
                    style={{ display: "block", marginTop: "20px" }}
                  >
                    Scenario Name
                  </label>

                  <input
                    id="scenarioName"
                    type="text"
                    value={scenarioName}
                    onChange={(event) =>
                      setScenarioName(event.target.value)
                    }
                    style={{
                      padding: "10px",
                      width: "100%",
                      maxWidth: "450px",
                      marginTop: "8px",
                    }}
                  />

                  <label
                    htmlFor="evidenceSelect"
                    style={{ display: "block", marginTop: "20px" }}
                  >
                    Select Evidence to Exclude
                  </label>

                  <select
                    id="evidenceSelect"
                    value={selectedEvidenceId}
                    onChange={(event) =>
                      setSelectedEvidenceId(event.target.value)
                    }
                    style={{
                      padding: "10px",
                      width: "100%",
                      maxWidth: "450px",
                      marginTop: "8px",
                    }}
                  >
                    <option value="">Choose evidence</option>

                    {evidenceRecords.map((record) => (
                      <option
                        key={record.evidence_id}
                        value={record.evidence_id}
                      >
                        {record.evidence_id} — {record.event_type} (
                        {record.source_type})
                      </option>
                    ))}
                  </select>

                  <div style={{ marginTop: "24px" }}>
                    <button
                      className="primary-button"
                      onClick={handleRunSimulation}
                      disabled={simulationLoading}
                    >
                      {simulationLoading
                        ? "Running Simulation..."
                        : "Run Simulation"}
                    </button>
                  </div>
                </>
              )}

              {simulationError && (
                <p style={{ color: "red", marginTop: "20px" }}>
                  {simulationError}
                </p>
              )}

              {scenarioId && (
                <p style={{ marginTop: "20px" }}>
                  <strong>Scenario ID:</strong> {scenarioId}
                </p>
              )}

              {simulationResult && (
                <div style={{ marginTop: "30px", width: "100%" }}>
                  <h3>Simulation Results Dashboard</h3>

                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                    gap: "15px",
                    marginTop: "20px"
                  }}>
                    {[
                      ["Status", simulationResult.status || "COMPLETED"],
                      ["Findings", simulationResult.findings?.length ?? 0],
                      ["Relationships", simulationResult.relationships?.length ?? 0],
                      ["Graph Nodes", simulationResult.graph?.nodes?.length ?? 0],
                      ["Graph Edges", simulationResult.graph?.edges?.length ?? 0],
                    ].map(([label, value]) => (
                      <div key={label} style={{
                        background: "#f1f5fb",
                        padding: "20px",
                        borderRadius: "12px",
                        textAlign: "center"
                      }}>
                        <h3 style={{ color: "#287bd1" }}>{value}</h3>
                        <p>{label}</p>
                      </div>
                    ))}
                  </div>

                  <h3 style={{ marginTop: "30px" }}>Detected Findings</h3>

                  {simulationResult.findings?.map((finding) => (
                    <div key={finding.finding_id} style={{
                      background: "#f8f9fc",
                      padding: "15px",
                      marginTop: "10px",
                      borderRadius: "10px",
                      borderLeft: "4px solid #287bd1"
                    }}>
                      <strong>{finding.title}</strong>
                      <p>{finding.description}</p>
                      <small>
                        ID: {finding.finding_id} | Severity: {finding.severity}
                      </small>
                    </div>
                  ))}
                </div>
              )}

              {simulationComparison && (
                <div style={{ marginTop: "30px", width: "100%" }}>
                  <h3>Baseline vs Simulated Comparison</h3>

                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                    gap: "15px",
                    marginTop: "20px"
                  }}>
                    {[
                      [
                        "Unchanged Relationships",
                        simulationComparison.comparison?.unchanged_relationships?.length ?? 0
                      ],
                      [
                        "Removed Relationships",
                        simulationComparison.comparison?.removed_relationships?.length ?? 0
                      ],
                      [
                        "Added Relationships",
                        simulationComparison.comparison?.added_relationships?.length ?? 0
                      ],
                      [
                        "Unchanged Findings",
                        simulationComparison.finding_details?.unchanged?.length ?? 0
                      ],
                      [
                        "Removed Findings",
                        simulationComparison.finding_details?.removed?.length ?? 0
                      ],
                      [
                        "Added Findings",
                        simulationComparison.finding_details?.added?.length ?? 0
                      ],
                      [
                        "Removed Graph Nodes",
                        simulationComparison.graph_details?.removed_nodes?.length ?? 0
                      ]
                    ].map(([label, value]) => (
                      <div key={label} style={{
                        background: "#f1f5fb",
                        padding: "18px",
                        borderRadius: "12px",
                        textAlign: "center"
                      }}>
                        <h2 style={{ color: "#287bd1" }}>{value}</h2>
                        <p>{label}</p>
                      </div>
                    ))}
                  </div>

                  <p style={{
                    marginTop: "20px",
                    color: "#64748b",
                    fontSize: "13px"
                  }}>
                    Note: These results represent a hypothetical scenario.
                    Original evidence and baseline analysis remain unchanged.
                  </p>
                </div>
              )}
              {auditHistory.length > 0 && (
                <div style={{ marginTop: "35px", width: "100%" }}>
                  <h3>Simulation Audit History</h3>

                  <p style={{ color: "#64748b" }}>
                    Recorded actions performed during this simulation.
                  </p>

                  {auditHistory.map((entry, index) => (
                    <div
                      key={entry.audit_id || index}
                      style={{
                        background: "#f1f5fb",
                        padding: "16px",
                        marginTop: "12px",
                        borderRadius: "10px",
                        borderLeft: "4px solid #287bd1",
                      }}
                    >
                      <strong>
                        {entry.action || entry.event_type || `Action ${index + 1}`}
                      </strong>

                      <p style={{ marginTop: "8px" }}>
                        {entry.timestamp || entry.created_at || "Timestamp unavailable"}
                      </p>

                      <pre style={{
                        whiteSpace: "pre-wrap",
                        overflowX: "auto",
                        fontSize: "12px"
                      }}>
                        {JSON.stringify(entry, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
               ) : activePage === "Reports" ? (
          <section className="welcome-card">
            <div style={{ width: "100%" }}>
              <span className="eyebrow">
                INVESTIGATION REPORTS
              </span>

              <h2>Forensic Analysis Report</h2>

              <p>
                Review the results generated by the forensic analysis
                engine for the current investigation.
              </p>

              {!analysisResult ? (
                <div className="information-card">
                  <h3>No Investigation Available</h3>
                  <p>
                    Upload and analyze an evidence file to generate
                    your forensic report.
                  </p>
                </div>
              ) : (
                <>
                  {/* REPORT SUMMARY */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: "15px",
                      marginTop: "25px",
                    }}
                  >
                    {[
                      ["Investigation ID", investigationId || "N/A"],
                      ["Total Evidence", evidenceRecords.length],
                      [
                        "Total Findings",
                        analysisResult.detection?.total_findings ?? 0,
                      ],
                      [
                        "Total Relationships",
                        analysisResult.correlation?.total_relationships ??
                          analysisResult.correlation?.relationships?.length ??
                          0,
                      ],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        style={{
                          background: "#f1f5fb",
                          padding: "18px",
                          borderRadius: "12px",
                          textAlign: "center",
                          overflowWrap: "anywhere",
                        }}
                      >
                        <p>{label}</p>
                        <h2 style={{ color: "#287bd1" }}>
                          {value}
                        </h2>
                      </div>
                    ))}
                  </div>

                  {/* DETECTION RESULTS */}
                  <div style={{ marginTop: "35px" }}>
                    <h3>Detection Results</h3>

                    {analysisResult.detection?.findings?.length > 0 ? (
                      analysisResult.detection.findings.map(
                        (finding, index) => (
                          <div
                            key={finding.finding_id || index}
                            style={{
                              background: "#f1f5fb",
                              padding: "18px",
                              borderRadius: "10px",
                              marginTop: "12px",
                              borderLeft: "4px solid #287bd1",
                            }}
                          >
                            <h4>
                              {finding.title || "Detected Finding"}
                            </h4>

                            <p>
                              <strong>Finding ID:</strong>{" "}
                              {finding.finding_id || "N/A"}
                            </p>

                            <p>
                              <strong>Rule ID:</strong>{" "}
                              {finding.rule_id || "N/A"}
                            </p>

                            <p>
                              <strong>Severity:</strong>{" "}
                              {finding.severity || "N/A"}
                            </p>

                            <p>
                              {finding.description ||
                                "No description available."}
                            </p>

                            <p>
                              <strong>Related Evidence:</strong>{" "}
                              {finding.evidence_ids?.join(", ") || "N/A"}
                            </p>

                            <p>
                              <strong>Timestamp:</strong>{" "}
                              {finding.timestamp || "N/A"}
                            </p>
                          </div>
                        )
                      )
                    ) : (
                      <p>No detection findings available.</p>
                    )}
                  </div>

                  {/* ANOMALY DETECTION */}
                  <div style={{ marginTop: "35px" }}>
                    <h3>Anomaly Detection Results</h3>

                    {analysisResult.anomaly_detection?.anomalies?.length > 0 ? (
                      analysisResult.anomaly_detection.anomalies.map(
                        (anomaly, index) => (
                          <div
                            key={anomaly.evidence_id || index}
                            style={{
                              background: "#fff7ed",
                              padding: "18px",
                              borderRadius: "10px",
                              marginTop: "12px",
                              borderLeft: "4px solid #f59e0b",
                            }}
                          >
                            <h4>
                              {anomaly.event_type || "Anomaly Detected"}
                            </h4>

                            <p>
                              <strong>Evidence ID:</strong>{" "}
                              {anomaly.evidence_id || "N/A"}
                            </p>

                            <p>
                              <strong>Anomaly Score:</strong>{" "}
                              {anomaly.anomaly_score ?? "N/A"}
                            </p>

                            <p>
                              <strong>Timestamp:</strong>{" "}
                              {anomaly.timestamp || "N/A"}
                            </p>

                            <p>
                              <strong>Reason:</strong>{" "}
                              {anomaly.reason || "N/A"}
                            </p>
                          </div>
                        )
                      )
                    ) : (
                      <p>No anomalies detected.</p>
                    )}

                    <p style={{ marginTop: "15px" }}>
                      <strong>Total Records:</strong>{" "}
                      {analysisResult.anomaly_detection?.total_records ?? 0}
                    </p>

                    <p>
                      <strong>Anomaly Count:</strong>{" "}
                      {analysisResult.anomaly_detection?.anomaly_count ?? 0}
                    </p>
                  </div>

                  {/* CORRELATION RESULTS */}
                  <div style={{ marginTop: "35px" }}>
                    <h3>Evidence Correlation Results</h3>

                    {analysisResult.correlation?.relationships?.length > 0 ? (
                      analysisResult.correlation.relationships.map(
                        (relationship, index) => (
                          <div
                            key={index}
                            style={{
                              background: "#f1f5fb",
                              padding: "16px",
                              borderRadius: "10px",
                              marginTop: "12px",
                            }}
                          >
                            <h4>
                              {relationship.relationship_type ||
                                "Evidence Relationship"}
                            </h4>

                            <p>
                              <strong>Source Evidence:</strong>{" "}
                              {relationship.source_evidence_id || "N/A"}
                            </p>

                            <p>
                              <strong>Target Evidence:</strong>{" "}
                              {relationship.target_evidence_id || "N/A"}
                            </p>

                            <p>
                              <strong>Description:</strong>{" "}
                              {relationship.description || "N/A"}
                            </p>

                            <p>
                              <strong>Relationship Score:</strong>{" "}
                              {relationship.relationship_score ?? "N/A"}
                            </p>
                          </div>
                        )
                      )
                    ) : (
                      <p>No evidence relationships available.</p>
                    )}
                  </div>

                  {/* ENTITY MATCHES */}
                  <div style={{ marginTop: "35px" }}>
                    <h3>Entity Matches</h3>

                    {analysisResult.correlation?.entity_matches?.length > 0 ? (
                      analysisResult.correlation.entity_matches.map(
                        (match, index) => (
                          <div
                            key={index}
                            style={{
                              background: "#f1f5fb",
                              padding: "16px",
                              borderRadius: "10px",
                              marginTop: "12px",
                            }}
                          >
                            <p>
                              <strong>Entity Type:</strong>{" "}
                              {match.entity_type || "N/A"}
                            </p>

                            <p>
                              <strong>Entity Value:</strong>{" "}
                              {match.entity_value || "N/A"}
                            </p>

                            <p>
                              <strong>Related Evidence:</strong>{" "}
                              {match.evidence_ids?.join(", ") || "N/A"}
                            </p>
                          </div>
                        )
                      )
                    ) : (
                      <p>No entity matches available.</p>
                    )}
                  </div>

                  {/* REPORT DISCLAIMER */}
                  <div
                    className="information-card"
                    style={{ marginTop: "35px" }}
                  >
                    <h3>Forensic Analysis Note</h3>

                    <p>
                      Detection findings and anomalies are indicators
                      requiring forensic review. Correlation identifies
                      potential relationships between evidence records
                      and does not independently establish causation
                      or malicious intent.
                    </p>
                  </div>
                </>
              )}
            </div>
          </section>
        ) : (
          <section className="welcome-card page-placeholder">
            <div>
              <span className="eyebrow">
                TATTVA FORENSICS WORKSPACE
              </span>

              <h2>{activePage}</h2>

              <p>
                This module is being prepared. Its interface and
                functionality will be added in the next development
                steps.
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
      {showCreateModal && (
        <CreateInvestigationModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleInvestigationCreated}
        />
      )}
    </div>
  );
}

export default App;