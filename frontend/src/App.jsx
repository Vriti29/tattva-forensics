import { useCallback, useEffect, useState } from "react";
import { AdminDashboard } from "./AdminDashboard.jsx";
import {
  AuthLoadingPage,
  LoginPage,
  RequiredPasswordChangePage,
} from "./AuthPages.jsx";
import {
  CreateInvestigationModal,
  InvestigationList,
} from "./InvestigationManagement.jsx";
import {
  formatDate,
  refreshCsrfToken,
  requestJson,
  setCsrfToken,
} from "./investigationApi.js";
import "./App.css";

const menuItems = [
  { label: "Dashboard", icon: "▦" },
  { label: "Evidence Explorer", icon: "▣" },
  { label: "Incident Timeline", icon: "◷" },
  { label: "Evidence Graph", icon: "◎" },
  { label: "What-If Simulator", icon: "⇄" },
  { label: "Reports", icon: "▤" },
  { label: "Investigations", icon: "⌕" },
  { label: "Admin Dashboard", icon: "⚙" },
];

const pageNames = menuItems.map((item) => item.label);
// Display a compact evidence ID without changing the original ID.
function formatEvidenceId(evidenceId) {
  if (!evidenceId) return "N/A";

  const match = String(evidenceId).match(/-(\d{4})$/);

  return match ? `EV-${match[1]}` : evidenceId;
}

function getInitialPage() {
  try {
    const storedPage = window.localStorage.getItem("tattva:active-page");
    return pageNames.includes(storedPage) ? storedPage : "Dashboard";
  } catch {
    return "Dashboard";
  }
}

function App() {
  const [activePage, setActivePage] = useState(getInitialPage);
  const [currentUser, setCurrentUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authNotice, setAuthNotice] = useState("");
  const [authError, setAuthError] = useState("");
  const [selectedEvidence, setSelectedEvidence] = useState(null);
  const [evidenceRecords, setEvidenceRecords] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [evidenceInputKey, setEvidenceInputKey] = useState(0);
  const [sourceType, setSourceType] = useState("authentication");
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
  const [workspaceLoading, setWorkspaceLoading] = useState(
    () => Boolean(investigationId)
  );
  const [workspaceError, setWorkspaceError] = useState("");
  const [workspaceNotice, setWorkspaceNotice] = useState("");
  const [evidenceUploading, setEvidenceUploading] = useState(false);
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
  const resetWorkspaceData = useCallback(() => {
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
  }, []);
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

  const refreshInvestigations = useCallback(async (updatedDetail) => {
    setInvestigationsLoading(true);
    setInvestigationsError("");
    try {
      const rows = await requestJson("/investigations");
      const enrichedRows = await Promise.all(
        rows.map(async (item) => {
          const detail =
            item.investigation_id === updatedDetail?.investigation_id
              ? updatedDetail
              : await requestJson(
                  `/investigations/${encodeURIComponent(item.investigation_id)}`
                );
          return {
            ...item,
            evidence_file_count:
              detail.evidence_files?.length ?? item.evidence_file_count,
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

  useEffect(() => {
    let active = true;
    const restoreSession = async () => {
      try {
        await refreshCsrfToken();
        const user = await requestJson("/auth/me");
        if (active) {
          setCurrentUser(user);
          setAuthError("");
        }
      } catch (error) {
        if (active) {
          setCurrentUser(null);
          setAuthError(error.status === 401 ? "" : error.message);
        }
      } finally {
        if (active) {
          setAuthReady(true);
        }
      }
    };
    restoreSession();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handleSessionExpired = () => {
      setCurrentUser(null);
      setAuthReady(true);
      setAuthNotice("Your session expired. Sign in again to continue.");
      setAuthError("");
      setCsrfToken("");
      resetWorkspaceData();
    };
    window.addEventListener("tattva:session-expired", handleSessionExpired);
    return () =>
      window.removeEventListener(
        "tattva:session-expired",
        handleSessionExpired
      );
  }, [resetWorkspaceData]);

  const handleLogin = async (username, password) => {
    const result = await requestJson("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    setCsrfToken(result.csrf_token);
    setCurrentUser(result.user);
    setAuthError("");
    setAuthNotice("");
  };

  const handlePasswordChange = async (currentPassword, newPassword) => {
    await requestJson("/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    });
    setCsrfToken("");
    setCurrentUser(null);
    setAuthNotice("Password changed. Sign in with your new password.");
  };

  const handleLogout = async () => {
    try {
      await requestJson("/auth/logout", { method: "POST" });
    } catch (error) {
      if (error.status !== 401) {
        setAuthError(error.message);
      }
    } finally {
      setCsrfToken("");
      setCurrentUser(null);
      setAuthReady(true);
      setAuthNotice("You have been signed out.");
      resetWorkspaceData();
    }
  };

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
    if (authReady && currentUser && !currentUser.password_change_required) {
      Promise.resolve().then(refreshInvestigations);
    }
  }, [authReady, currentUser, refreshInvestigations]);

  useEffect(() => {
    try {
      window.localStorage.setItem("tattva:active-page", activePage);
    } catch {
      // The selected page remains usable when browser storage is unavailable.
    }
  }, [activePage]);

  useEffect(() => {
    if (!authReady || !currentUser || currentUser.password_change_required) {
      return;
    }
    if (investigationId) {
      try {
        window.localStorage.setItem(
          "tattva:selected-investigation",
          investigationId
        );
      } catch {
        // Continue loading the selected investigation without browser storage.
      }

      Promise.resolve()
        .then(() => loadInvestigation(investigationId))
        .catch((error) => {
          if (error.status === 404) {
            setInvestigationId("");
            setActivePage("Investigations");
            setWorkspaceError("");
            setWorkspaceNotice("");
            return;
          }
          setWorkspaceError(error.message);
        });
    } else {
      try {
        window.localStorage.removeItem("tattva:selected-investigation");
      } catch {
        // The application can continue without browser storage.
      }
    }
  }, [authReady, currentUser, investigationId, loadInvestigation]);

  const openInvestigation = useCallback(
    (id) => {
      setWorkspaceNotice("");
      setWorkspaceError("");
      setActivePage("Dashboard");
      if (id === investigationId) {
        loadInvestigation(id).catch(() => {});
      } else {
        setInvestigation(null);
        setWorkspaceLoading(true);
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
    setActivePage("Dashboard");
    setInvestigation(null);
    setWorkspaceLoading(true);
    setInvestigationId(created.investigation_id);
  };

  const handleAddEvidence = async (file, type) => {
    if (!investigationId) {
      setWorkspaceError("Select an investigation before adding evidence.");
      return false;
    }

    setEvidenceUploading(true);
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
      try {
        const detail = await loadInvestigation(investigationId);
        await refreshInvestigations(detail);
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
      setEvidenceUploading(false);
    }
  };

  const handleEvidenceUpload = async (event) => {
    event.preventDefault();
    if (!selectedFile) {
      setWorkspaceError("Choose an evidence file to upload.");
      return;
    }

    const uploaded = await handleAddEvidence(selectedFile, sourceType);
    if (uploaded) {
      setSelectedFile(null);
      setEvidenceInputKey((key) => key + 1);
    }
  };

  // Create and execute a What-If simulation using the backend.
  const handleRunSimulation = async () => {
    setSimulationError("");
    setSimulationResult(null);
    setSimulationComparison(null);

    if (!investigationId || !analysisResult?.baseline_analysis_id) {
      setSimulationError(
        "Add evidence from Evidence Explorer before running a simulation."
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
      const createdScenario = await requestJson("/api/simulations", {
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

      const newScenarioId = createdScenario.scenario_id;

      if (!newScenarioId) {
        throw new Error("Backend did not return a scenario ID.");
      }

      setScenarioId(newScenarioId);

      // 2. Exclude the selected evidence
      await requestJson(
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

      // 3. Run the simulation
      const runData = await requestJson(
        `/api/simulations/${newScenarioId}/run`,
        {
          method: "POST",
        }
      );

      setSimulationResult(runData.result);

      // 4. Compare simulated result with original baseline
      const compareData = await requestJson(
        `/api/simulations/${newScenarioId}/compare`
      );

      setSimulationComparison(compareData);
      // 5. Fetch scenario audit history
      const historyData = await requestJson(
        `/api/simulations/${newScenarioId}/history`
      );

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

  const findingsList = Array.isArray(findingsData?.findings)
    ? findingsData.findings
    : Array.isArray(analysisResult?.detection?.findings)
      ? analysisResult.detection.findings
      : [];
  const severityBreakdown = findingsList.reduce((counts, finding) => {
    const severity = String(finding.severity || "Unspecified").toUpperCase();
    counts[severity] = (counts[severity] || 0) + 1;
    return counts;
  }, {});
  const severityEntries = Object.entries(severityBreakdown).sort(
    ([left], [right]) => left.localeCompare(right)
  );
  const evidenceFiles = investigation?.evidence_files || [];
  const recentEvidenceFiles = [...evidenceFiles]
    .sort(
      (left, right) =>
        new Date(right.acquired_at || 0) - new Date(left.acquired_at || 0)
    )
    .slice(0, 5);
  const totalFindings =
    investigationSummary?.total_findings ??
    findingsData?.total_findings ??
    findingsList.length;
  const totalAnomalies =
    investigationSummary?.total_anomalies ??
    anomaliesData?.anomaly_count ??
    anomaliesData?.anomalies?.length ??
    analysisResult?.anomaly_detection?.anomaly_count ??
    0;
  const visibleMenuItems = menuItems.filter((item) => {
    if (item.label === "Admin Dashboard") {
      return currentUser?.role === "ADMIN";
    }
    if (item.label === "What-If Simulator") {
      return currentUser?.role !== "VIEWER";
    }
    return true;
  });
  const effectivePage = visibleMenuItems.some(
    (item) => item.label === activePage
  )
    ? activePage
    : "Dashboard";
  const canUploadEvidence = [
    "ADMIN",
    "LEAD_INVESTIGATOR",
    "INVESTIGATOR",
  ].includes(currentUser?.role);

  if (!authReady) {
    return <AuthLoadingPage />;
  }
  if (!currentUser) {
    return (
      <LoginPage
        onLogin={handleLogin}
        notice={authNotice}
        connectionError={authError}
      />
    );
  }
  if (currentUser.password_change_required) {
    return (
      <RequiredPasswordChangePage
        username={currentUser.username}
        onSubmit={handlePasswordChange}
        onLogout={handleLogout}
      />
    );
  }

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
          {visibleMenuItems.map((item) => (
            <button
              key={item.label}
              className={`nav-item ${
                effectivePage === item.label ? "active" : ""
              }`}
              onClick={() => setActivePage(item.label)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-avatar">
            {currentUser.username.slice(0, 1).toUpperCase()}
          </div>

          <div>
            <strong>{currentUser.username}</strong>
            <small>{currentUser.role.replaceAll("_", " ")}</small>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-title">
            {investigation && effectivePage !== "Investigations" && (
              <div
                className={`selected-investigation-context ${
                  effectivePage === "Dashboard" ? "dashboard-context" : ""
                }`}
              >
                <span className="eyebrow">
                  {effectivePage === "Dashboard"
                    ? "ACTIVE INVESTIGATION"
                    : "SELECTED INVESTIGATION"}
                </span>
                <strong>{investigation.name}</strong>
                <small>{investigation.investigation_id}</small>
              </div>
            )}
            <span className="eyebrow">
              {effectivePage === "Investigations"
                ? "CASE MANAGEMENT"
                : effectivePage === "Dashboard"
                  ? "CASE OVERVIEW"
                  : "INVESTIGATION WORKSPACE"}
            </span>
            <h1>{effectivePage}</h1>
          </div>
          <div className="topbar-actions">
            {effectivePage !== "Investigations" && (
              <button
                className="secondary-button"
                onClick={() => setActivePage("Investigations")}
              >
                All Investigations
              </button>
            )}
            <button
              className="secondary-button"
              onClick={handleLogout}
            >
              Sign out
            </button>
          </div>
        </header>

        {/* DASHBOARD */}
        {effectivePage === "Admin Dashboard" ? (
          <AdminDashboard />
        ) : effectivePage === "Dashboard" ? (
          !investigation ? (
            <section className="management-card management-empty dashboard-empty">
              {workspaceLoading ? (
                <p className="management-state" role="status">
                  Loading investigation...
                </p>
              ) : workspaceError ? (
                <>
                  <h2>Investigation unavailable</h2>
                  <p className="management-message error-message" role="alert">
                    {workspaceError}
                  </p>
                  {investigationId && (
                    <button
                      className="secondary-button"
                      onClick={() =>
                        loadInvestigation(investigationId).catch(() => {})
                      }
                    >
                      Retry
                    </button>
                  )}
                  <button
                    className="text-button"
                    onClick={() => setActivePage("Investigations")}
                  >
                    All Investigations
                  </button>
                </>
              ) : (
                <>
                  <h2>No investigation selected</h2>
                  <p>Open an investigation to view its dashboard and analysis.</p>
                  <button
                    className="primary-button"
                    onClick={() => setActivePage("Investigations")}
                  >
                    All Investigations
                  </button>
                </>
              )}
            </section>
          ) : (
            <>
              {workspaceNotice && (
                <p className="management-message success-message" role="status">
                  {workspaceNotice}
                </p>
              )}
              {workspaceError && (
                <p className="management-message error-message" role="alert">
                  {workspaceError}
                </p>
              )}

              <section className="welcome-card dashboard-case-card">
                <div>
                  <span className="eyebrow">INVESTIGATION STATUS</span>
                  <p>
                    {investigation.description ||
                      "Review evidence and analysis for this investigation."}
                  </p>
                </div>
                <span className="status-pill">{investigation.status}</span>
              </section>

              {workspaceLoading && (
                <p className="management-state" role="status">
                  Refreshing investigation data...
                </p>
              )}

              <section className="stats-grid dashboard-stats-grid">
                {[
                  ["Evidence Files", evidenceFiles.length],
                  ["Total Findings", totalFindings],
                  ["Total Anomalies", totalAnomalies],
                ].map(([label, value]) => (
                  <div className="stat-card" key={label}>
                    <div className="stat-top">
                      <span>{label}</span>
                    </div>
                    <h2>{value}</h2>
                    <p>{investigation.name}</p>
                  </div>
                ))}
              </section>

              <div className="dashboard-details-grid">
                <section className="information-card severity-card">
                  <h3>Severity Breakdown</h3>
                  {severityEntries.length ? (
                    severityEntries.map(([severity, count]) => (
                      <div className="severity-row" key={severity}>
                        <span className={`severity-label severity-${severity.toLowerCase()}`}>
                          {severity}
                        </span>
                        <div
                          className="severity-track"
                          role="progressbar"
                          aria-label={`${severity} findings`}
                          aria-valuemin="0"
                          aria-valuemax={findingsList.length}
                          aria-valuenow={count}
                        >
                          <span
                            style={{
                              width: `${(count / findingsList.length) * 100}%`,
                            }}
                          />
                        </div>
                        <strong>{count}</strong>
                      </div>
                    ))
                  ) : (
                    <p className="management-state">
                      No findings are available for severity analysis.
                    </p>
                  )}
                </section>

                <section className="information-card recent-evidence-card">
                  <h3>Recent Evidence Activity</h3>
                  {recentEvidenceFiles.length ? (
                    <div className="recent-evidence-list">
                      {recentEvidenceFiles.map((file) => (
                        <div
                          className="recent-evidence-item"
                          key={file.source_id}
                        >
                          <div>
                            <strong>{file.filename}</strong>
                            <span>{file.source_type}</span>
                          </div>
                          <time dateTime={file.acquired_at}>
                            {formatDate(file.acquired_at)}
                          </time>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="management-state">
                      No evidence files have been added to this investigation.
                    </p>
                  )}
                </section>
              </div>
            </>
          )
        ) : effectivePage === "Investigations" ? (
          <InvestigationList
            investigations={investigations}
            loading={investigationsLoading}
            error={investigationsError}
            onRetry={refreshInvestigations}
            onOpen={openInvestigation}
            onCreate={() => setShowCreateModal(true)}
            canCreate={currentUser.role === "ADMIN"}
          />
        ) : !investigation ? (
          <section className="management-card management-empty">
            {workspaceLoading ? (
              <p className="management-state" role="status">
                Loading investigation...
              </p>
            ) : (
              <>
                <h2>
                  {workspaceError
                    ? "Investigation unavailable"
                    : "No investigation selected"}
                </h2>
                {workspaceError ? (
                  <p className="management-message error-message" role="alert">
                    {workspaceError}
                  </p>
                ) : (
                  <p>
                    Open an investigation before using {effectivePage}.
                  </p>
                )}
                {investigationId && workspaceError && (
                  <button
                    className="secondary-button"
                    onClick={() =>
                      loadInvestigation(investigationId).catch(() => {})
                    }
                  >
                    Retry
                  </button>
                )}
                <button
                  className="primary-button"
                  onClick={() => setActivePage("Investigations")}
                >
                  All Investigations
                </button>
              </>
            )}
          </section>
        ) : effectivePage === "Evidence Explorer" ? (
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

            <div className="selected-case-strip">
              <span className="eyebrow">CURRENT INVESTIGATION</span>
              <strong>{investigation.name}</strong>
              <small>{investigation.investigation_id}</small>
            </div>

            {workspaceError && (
              <p className="management-message error-message" role="alert">
                {workspaceError}
              </p>
            )}
            {workspaceNotice && (
              <p className="management-message success-message" role="status">
                {workspaceNotice}
              </p>
            )}

            {canUploadEvidence ? (
              <div className="information-card">
                <p>
                  Add evidence to this investigation. New files are analyzed
                  together with its existing evidence.
                </p>
                <form
                  className="workspace-upload-form evidence-upload-form"
                  onSubmit={handleEvidenceUpload}
                >
                  <label>
                    Evidence file
                    <input
                      key={evidenceInputKey}
                      type="file"
                      accept=".log,.txt,.csv,.json"
                      onChange={(event) =>
                        setSelectedFile(event.target.files?.[0] || null)
                      }
                      disabled={evidenceUploading}
                    />
                  </label>
                  <label>
                    Source type
                    <select
                      value={sourceType}
                      onChange={(event) => setSourceType(event.target.value)}
                      disabled={evidenceUploading}
                    >
                      <option value="authentication">Authentication</option>
                      <option value="file">File Activity</option>
                      <option value="network">Network</option>
                      <option value="archive">Archive</option>
                    </select>
                  </label>
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={!selectedFile || evidenceUploading}
                  >
                    {evidenceUploading
                      ? "Analyzing evidence..."
                      : "Add Evidence"}
                  </button>
                </form>
                {evidenceUploading && (
                  <p className="upload-progress" role="status">
                    Uploading and analyzing combined investigation evidence...
                  </p>
                )}
              </div>
            ) : (
              <div className="information-card">
                <h3>Read-only access</h3>
                <p>
                  Your Viewer role allows you to review evidence but not upload
                  or modify it.
                </p>
              </div>
            )}

            <div className="information-card evidence-files-card">
              <h3>Evidence Files</h3>
              {evidenceFiles.length ? (
                <div className="evidence-file-list">
                  {evidenceFiles.map((file) => (
                    <article
                      className="evidence-file-item"
                      key={file.source_id}
                    >
                      <div className="evidence-file-heading">
                        <strong>{file.filename}</strong>
                        <span className="status-pill">{file.source_type}</span>
                      </div>
                      <p>
                        {(file.file_size_bytes / 1024).toFixed(1)} KB
                        {" · "}
                        {formatDate(file.acquired_at)}
                      </p>
                      <code title={file.sha256}>{file.sha256}</code>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="management-state">
                  No evidence files have been added to this investigation.
                </p>
              )}
            </div>

            <div className="information-card">
              <h3>Evidence Records</h3>
              <p>
                Processed records belonging to {investigation.name}.
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
                        No evidence records are available for this investigation.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : effectivePage === "Incident Timeline" ? (
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
                        Evidence: {formatEvidenceId(record.evidence_id)}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="information-card">
                  <h3>No Timeline Events</h3>

                  <p>
                    Add evidence from Evidence Explorer to view its events in
                    chronological order.
                  </p>
                </div>
              )}
            </div>
          </section>
        ) : effectivePage === "Evidence Graph" ? (
          /* EVIDENCE GRAPH - REAL BACKEND DATA */
          <section className="graph-page">

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
                      preserveAspectRatio="none"
                    >
                      {/* Background: all relationships */}
                      {graphData.edges.map((edge, index) => {
                        const sourceIndex = graphData.nodes.findIndex(
                          (node) => node.id === edge.source
                        );
                        const targetIndex = graphData.nodes.findIndex(
                          (node) => node.id === edge.target
                        );

                        if (sourceIndex === -1 || targetIndex === -1) return null;

                        const count = graphData.nodes.length;

                        const sourceAngle =
                          -Math.PI / 2 + (sourceIndex * 2 * Math.PI) / count;
                        const targetAngle =
                          -Math.PI / 2 + (targetIndex * 2 * Math.PI) / count;

                        const sx = 350 + 224 * Math.cos(sourceAngle);
                        const sy = 210 + 147 * Math.sin(sourceAngle);
                        const tx = 350 + 224 * Math.cos(targetAngle);
                        const ty = 210 + 147 * Math.sin(targetAngle);

                        const dx = tx - sx;
                        const dy = ty - sy;
                        const distance = Math.sqrt(dx * dx + dy * dy) || 1;

                        const ux = dx / distance;
                        const uy = dy / distance;

                        const offset = (x, y) =>
                          Math.min(
                            51 / Math.max(Math.abs(x), 0.001),
                            50 / Math.max(Math.abs(y), 0.001)
                          );

                        const start = offset(ux, uy);
                        const end = offset(ux, uy);

                        return (
                          <line
                            key={`background-${index}`}
                            x1={sx + ux * start}
                            y1={sy + uy * start}
                            x2={tx - ux * end}
                            y2={ty - uy * end}
                            stroke="#b8c7d9"
                            strokeWidth="1.2"
                            strokeDasharray="5 7"
                            strokeLinecap="round"
                            opacity={selectedEvidence ? 0.10 : 0.22}
                          />
                        );
                      })}

                      {/* Foreground: selected evidence relationships */}
                      {selectedEvidence &&
                        graphData.edges.map((edge, index) => {
                          const isConnected =
                            edge.source === selectedEvidence.id ||
                            edge.target === selectedEvidence.id;

                          if (!isConnected) return null;

                          const sourceIndex = graphData.nodes.findIndex(
                            (node) => node.id === edge.source
                          );
                          const targetIndex = graphData.nodes.findIndex(
                            (node) => node.id === edge.target
                          );

                          if (sourceIndex === -1 || targetIndex === -1) return null;

                          const count = graphData.nodes.length;

                          const sourceAngle =
                            -Math.PI / 2 + (sourceIndex * 2 * Math.PI) / count;
                          const targetAngle =
                            -Math.PI / 2 + (targetIndex * 2 * Math.PI) / count;

                          const sx = 350 + 224 * Math.cos(sourceAngle);
                          const sy = 210 + 147 * Math.sin(sourceAngle);
                          const tx = 350 + 224 * Math.cos(targetAngle);
                          const ty = 210 + 147 * Math.sin(targetAngle);

                          const dx = tx - sx;
                          const dy = ty - sy;
                          const distance = Math.sqrt(dx * dx + dy * dy) || 1;

                          const ux = dx / distance;
                          const uy = dy / distance;

                          const offset = (x, y) =>
                            Math.min(
                              51 / Math.max(Math.abs(x), 0.001),
                              50 / Math.max(Math.abs(y), 0.001)
                            );

                          const startOffset = offset(ux, uy);
                          const endOffset = offset(ux, uy);

                          const startX = sx + ux * startOffset;
                          const startY = sy + uy * startOffset;
                          const endX = tx - ux * endOffset;
                          const endY = ty - uy * endOffset;

                          const relationshipType = (
                            edge.relationship_type || ""
                          ).toUpperCase();

                          const edgeColor = relationshipType.includes("TEMPORAL")
                            ? "#9254de"
                            : relationshipType.includes("SEQUENCE")
                              ? "#fa8c16"
                              : relationshipType.includes("ENTITY")
                                ? "#13a89e"
                                : "#3984e8";

                          const connectedEdges = graphData.edges.filter(
                            (item) =>
                              item.source === selectedEvidence.id ||
                              item.target === selectedEvidence.id
                          );

                          const connectedIndex = connectedEdges.indexOf(edge);

                          // Separate curves to avoid overlapping connections
                          const curveOffset =
                            (connectedIndex % 2 === 0 ? 1 : -1) *
                            (22 + Math.floor(connectedIndex / 2) * 13);

                          const midX = (startX + endX) / 2;
                          const midY = (startY + endY) / 2;

                          const controlX =
                            midX - (dy / distance) * curveOffset;
                          const controlY =
                            midY + (dx / distance) * curveOffset;

                          return (
                            <g key={`highlight-${index}`}>
                              <path
                                d={`M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}`}
                                fill="none"
                                stroke={edgeColor}
                                strokeWidth="3"
                                strokeLinecap="round"
                                opacity="0.95"
                                className="graph-edge"
                              />

                              <title>
                                {relationshipType || "OTHER"}
                                {" | Score: "}
                                {edge.relationship_score ?? "N/A"}
                              </title>
                            </g>
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
                          className={`graph-node ${
                            selectedEvidence?.id === node.id
                              ? "graph-node-selected"
                              : selectedEvidence &&
                                  graphData.edges.some(
                                    (edge) =>
                                      (edge.source === selectedEvidence.id &&
                                        edge.target === node.id) ||
                                      (edge.target === selectedEvidence.id &&
                                        edge.source === node.id)
                                  )
                                ? "graph-node-connected"
                                : selectedEvidence
                                  ? "graph-node-dimmed"
                                  : ""
                          }`}
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

                          <strong title={node.id}>
                            #{node.id?.slice(-4) || "N/A"}
                          </strong>

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
                      Add evidence from Evidence Explorer to view its nodes and
                      relationships.
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

                  <div className="graph-legend-item">
                    <span className="graph-legend-swatch graph-swatch-entity" />
                    <span>Entity Relationship</span>
                  </div>

                  <div className="graph-legend-item">
                    <span className="graph-legend-swatch graph-swatch-temporal" />
                    <span>Temporal Relationship</span>
                  </div>

                  <div className="graph-legend-item">
                    <span className="graph-legend-swatch graph-swatch-sequence" />
                    <span>Sequence Relationship</span>
                  </div>

                  <div className="graph-legend-item">
                    <span className="graph-legend-swatch graph-swatch-other" />
                    <span>Other Relationships</span>
                  </div>

                  <div className="graph-legend-item">
                    <span className="graph-legend-swatch graph-swatch-selected" />
                    <span>Selected Evidence Connections</span>
                  </div>

                  <p className="graph-legend-note">
                    Entity: Shared entity or user relationship.
                    Temporal: Time-based relationship.
                    Sequence: Event sequence relationship.
                    Other: Supporting evidence relationship.
                    Select an evidence node to highlight its connections.
                  </p>

                  <p>Total Nodes: {graphData.nodes.length}</p>

                  <p>Total Relationships: {graphData.edges.length}</p>
              </div>
            </div>
          </section>
        ) : effectivePage === "What-If Simulator" ? (
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
                  Select an investigation and add evidence in Evidence Explorer
                  before starting a simulation.
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
                        {formatEvidenceId(record.evidence_id)} — {record.event_type} (
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

                  {auditHistory.map((entry, index) => {
                    const action = String(
                      entry.action || entry.event_type || ""
                    ).toUpperCase();

                    const activityDetails = {
                      SCENARIO_CREATED: {
                        title: "Simulation Scenario Created",
                        description:
                          "A new hypothetical investigation scenario was created. The original evidence and baseline analysis remain unchanged.",
                        icon: "🧪",
                        color: "#287bd1",
                      },
                      EVENT_EXCLUDED: {
                        title: "Evidence Excluded",
                        description:
                          "An evidence record was excluded from this hypothetical scenario to evaluate how its removal affects the investigation.",
                        icon: "📁",
                        color: "#d97706",
                      },
                      SIMULATION_EXECUTED: {
                        title: "Simulation Executed",
                        description:
                          "The forensic analysis was re-evaluated using the modified evidence set.",
                        icon: "⚙️",
                        color: "#7c3aed",
                      },
                      COMPARISON_GENERATED: {
                        title: "Baseline Comparison Generated",
                        description:
                          "The simulated results were compared with the original baseline to identify changes in findings and relationships.",
                        icon: "📊",
                        color: "#0f9d78",
                      },
                    };

                    const activity = activityDetails[action] || {
                      title: action
                        ? action.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase())
                        : `Investigation Activity ${index + 1}`,
                      description:
                        "An investigation activity was recorded in the audit trail.",
                      icon: "📋",
                      color: "#64748b",
                    };

                    const timestamp = entry.timestamp || entry.created_at;

                    return (
                      <article
                        key={entry.audit_id || index}
                        style={{
                          background: "#ffffff",
                          border: "1px solid #e2e8f0",
                          borderLeft: `4px solid ${activity.color}`,
                          borderRadius: "12px",
                          padding: "20px",
                          marginTop: "14px",
                          boxShadow: "0 3px 12px rgba(15, 23, 42, 0.04)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                          }}
                        >
                          <div
                            style={{
                              width: "42px",
                              height: "42px",
                              borderRadius: "10px",
                              background: "#f1f5f9",
                              display: "grid",
                              placeItems: "center",
                              fontSize: "21px",
                              flexShrink: 0,
                            }}
                          >
                            {activity.icon}
                          </div>

                          <div style={{ flex: 1 }}>
                            <strong style={{ color: "#17365f", fontSize: "15px" }}>
                              {activity.title}
                            </strong>

                            <p
                              style={{
                                margin: "5px 0 0",
                                color: "#64748b",
                                fontSize: "12px",
                              }}
                            >
                              {timestamp
                                ? new Date(timestamp).toLocaleString()
                                : "Timestamp unavailable"}
                            </p>
                          </div>

                          <span
                            style={{
                              background: "#f1f5f9",
                              color: activity.color,
                              padding: "5px 10px",
                              borderRadius: "20px",
                              fontSize: "11px",
                              fontWeight: 700,
                            }}
                          >
                            RECORDED
                          </span>
                        </div>

                        <p
                          style={{
                            color: "#475569",
                            lineHeight: 1.6,
                            margin: "16px 0",
                            fontSize: "13px",
                          }}
                        >
                          {activity.description}
                        </p>

                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "18px",
                            fontSize: "12px",
                            color: "#64748b",
                          }}
                        >
                          {entry.evidence_id && (
                            <span>
                              <strong>Evidence:</strong> {entry.evidence_id}
                            </span>
                          )}

                          {entry.scenario_id && (
                            <span>
                              <strong>Scenario:</strong> {entry.scenario_id}
                            </span>
                          )}

                          {entry.audit_id && (
                            <span>
                              <strong>Audit ID:</strong> {entry.audit_id}
                            </span>
                          )}
                        </div>

                        <details style={{ marginTop: "16px" }}>
                          <summary
                            style={{
                              cursor: "pointer",
                              color: "#287bd1",
                              fontSize: "12px",
                              fontWeight: 600,
                            }}
                          >
                            View Technical Audit Record
                          </summary>

                          <pre
                            style={{
                              whiteSpace: "pre-wrap",
                              overflowX: "auto",
                              background: "#f8fafc",
                              padding: "14px",
                              borderRadius: "8px",
                              fontSize: "11px",
                              color: "#334155",
                              marginTop: "12px",
                            }}
                          >
                            {JSON.stringify(entry, null, 2)}
                          </pre>
                        </details>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
               ) : effectivePage === "Reports" ? (
          <section className="report-page">
            <div className="report-header">
              <span className="report-eyebrow">INVESTIGATION REPORTS</span>
              <h2 className="report-title">Forensic Analysis Report</h2>
              <p className="report-subtitle">
                A consolidated overview of digital evidence, detection findings,
                anomalies and potential evidence relationships.
              </p>
            </div>

            {!analysisResult ? (
              <div className="report-empty">
                <h3>No Investigation Available</h3>
                <p>
                  Add evidence from Evidence Explorer to generate this
                  investigation's forensic report.
                </p>
              </div>
            ) : (
              <>
                {/* REPORT SUMMARY */}
                <div className="report-summary-grid report-overview-grid">
                  {[
                    {
                      label: "Investigation ID",
                      value: investigationId || "N/A",
                      icon: "🔎",
                      description: "Active investigation",
                    },
                    {
                      label: "Total Evidence",
                      value: evidenceRecords.length,
                      icon: "📁",
                      description: "Evidence files analyzed",
                    },
                    {
                      label: "Total Findings",
                      value: analysisResult.detection?.total_findings ?? 0,
                      icon: "⚠️",
                      description: "Detection findings",
                    },
                    {
                      label: "Total Relationships",
                      value:
                        analysisResult.correlation?.total_relationships ??
                        analysisResult.correlation?.relationships?.length ?? 0,
                      icon: "🔗",
                      description: "Potential evidence links",
                    },
                  ].map((item) => (
                    <div className="report-metric-card report-overview-card" key={item.label}>
                      <div className="report-overview-top">
                        <span className="report-overview-icon">{item.icon}</span>
                        <span className="report-metric-label">{item.label}</span>
                      </div>

                      <strong className="report-metric-value">{item.value}</strong>

                      <span className="report-overview-description">
                        {item.description}
                      </span>
                    </div>
                  ))}
                </div>

                {/* DETECTION RESULTS */}
                <div className="report-section">
                  <h3 className="report-section-title">Detection Results</h3>

                  {analysisResult.detection?.findings?.length > 0 ? (
                    analysisResult.detection.findings.map((finding, index) => {
                      const severity = String(
                        finding.severity || "unknown"
                      ).toLowerCase();

                      return (
                        <div
                          className="report-record-card"
                          key={finding.finding_id || index}
                        >
                          <div className="report-card-top">
                            <h4 className="report-card-title">
                              {finding.title || "Detected Finding"}
                            </h4>

                            <span className={`report-badge report-badge-${severity}`}>
                              {finding.severity || "Unknown"}
                            </span>
                          </div>

                          <div className="report-meta-grid">
                            <div className="report-meta-item">
                              <strong>Finding ID</strong>
                              <span>{finding.finding_id || "N/A"}</span>
                            </div>

                            <div className="report-meta-item">
                              <strong>Rule ID</strong>
                              <span>{finding.rule_id || "N/A"}</span>
                            </div>

                            <div className="report-meta-item">
                              <strong>Timestamp</strong>
                              <span>{finding.timestamp || "N/A"}</span>
                            </div>
                          </div>

                          <p className="report-card-detail">
                            {finding.description || "No description available."}
                          </p>

                          <details className="report-evidence-details">
                            <summary>View Evidence IDs</summary>

                            <p className="report-muted">
                              {finding.evidence_ids?.length
                                ? finding.evidence_ids.map((id) => formatEvidenceId(id)).join(", ")
                                : "No related evidence available."}
                            </p>
                          </details>
                        </div>
                      );
                    })
                  ) : (
                    <p className="report-empty">
                      No detection findings available.
                    </p>
                  )}
                </div>

                {/* ANOMALY DETECTION */}
                <div className="report-section">
                  <h3 className="report-section-title">Anomaly Detection Results</h3>

                  {analysisResult.anomaly_detection?.anomalies?.length > 0 ? (
                    analysisResult.anomaly_detection.anomalies.map((anomaly, index) => (
                      <div
                        className="report-anomaly-card"
                        key={anomaly.evidence_id || index}
                      >
                        <div className="report-card-top">
                          <h4 className="report-card-title">
                            {anomaly.event_type || "Anomaly Detected"}
                          </h4>

                          <span className="report-badge report-badge-warning">
                            Review Required
                          </span>
                        </div>

                        <div className="report-meta-grid">
                          <div className="report-meta-item">
                            <strong>Evidence ID</strong>
                            <span title={anomaly.evidence_id}>
                              {formatEvidenceId(anomaly.evidence_id)}
                            </span>
                          </div>

                          <div className="report-meta-item">
                            <strong>Anomaly Score</strong>
                            <span>{anomaly.anomaly_score ?? "N/A"}</span>
                          </div>

                          <div className="report-meta-item">
                            <strong>Timestamp</strong>
                            <span>{anomaly.timestamp || "N/A"}</span>
                          </div>
                        </div>

                        <p className="report-card-detail">
                          <strong>Reason:</strong>{" "}
                          {anomaly.reason || "No reason available."}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="report-empty">No anomalies detected.</p>
                  )}

                  <div className="report-anomaly-stats">
                    <div className="report-metric-card">
                      <span className="report-metric-label">Total Records</span>
                      <strong className="report-metric-value">
                        {analysisResult.anomaly_detection?.total_records ?? 0}
                      </strong>
                    </div>

                    <div className="report-metric-card">
                      <span className="report-metric-label">Anomaly Count</span>
                      <strong className="report-metric-value">
                        {analysisResult.anomaly_detection?.anomaly_count ?? 0}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* CORRELATION RESULTS */}
                <div className="report-section report-correlation-section">
                  <div className="report-correlation-header">
                    <div>
                      <span className="report-eyebrow">EVIDENCE ANALYSIS</span>
                      <h3 className="report-section-title">
                        Evidence Correlation Results
                      </h3>
                      <p className="report-muted">
                        Potential relationships identified between evidence records.
                        These links can help investigators explore common entities and activity.
                      </p>
                    </div>

                    <span className="report-correlation-count">
                      {analysisResult.correlation?.relationships?.length ?? 0} Relationships
                    </span>
                  </div>

                  {analysisResult.correlation?.relationships?.length > 0 ? (
                    <>
                      <div className="report-correlation-info">
                        <span>Showing first 8 relationships</span>
                        <span>
                          Total: {analysisResult.correlation.relationships.length}
                        </span>
                      </div>

                      <div className="report-table-wrapper">
                        <table className="report-table">
                          <thead>
                            <tr>
                              <th>Relationship Type</th>
                              <th>Source Evidence</th>
                              <th>Target Evidence</th>
                              <th>Score</th>
                              <th>Description</th>
                            </tr>
                          </thead>

                          <tbody>
                            {analysisResult.correlation.relationships
                              .slice(0, 8)
                              .map((relationship, index) => (
                                <tr key={index}>
                                  <td>
                                    <span className="report-badge">
                                      {relationship.relationship_type || "Relationship"}
                                    </span>
                                  </td>
                                  <td title={relationship.source_evidence_id}>
                                    {formatEvidenceId(relationship.source_evidence_id)}
                                  </td>
                                  <td title={relationship.target_evidence_id}>
                                    {formatEvidenceId(relationship.target_evidence_id)}
                                  </td>
                                  <td>
                                    <span className="report-score">
                                      {relationship.relationship_score ?? "N/A"}
                                    </span>
                                  </td>
                                  <td>{relationship.description || "N/A"}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>

                      {analysisResult.correlation.relationships.length > 8 && (
                        <details className="report-more-details">
                          <summary>
                            View remaining{" "}
                            {analysisResult.correlation.relationships.length - 8} relationships
                          </summary>

                          <div className="report-table-wrapper">
                            <table className="report-table">
                              <thead>
                                <tr>
                                  <th>Relationship Type</th>
                                  <th>Source Evidence</th>
                                  <th>Target Evidence</th>
                                  <th>Score</th>
                                  <th>Description</th>
                                </tr>
                              </thead>

                              <tbody>
                                {analysisResult.correlation.relationships
                                  .slice(8)
                                  .map((relationship, index) => (
                                    <tr key={index + 8}>
                                      <td>{relationship.relationship_type || "Relationship"}</td>
                                      <td>{relationship.source_evidence_id || "N/A"}</td>
                                      <td>{relationship.target_evidence_id || "N/A"}</td>
                                      <td>{relationship.relationship_score ?? "N/A"}</td>
                                      <td>{relationship.description || "N/A"}</td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                        </details>
                      )}
                    </>
                  ) : (
                    <p className="report-empty">
                      No evidence relationships available.
                    </p>
                  )}
                </div>

                {/* ENTITY MATCHES */}
                <div className="report-section report-entity-section">
                  <details className="report-entity-details">
                    <summary>
                      <span>Entity Matches</span>
                      <span className="report-entity-count">
                        {analysisResult.correlation?.entity_matches?.length ?? 0} Entities
                      </span>
                    </summary>

                    {analysisResult.correlation?.entity_matches?.length > 0 ? (
                      <div className="report-entity-grid">
                        {analysisResult.correlation.entity_matches.map((match, index) => (
                          <div className="report-entity-card" key={index}>
                            <div className="report-entity-card-header">
                              <span className="report-badge">
                                {match.entity_type || "Entity"}
                              </span>
                            </div>

                            <h4 className="report-entity-value">
                              {match.entity_value || "N/A"}
                            </h4>

                            <div className="report-evidence-list">
                              <p className="report-evidence-heading">
                                Related Evidence
                                <span>{match.evidence_ids?.length ?? 0}</span>
                              </p>

                              {match.evidence_ids?.length > 0 ? (
                                <div className="report-evidence-chips">
                                  {match.evidence_ids.map((id, idIndex) => (
                                    <code
                                      key={idIndex}
                                      className="report-evidence-chip"
                                      title={id}
                                    >
                                      {formatEvidenceId(id)}
                                    </code>
                                  ))}
                                </div>
                              ) : (
                                <p className="report-muted">No evidence IDs available.</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="report-empty">No entity matches available.</p>
                    )}
                  </details>
                </div>

                {/* REPORT DISCLAIMER */}
                <div className="report-disclaimer">
                  <h3>Forensic Analysis Note</h3>
                  <p>
                    Detection findings and anomalies are indicators requiring
                    forensic review. Correlation identifies potential relationships
                    between evidence records and does not independently establish
                    causation or malicious intent.
                  </p>
                </div>
              </>
            )}
          </section>
        ) : (
          <section className="welcome-card page-placeholder">
            <div>
              <span className="eyebrow">
                TATTVA FORENSICS WORKSPACE
              </span>

              <h2>{effectivePage}</h2>

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