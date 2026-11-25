import { useCallback, useEffect, useState } from "react";
import { AdminDashboard } from "./AdminDashboard.jsx";
import {
  AdministratorDashboard,
  InvestigatorDashboard,
} from "./Dashboard.jsx";
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
  { label: "Administration", icon: "⚙" },
];

const pageNames = menuItems.map((item) => item.label);
// Display a compact evidence ID without changing the original ID.
function formatEvidenceId(evidenceId) {
  if (!evidenceId) return "N/A";

  const match = String(evidenceId).match(/-(\d{4})$/);

  return match ? `EV-${match[1]}` : evidenceId;
}

const evidenceSourceLabels = {
  authentication: "Authentication",
  file: "File activity",
  network: "Network",
  archive: "Archive",
};

function getTimestampMillis(timestamp) {
  if (typeof timestamp !== "string" || !timestamp.trim()) {
    return Number.NaN;
  }
  const value = timestamp.trim();
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  return Date.parse(hasTimezone ? value : `${value}Z`);
}

function getEvidenceSourceLabel(sourceType) {
  return evidenceSourceLabels[sourceType] || sourceType || "Unknown source";
}

function getInitialPage() {
  try {
    const storedPage = window.localStorage.getItem("tattva:active-page");
    const requestedPage =
      storedPage === "Admin Dashboard" ? "Administration" : storedPage;
    return pageNames.includes(requestedPage) ? requestedPage : "Dashboard";
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
  const [selectedEvidenceSourceId, setSelectedEvidenceSourceId] = useState("");
  const [selectedForensicRecordId, setSelectedForensicRecordId] = useState("");
  const [evidenceSearch, setEvidenceSearch] = useState("");
  const [evidenceSourceFilter, setEvidenceSourceFilter] = useState("all");
  const [evidenceIntegrityFilter, setEvidenceIntegrityFilter] = useState("all");
  const [timelineSearch, setTimelineSearch] = useState("");
  const [timelineSourceFilter, setTimelineSourceFilter] = useState("all");
  const [timelineRange, setTimelineRange] = useState("all");
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
  const [graphSearch, setGraphSearch] = useState("");
  const [graphSourceFilter, setGraphSourceFilter] = useState("all");
  const [reportPreviewOpen, setReportPreviewOpen] = useState(false);
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
    setGraphSearch("");
    setGraphSourceFilter("all");
    setReportPreviewOpen(false);
    setSimulationResult(null);
    setSimulationComparison(null);
    setScenarioId(null);
    setAuditHistory([]);
    setSelectedEvidenceId("");
    setSelectedEvidence(null);
    setSelectedEvidenceSourceId("");
    setSelectedForensicRecordId("");
  }, []);

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
    setGraphSearch("");
    setGraphSourceFilter("all");
    setReportPreviewOpen(false);
    setSimulationResult(null);
    setSimulationComparison(null);
    setScenarioId(null);
    setAuditHistory([]);
    setSelectedEvidenceId("");
    setSelectedEvidence(null);
    setSelectedEvidenceSourceId("");
    setSelectedForensicRecordId("");

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
      setActivePage(
        currentUser?.role === "ADMIN" ? "Evidence Explorer" : "Dashboard"
      );
      if (id === investigationId) {
        loadInvestigation(id).catch(() => {});
      } else {
        setSelectedEvidenceSourceId("");
        setSelectedForensicRecordId("");
        setGraphSearch("");
        setGraphSourceFilter("all");
        setReportPreviewOpen(false);
        setEvidenceSearch("");
        setEvidenceSourceFilter("all");
        setEvidenceIntegrityFilter("all");
        setTimelineSearch("");
        setTimelineSourceFilter("all");
        setTimelineRange("all");
        setInvestigation(null);
        setWorkspaceLoading(true);
        setInvestigationId(id);
      }
    },
    [currentUser?.role, investigationId, loadInvestigation]
  );

  const handleInvestigationCreated = async (created) => {
    await refreshInvestigations();
    setShowCreateModal(false);
    setWorkspaceNotice(
      `Investigation created successfully. ID: ${created.investigation_id}`
    );
    setSelectedEvidenceSourceId("");
    setSelectedForensicRecordId("");
    setGraphSearch("");
    setGraphSourceFilter("all");
    setReportPreviewOpen(false);
    setEvidenceSearch("");
    setEvidenceSourceFilter("all");
    setEvidenceIntegrityFilter("all");
    setTimelineSearch("");
    setTimelineSourceFilter("all");
    setTimelineRange("all");
    setActivePage(
      currentUser?.role === "ADMIN" ? "Evidence Explorer" : "Dashboard"
    );
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
  const evidenceFiles = investigation?.evidence_files || [];
  const evidenceFilesBySourceId = new Map(
    evidenceFiles.map((file) => [file.source_id, file])
  );
  const getFileForRecord = (record) =>
    evidenceFilesBySourceId.get(record?.source_id);
  const fileHasHash = (file) => Boolean(file?.sha256);
  const recordHasHashes = (record) => {
    const file = getFileForRecord(record);
    return Boolean(file?.sha256 && record?.record_sha256);
  };
  const evidenceSearchTerm = evidenceSearch.trim().toLowerCase();
  const filteredEvidenceFiles = evidenceFiles.filter((file) => {
    const relatedRecords = evidenceRecords.filter(
      (record) => record.source_id === file.source_id
    );
    const matchesSearch =
      !evidenceSearchTerm ||
      [
        file.filename,
        file.source_id,
        file.source_type,
        file.acquired_at,
        file.file_extension,
        file.sha256,
        ...relatedRecords.flatMap((record) => [
          record.evidence_id,
          record.event_type,
          record.original_event_type,
          record.timestamp,
          record.user_id,
          record.ip_address,
          record.file_path,
          record.operation,
        ]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(evidenceSearchTerm);
    const matchesSource =
      evidenceSourceFilter === "all" ||
      file.source_type === evidenceSourceFilter;
    const hasHashes = fileHasHash(file);
    const matchesIntegrity =
      evidenceIntegrityFilter === "all" ||
      (evidenceIntegrityFilter === "recorded" && hasHashes) ||
      (evidenceIntegrityFilter === "incomplete" && !hasHashes);
    return matchesSearch && matchesSource && matchesIntegrity;
  });
  const timelineTimes = timelineRecords
    .map((record) => getTimestampMillis(record.timestamp))
    .filter(Number.isFinite);
  const latestTimelineTimestamp = timelineTimes.length
    ? Math.max(...timelineTimes)
    : Number.NaN;
  const timelineRangeDurations = {
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
  };
  const timelineRangeDuration = timelineRangeDurations[timelineRange];
  const timelineSearchTerm = timelineSearch.trim().toLowerCase();
  const filteredTimelineRecords = timelineRecords.filter((record) => {
    const timestamp = getTimestampMillis(record.timestamp);
    const file = getFileForRecord(record);
    const matchesRange =
      !timelineRangeDuration ||
      !Number.isFinite(timestamp) ||
      !Number.isFinite(latestTimelineTimestamp) ||
      timestamp >= latestTimelineTimestamp - timelineRangeDuration;
    const matchesSource =
      timelineSourceFilter === "all" ||
      record.source_type === timelineSourceFilter;
    const matchesSearch =
      !timelineSearchTerm ||
      [
        record.evidence_id,
        record.source_id,
        record.event_type,
        record.original_event_type,
        record.source_type,
        record.timestamp,
        record.original_timestamp,
        record.user_id,
        record.ip_address,
        record.source_ip,
        record.destination_ip,
        record.host_id,
        record.file_path,
        record.operation,
        file?.filename,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(timelineSearchTerm);
    return matchesRange && matchesSource && matchesSearch;
  });
  const selectedForensicRecord = evidenceRecords.find(
    (record) => record.evidence_id === selectedForensicRecordId
  );
  const selectedForensicFile =
    evidenceFiles.find(
      (file) => file.source_id === selectedEvidenceSourceId
    ) || getFileForRecord(selectedForensicRecord);
  const selectedFileRecords = selectedForensicFile
    ? evidenceRecords.filter(
        (record) => record.source_id === selectedForensicFile.source_id
      )
    : [];
  const selectedTimelineRecord = timelineRecords.find(
    (record) => record.evidence_id === selectedForensicRecordId
  );
  const selectedTimelineIndex = filteredTimelineRecords.findIndex(
    (record) => record.evidence_id === selectedForensicRecordId
  );
  const graphRecordById = new Map(
    evidenceRecords.map((record) => [record.evidence_id, record])
  );
  const graphSearchTerm = graphSearch.trim().toLowerCase();
  const filteredGraphNodes = graphData.nodes.filter((node) => {
    const record = graphRecordById.get(node.id);
    const matchesSource =
      graphSourceFilter === "all" ||
      record?.source_type === graphSourceFilter;
    const matchesSearch =
      !graphSearchTerm ||
      [
        node.id,
        node.node_type,
        node.event_type,
        node.timestamp,
        node.user_id,
        record?.source_type,
        record?.source_id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(graphSearchTerm);
    return matchesSource && matchesSearch;
  });
  const visibleGraphNodeIds = new Set(
    filteredGraphNodes.map((node) => node.id)
  );
  const filteredGraphEdges = graphData.edges.filter(
    (edge) =>
      visibleGraphNodeIds.has(edge.source) &&
      visibleGraphNodeIds.has(edge.target)
  );
  const graphColumns = 4;
  const graphRows = Math.ceil(filteredGraphNodes.length / graphColumns);
  const graphCanvasHeight =
    graphRows > 1 ? graphRows * 140 + 80 : 590;
  const graphNodePositions = new Map(
    filteredGraphNodes.map((node, index) => {
      const row = Math.floor(index / graphColumns);
      const column = index % graphColumns;
      const nodesInRow = Math.min(
        graphColumns,
        filteredGraphNodes.length - row * graphColumns
      );
      const position = {
        x: ((column + 0.5) * 1000) / nodesInRow,
        y:
          graphRows === 1
            ? graphCanvasHeight / 2
            : 70 + row * 140,
      };
      return [node.id, { node, ...position }];
    })
  );
  const selectedGraphNode = graphData.nodes.find(
    (node) => node.id === selectedEvidence?.id
  );
  const selectedGraphRecord = selectedGraphNode
    ? graphRecordById.get(selectedGraphNode.id)
    : null;
  const selectedGraphNodeIsVisible = filteredGraphNodes.some(
    (node) => node.id === selectedGraphNode?.id
  );
  const selectedGraphEdges = selectedGraphNode
    ? graphData.edges.filter(
        (edge) =>
          edge.source === selectedGraphNode.id ||
          edge.target === selectedGraphNode.id
      )
    : [];
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
    if (item.label === "Administration") {
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
    <div
      className={`app-container ${
        effectivePage === "Dashboard"
          ? "dashboard-shell"
          : effectivePage === "Investigations"
            ? "investigations-shell"
            : effectivePage === "Administration"
              ? "admin-shell"
            : [
                  "Evidence Explorer",
                  "Incident Timeline",
                  "Evidence Graph",
                  "What-If Simulator",
                  "Reports",
                ].includes(effectivePage)
              ? "forensic-workspace-shell"
              : ""
      }`}
    >
      <header className="app-navigation">
        <div className="brand">
          <div className="brand-logo">TF</div>

          <div>
            <h2>Tattva Forensics</h2>
            <span>Digital Investigation Platform</span>
          </div>
        </div>

        <nav className="app-navigation-links" aria-label="Primary navigation">
          {visibleMenuItems.map((item) => (
            <button
              key={item.label}
              className={`nav-item ${
                effectivePage === item.label ? "active" : ""
              }`}
              aria-current={effectivePage === item.label ? "page" : undefined}
              onClick={() => setActivePage(item.label)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="app-navigation-account">
          <div className="user-avatar">
            {currentUser.username.slice(0, 1).toUpperCase()}
          </div>

          <div className="app-navigation-identity">
            <strong>{currentUser.username}</strong>
            <small>{currentUser.role.replaceAll("_", " ")}</small>
          </div>
          <button
            className="app-navigation-signout"
            onClick={handleLogout}
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-title">
            {investigation &&
              effectivePage !== "Investigations" &&
              effectivePage !== "Dashboard" && (
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
            <h1>{effectivePage}</h1>
          </div>
          <div className="topbar-actions">
            {effectivePage !== "Investigations" &&
              effectivePage !== "Dashboard" && (
              <button
                className="secondary-button"
                onClick={() => setActivePage("Investigations")}
              >
                All Investigations
              </button>
            )}
          </div>
        </header>

        {/* DASHBOARD */}
        {effectivePage === "Administration" ? (
          <AdminDashboard />
        ) : effectivePage === "Dashboard" ? (
          currentUser.role === "ADMIN" ? (
            <AdministratorDashboard
              username={currentUser.username}
              investigationCount={investigations.length}
              investigationsLoading={
                investigationsLoading || Boolean(investigationsError)
              }
              onManageAccess={() => setActivePage("Administration")}
              onManageInvestigations={() => setActivePage("Investigations")}
            />
          ) : (
            <InvestigatorDashboard
              username={currentUser.username}
              investigations={investigations}
              loading={investigationsLoading}
              error={investigationsError}
              onRetry={refreshInvestigations}
              onOpenInvestigation={openInvestigation}
              onViewAll={() => setActivePage("Investigations")}
              selectedInvestigationId={investigationId}
              investigation={investigation}
              workspaceLoading={workspaceLoading}
              workspaceError={workspaceError}
              workspaceNotice={workspaceNotice}
              evidenceFiles={evidenceFiles}
              evidenceRecords={evidenceRecords}
              findings={findingsList}
              totalFindings={totalFindings}
              totalAnomalies={totalAnomalies}
              canCreate={currentUser.role === "ADMIN"}
              onCreate={() => setShowCreateModal(true)}
              onContinue={() => setActivePage("Evidence Explorer")}
            />
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
            canUpdate={
              currentUser.role === "ADMIN" ||
              currentUser.role === "LEAD_INVESTIGATOR"
            }
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
          <section className="evidence-page">
            <header className="forensic-page-heading">
              <div className="forensic-page-intro">
                <p>
                  Inspect acquired source files and the normalized forensic
                  records extracted from them.
                </p>
              </div>
              {canUploadEvidence ? (
                <form
                  className="evidence-upload-panel"
                  onSubmit={handleEvidenceUpload}
                >
                  <div>
                    <span className="eyebrow">INGEST EVIDENCE</span>
                    <p>New files join this investigation's combined analysis.</p>
                  </div>
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
                      <option value="file">File activity</option>
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
                      ? "Analyzing..."
                      : "Add evidence"}
                  </button>
                  <p className="evidence-upload-help">
                    .log, .txt, .csv or .json · Maximum 10 MB
                  </p>
                  {evidenceUploading && (
                    <p className="upload-progress" role="status">
                      Uploading and analyzing combined investigation evidence...
                    </p>
                  )}
                </form>
              ) : (
                <div className="evidence-access-note">
                  <span className="eyebrow">READ-ONLY ACCESS</span>
                  <p>Your role can inspect evidence but cannot upload files.</p>
                </div>
              )}
            </header>

            {workspaceError && (
              <p className="forensic-message forensic-error" role="alert">
                {workspaceError}
              </p>
            )}
            {workspaceNotice && (
              <p className="forensic-message forensic-success" role="status">
                {workspaceNotice}
              </p>
            )}

            <div className="evidence-overview" aria-label="Evidence overview">
              <div>
                <span>Source files</span>
                <strong>{evidenceFiles.length}</strong>
              </div>
              <div>
                <span>Normalized records</span>
                <strong>{evidenceRecords.length}</strong>
              </div>
              <div>
                <span>Files with SHA-256</span>
                <strong>{evidenceFiles.filter(fileHasHash).length}</strong>
              </div>
            </div>

            <div className="evidence-workspace">
              <section className="evidence-register" aria-label="Evidence files">
                <div className="forensic-panel-heading">
                  <div>
                    <span className="eyebrow">INVESTIGATION RECORD</span>
                    <h3>Source files</h3>
                  </div>
                  <span className="forensic-result-count">
                    {filteredEvidenceFiles.length} of {evidenceFiles.length}
                  </span>
                </div>

                <div className="forensic-filters evidence-filters">
                  <label>
                    Search evidence
                    <input
                      type="search"
                      value={evidenceSearch}
                      onChange={(event) => setEvidenceSearch(event.target.value)}
                      placeholder="Filename, source ID, event, user..."
                    />
                  </label>
                  <label>
                    Source type
                    <select
                      value={evidenceSourceFilter}
                      onChange={(event) =>
                        setEvidenceSourceFilter(event.target.value)
                      }
                    >
                      <option value="all">All source types</option>
                      {Object.entries(evidenceSourceLabels).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        )
                      )}
                    </select>
                  </label>
                  <label>
                    Integrity metadata
                    <select
                      value={evidenceIntegrityFilter}
                      onChange={(event) =>
                        setEvidenceIntegrityFilter(event.target.value)
                      }
                    >
                      <option value="all">All files</option>
                      <option value="recorded">File SHA-256 present</option>
                      <option value="incomplete">SHA-256 unavailable</option>
                    </select>
                  </label>
                </div>

                {workspaceLoading ? (
                  <p className="forensic-empty-state" role="status">
                    Loading evidence records...
                  </p>
                ) : evidenceFiles.length === 0 ? (
                  <div className="forensic-empty-state">
                    <h4>No source files yet</h4>
                    <p>
                      {canUploadEvidence
                        ? "Upload a supported evidence file to begin inspection."
                        : "No evidence files are associated with this investigation."}
                    </p>
                  </div>
                ) : filteredEvidenceFiles.length === 0 ? (
                  <div className="forensic-empty-state">
                    <h4>No matching evidence</h4>
                    <p>Adjust or clear the search and filters.</p>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => {
                        setEvidenceSearch("");
                        setEvidenceSourceFilter("all");
                        setEvidenceIntegrityFilter("all");
                      }}
                    >
                      Clear filters
                    </button>
                  </div>
                ) : (
                  <div className="evidence-file-list">
                    {filteredEvidenceFiles.map((file) => {
                      const fileRecordCount = evidenceRecords.filter(
                        (record) => record.source_id === file.source_id
                      ).length;
                      const hashesAvailable = fileHasHash(file);
                      return (
                        <button
                          className={`evidence-file-row ${
                            selectedEvidenceSourceId === file.source_id
                              ? "is-selected"
                              : ""
                          }`}
                          key={file.source_id}
                          type="button"
                          onClick={() => {
                            setSelectedEvidenceSourceId(file.source_id);
                            setSelectedForensicRecordId("");
                          }}
                        >
                          <span className="evidence-file-row-main">
                            <span className="evidence-file-row-topline">
                              <span
                                className={`evidence-source-badge ${file.source_type}`}
                              >
                                {getEvidenceSourceLabel(file.source_type)}
                              </span>
                              <span
                                className={`evidence-integrity-badge ${
                                  hashesAvailable ? "is-recorded" : "is-missing"
                                }`}
                              >
                                {hashesAvailable
                                  ? "SHA-256 recorded"
                                  : "SHA-256 unavailable"}
                              </span>
                            </span>
                            <strong>{file.filename}</strong>
                            <span className="evidence-file-row-meta">
                              {file.source_id}
                              <span aria-hidden="true">·</span>
                              {file.file_extension || "Unknown format"}
                              <span aria-hidden="true">·</span>
                              {fileRecordCount}{" "}
                              {fileRecordCount === 1 ? "record" : "records"}
                            </span>
                          </span>
                          <span className="evidence-file-row-time">
                            <span>Acquired</span>
                            <time dateTime={file.acquired_at}>
                              {file.acquired_at || "Timestamp unavailable"}
                            </time>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>

              <aside className="evidence-inspector" aria-label="Evidence details">
                <div className="forensic-panel-heading">
                  <div>
                    <span className="eyebrow">INSPECTION PANEL</span>
                    <h3>Evidence details</h3>
                  </div>
                  {selectedForensicFile && (
                    <span className="forensic-selected-mark">Selected</span>
                  )}
                </div>

                {selectedForensicFile ? (
                  <>
                    <div className="evidence-inspector-file">
                      <span
                        className={`evidence-source-badge ${selectedForensicFile.source_type}`}
                      >
                        {getEvidenceSourceLabel(selectedForensicFile.source_type)}
                      </span>
                      <h4>{selectedForensicFile.filename}</h4>
                      <code>{selectedForensicFile.source_id}</code>
                    </div>

                    <dl className="forensic-metadata-grid">
                      {[
                        {
                          label: "File format",
                          value: selectedForensicFile.file_extension,
                        },
                        {
                          label: "File size",
                          value:
                            selectedForensicFile.file_size_bytes != null
                              ? `${Number(
                                  selectedForensicFile.file_size_bytes
                                ).toLocaleString()} bytes`
                              : null,
                        },
                        {
                          label: "Acquired at",
                          value: selectedForensicFile.acquired_at,
                        },
                        {
                          label: "Acquisition integrity",
                          value:
                            selectedForensicFile.integrity_status ||
                            "Unavailable",
                        },
                        {
                          label: "File SHA-256",
                          value: selectedForensicFile.sha256,
                          isHash: true,
                        },
                      ]
                        .filter(
                          (item) =>
                            item.value !== undefined &&
                            item.value !== null &&
                            item.value !== ""
                        )
                        .map((item) => (
                          <div
                            className="forensic-metadata-item"
                            key={item.label}
                          >
                            <dt>{item.label}</dt>
                            <dd className={item.isHash ? "hash-value" : ""}>
                              {item.value}
                            </dd>
                          </div>
                        ))}
                    </dl>
                    <p className="forensic-integrity-note">
                      The file hash and acquisition status are the values
                      recorded by the backend at ingestion; this view does not
                      perform a new file re-hash.
                    </p>

                    <div className="evidence-associated-records">
                      <div className="forensic-subheading">
                        <h4>Extracted records</h4>
                        <span>{selectedFileRecords.length}</span>
                      </div>
                      {selectedFileRecords.length ? (
                        <div className="associated-record-list">
                          {selectedFileRecords.map((record) => (
                            <div
                              className={`associated-record-row ${
                                selectedForensicRecordId === record.evidence_id
                                  ? "is-selected"
                                  : ""
                              }`}
                              key={record.evidence_id}
                            >
                              <button
                                className="associated-record-select"
                                type="button"
                                onClick={() =>
                                  setSelectedForensicRecordId(
                                    record.evidence_id
                                  )
                                }
                              >
                                <strong>
                                  {record.event_type ||
                                    record.original_event_type ||
                                    "Evidence event"}
                                </strong>
                                <code>{record.evidence_id}</code>
                                <time dateTime={record.timestamp}>
                                  {record.original_timestamp ||
                                    record.timestamp ||
                                    "Timestamp unavailable"}
                                </time>
                              </button>
                              <button
                                className="text-action"
                                type="button"
                                onClick={() => {
                                  setSelectedEvidenceSourceId(
                                    selectedForensicFile.source_id
                                  );
                                  setSelectedForensicRecordId(
                                    record.evidence_id
                                  );
                                  setActivePage("Incident Timeline");
                                }}
                                disabled={
                                  !timelineRecords.some(
                                    (event) =>
                                      event.evidence_id === record.evidence_id
                                  )
                                }
                              >
                                View event
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="forensic-secondary-copy">
                          No normalized event records are linked to this file.
                        </p>
                      )}
                    </div>

                    {selectedForensicRecord?.source_id ===
                      selectedForensicFile.source_id && (
                      <div className="selected-record-details">
                        <div className="forensic-subheading">
                          <h4>Record inspection</h4>
                          {recordHasHashes(selectedForensicRecord) && (
                            <span className="forensic-integrity-badge is-recorded">
                              Record hash present
                            </span>
                          )}
                        </div>
                        <dl className="forensic-record-fields">
                          {[
                            ["Event time", selectedForensicRecord.timestamp],
                            [
                              "Original timestamp",
                              selectedForensicRecord.original_timestamp,
                            ],
                            ["User", selectedForensicRecord.user_id],
                            ["IP address", selectedForensicRecord.ip_address],
                            ["Source IP", selectedForensicRecord.source_ip],
                            [
                              "Destination IP",
                              selectedForensicRecord.destination_ip,
                            ],
                            ["Host", selectedForensicRecord.host_id],
                            ["File path", selectedForensicRecord.file_path],
                            ["Operation", selectedForensicRecord.operation],
                            [
                              "Transfer size",
                              selectedForensicRecord.transfer_size_bytes,
                            ],
                            ["Archive ID", selectedForensicRecord.archive_id],
                            [
                              "Archive path",
                              selectedForensicRecord.archive_path,
                            ],
                            [
                              "Archive size",
                              selectedForensicRecord.archive_size_bytes,
                            ],
                            [
                              "Raw record reference",
                              selectedForensicRecord.raw_record_reference,
                            ],
                            [
                              "Record SHA-256",
                              selectedForensicRecord.record_sha256,
                            ],
                          ]
                            .filter(
                              ([, value]) =>
                                value !== undefined &&
                                value !== null &&
                                value !== ""
                            )
                            .map(([label, value]) => (
                              <div
                                className="forensic-record-field"
                                key={label}
                              >
                                <dt>{label}</dt>
                                <dd>{value}</dd>
                              </div>
                            ))}
                        </dl>
                      </div>
                    )}
                    <p className="forensic-preview-note">
                      This panel displays preserved file metadata and
                      normalized event records. The current API does not expose
                      original file contents for in-browser preview.
                    </p>
                  </>
                ) : (
                  <div className="forensic-empty-state inspector-empty-state">
                    <h4>Select a source file</h4>
                    <p>
                      Choose a file to inspect its acquisition metadata,
                      integrity hash and linked event records.
                    </p>
                  </div>
                )}
              </aside>
            </div>
          </section>
        ) : effectivePage === "Incident Timeline" ? (
          <section className="timeline-page">
            <header className="forensic-page-heading timeline-page-heading">
              <div className="forensic-page-intro">
                <p>
                  Reconstruct activity from the timestamps and source records
                  in this investigation.
                </p>
              </div>
              <div className="timeline-context-count">
                <strong>{filteredTimelineRecords.length}</strong>
                <span>
                  of {timelineRecords.length}{" "}
                  {timelineRecords.length === 1 ? "event" : "events"} in view
                </span>
              </div>
            </header>
        ) : effectivePage === "Evidence Graph" ? (
          /* EVIDENCE GRAPH - REAL BACKEND DATA */
          <section className="graph-page">

            {workspaceError && (
              <p className="forensic-message forensic-error" role="alert">
                {workspaceError}
              </p>
            )}

            <div className="timeline-control-bar">
              <label>
                Find events
                <input
                  type="search"
                  value={timelineSearch}
                  onChange={(event) => setTimelineSearch(event.target.value)}
                  placeholder="Event, evidence ID, user, IP..."
                />
              </label>
              <label>
                Source category
                <select
                  value={timelineSourceFilter}
                  onChange={(event) =>
                    setTimelineSourceFilter(event.target.value)
                  }
                >
                  <option value="all">All categories</option>
                  {Object.entries(evidenceSourceLabels).map(
                    ([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    )
                  )}
                </select>
              </label>
              <label>
                Time window
                <select
                  value={timelineRange}
                  onChange={(event) => setTimelineRange(event.target.value)}
                >
                  <option value="all">All recorded time</option>
                  <option value="24h">Latest 24 hours</option>
                  <option value="7d">Latest 7 days</option>
                  <option value="30d">Latest 30 days</option>
                </select>
              </label>
              <p className="timeline-range-note">
                Relative windows end at the latest timestamp in this
                investigation.
              </p>
            </div>

            <div className="timeline-workspace">
              <section
                className="chronology-panel"
                aria-label="Chronological event timeline"
              >
                <div className="forensic-panel-heading">
                  <div>
                    <span className="eyebrow">EVENT SEQUENCE</span>
                    <h3>Chronology</h3>
                  </div>
                  {filteredTimelineRecords.length > 0 && (
                    <span className="forensic-result-count">
                      {filteredTimelineRecords.length} shown
                    </span>
                  )}
                </div>

                {workspaceLoading ? (
                  <p className="forensic-empty-state" role="status">
                    Loading timeline events...
                  </p>
                ) : timelineRecords.length === 0 ? (
                  <div className="forensic-empty-state">
                    <h4>No timeline events</h4>
                    <p>
                      Add evidence in Evidence Explorer to create a
                      timestamped event sequence.
                    </p>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => setActivePage("Evidence Explorer")}
                    >
                      Open Evidence Explorer
                    </button>
                  </div>
                ) : filteredTimelineRecords.length === 0 ? (
                  <div className="forensic-empty-state">
                    <h4>No events in this view</h4>
                    <p>
                      The selected time window or filters exclude all
                      recorded events.
                    </p>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => {
                        setTimelineSearch("");
                        setTimelineSourceFilter("all");
                        setTimelineRange("all");
                      }}
                    >
                      Show all events
                    </button>
                  </div>
                ) : (
                  <ol className="chronology-list">
                    {filteredTimelineRecords.map((record, index) => (
                      <li
                        className={`chronology-item ${
                          selectedForensicRecordId === record.evidence_id
                            ? "is-selected"
                            : ""
                        }`}
                        key={record.evidence_id}
                      >
                        <span
                          className={`chronology-marker ${
                            evidenceSourceLabels[record.source_type]
                              ? record.source_type
                              : "unknown"
                          }`}
                          aria-hidden="true"
                        />
                        <button
                          className="chronology-event"
                          type="button"
                          onClick={() => {
                            setSelectedForensicRecordId(record.evidence_id);
                            setSelectedEvidenceSourceId(
                              record.source_id || ""
                            );
                          }}
                          aria-pressed={
                            selectedForensicRecordId === record.evidence_id
                          }
                        >
                          <span className="chronology-event-header">
                            <time
                              dateTime={record.timestamp}
                              title={`Normalized timestamp: ${
                                record.timestamp || "unavailable"
                              }`}
                            >
                              {record.original_timestamp ||
                                record.timestamp ||
                                "Timestamp unavailable"}
                            </time>
                            <span
                              className={`evidence-source-badge ${
                                evidenceSourceLabels[record.source_type]
                                  ? record.source_type
                                  : "unknown"
                              }`}
                            >
                              {getEvidenceSourceLabel(record.source_type)}
                            </span>
                          </span>
                          <strong>
                            {record.event_type ||
                              record.original_event_type ||
                              "Evidence event"}
                          </strong>
                          <span className="chronology-event-summary">
                            {[
                              record.user_id && `User ${record.user_id}`,
                              record.ip_address &&
                                `IP ${record.ip_address}`,
                              record.file_path &&
                                `File ${record.file_path}`,
                              record.operation,
                            ]
                              .filter(Boolean)
                              .join(" · ") || "No additional event fields"}
                          </span>
                          <span className="chronology-event-footer">
                            <code>{record.evidence_id}</code>
                            <span>
                              {index + 1} / {filteredTimelineRecords.length}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              <aside className="timeline-inspector" aria-label="Selected event">
                <div className="forensic-panel-heading">
                  <div>
                    <span className="eyebrow">EVENT INSPECTION</span>
                    <h3>Selected event</h3>
                  </div>
                  {selectedTimelineRecord && (
                    <div className="timeline-step-controls">
                      <button
                        className="timeline-step-button"
                        type="button"
                        aria-label="Previous event"
                        disabled={
                          filteredTimelineRecords.length === 0 ||
                          selectedTimelineIndex === 0
                        }
                        onClick={() => {
                          const targetIndex =
                            selectedTimelineIndex === -1
                              ? filteredTimelineRecords.length - 1
                              : selectedTimelineIndex - 1;
                          const target = filteredTimelineRecords[targetIndex];
                          if (target) {
                            setSelectedForensicRecordId(target.evidence_id);
                            setSelectedEvidenceSourceId(
                              target.source_id || ""
                            );
                          }
                        }}
                      >
                        Prev
                      </button>
                      <button
                        className="timeline-step-button"
                        type="button"
                        aria-label="Next event"
                        disabled={
                          filteredTimelineRecords.length === 0 ||
                          selectedTimelineIndex ===
                            filteredTimelineRecords.length - 1
                        }
                        onClick={() => {
                          const targetIndex =
                            selectedTimelineIndex === -1
                              ? 0
                              : selectedTimelineIndex + 1;
                          const target = filteredTimelineRecords[targetIndex];
                          if (target) {
                            setSelectedForensicRecordId(target.evidence_id);
                            setSelectedEvidenceSourceId(
                              target.source_id || ""
                            );
                          }
                        }}
                      >
                        Next
                      </button>
                    </div>
                  )}
                </div>

                {selectedTimelineRecord ? (
                  <>
                    {selectedTimelineIndex === -1 && (
                      <div className="timeline-filter-notice">
                        This selected event is outside the current timeline
                        filters.
                        <button
                          className="text-action"
                          type="button"
                          onClick={() => {
                            setTimelineSearch("");
                            setTimelineSourceFilter("all");
                            setTimelineRange("all");
                          }}
                        >
                          Show it in the timeline
                        </button>
                      </div>
                    )}
                    <div className="timeline-selected-event">
                      <span
                        className={`evidence-source-badge ${
                          evidenceSourceLabels[selectedTimelineRecord.source_type]
                            ? selectedTimelineRecord.source_type
                            : "unknown"
                        }`}
                      >
                        {getEvidenceSourceLabel(
                          selectedTimelineRecord.source_type
                        )}
                      </span>
                      <h4>
                        {selectedTimelineRecord.event_type ||
                          selectedTimelineRecord.original_event_type ||
                          "Evidence event"}
                      </h4>
                      <time dateTime={selectedTimelineRecord.timestamp}>
                        {selectedTimelineRecord.original_timestamp ||
                          selectedTimelineRecord.timestamp ||
                          "Timestamp unavailable"}
                      </time>
                    </div>
                    <dl className="forensic-record-fields timeline-fields">
                      {[
                        ["Evidence ID", selectedTimelineRecord.evidence_id],
                        ["Source ID", selectedTimelineRecord.source_id],
                        ["User", selectedTimelineRecord.user_id],
                        ["IP address", selectedTimelineRecord.ip_address],
                        ["Source IP", selectedTimelineRecord.source_ip],
                        [
                          "Destination IP",
                          selectedTimelineRecord.destination_ip,
                        ],
                        ["Host", selectedTimelineRecord.host_id],
                        ["File path", selectedTimelineRecord.file_path],
                        ["Operation", selectedTimelineRecord.operation],
                        [
                          "Transfer size",
                          selectedTimelineRecord.transfer_size_bytes,
                        ],
                        ["Archive ID", selectedTimelineRecord.archive_id],
                        ["Archive path", selectedTimelineRecord.archive_path],
                        [
                          "Archive size",
                          selectedTimelineRecord.archive_size_bytes,
                        ],
                        [
                          "Raw record reference",
                          selectedTimelineRecord.raw_record_reference,
                        ],
                      ]
                        .filter(
                          ([, value]) =>
                            value !== undefined &&
                            value !== null &&
                            value !== ""
                        )
                        .map(([label, value]) => (
                          <div className="forensic-record-field" key={label}>
                            <dt>{label}</dt>
                            <dd>{value}</dd>
                          </div>
                        ))}
                    </dl>
                    {selectedForensicFile && (
                      <div className="timeline-associated-file">
                        <span className="eyebrow">ASSOCIATED SOURCE FILE</span>
                        <strong>{selectedForensicFile.filename}</strong>
                        <code>{selectedForensicFile.source_id}</code>
                      </div>
                    )}
                    <button
                      className="primary-button timeline-inspect-button"
                      type="button"
                      onClick={() => {
                        setSelectedEvidenceSourceId(
                          selectedTimelineRecord.source_id || ""
                        );
                        setActivePage("Evidence Explorer");
                      }}
                    >
                      Inspect associated evidence
                    </button>
                  </>
                ) : (
                  <div className="forensic-empty-state inspector-empty-state">
                    <h4>Select a timeline event</h4>
                    <p>
                      Choose an event on the chronology to inspect its source
                      metadata and associated evidence record.
                    </p>
                  </div>
                )}
              </aside>
            </div>
          </section>
        ) : effectivePage === "Evidence Graph" ? (
          <section className="graph-page">
            <p className="graph-description">
              Explore relationships returned by the investigation correlation
              engine. Each node and connection represents a persisted evidence
              record or backend relationship.
            </p>
            {workspaceError && (
              <p className="forensic-message forensic-error" role="alert">
                {workspaceError}
              </p>
            )}

            <div className="graph-controls">
              <label>
                Search nodes
                <input
                  type="search"
                  value={graphSearch}
                  onChange={(event) => setGraphSearch(event.target.value)}
                  placeholder="Evidence ID, event, user..."
                />
              </label>
              <label>
                Source type
                <select
                  value={graphSourceFilter}
                  onChange={(event) =>
                    setGraphSourceFilter(event.target.value)
                  }
                >
                  <option value="all">All source types</option>
                  {Object.entries(evidenceSourceLabels).map(
                    ([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    )
                  )}
                </select>
              </label>
              <p className="graph-counts">
                {filteredGraphNodes.length} nodes · {filteredGraphEdges.length}{" "}
                relationships shown
              </p>
            </div>

            <div className="graph-layout">
              <section className="graph-canvas" aria-label="Evidence graph">
                {workspaceLoading ? (
                  <p className="graph-empty-state" role="status">
                    Loading evidence graph...
                  </p>
                ) : graphData.nodes.length === 0 ? (
                  <div className="graph-empty-state">
                    <h3>No graph data available</h3>
                    <p>
                      Add evidence to this investigation to load its actual
                      nodes and correlation relationships.
                    </p>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => setActivePage("Evidence Explorer")}
                    >
                      Open Evidence Explorer
                    </button>
                  </div>
                ) : filteredGraphNodes.length === 0 ? (
                  <div className="graph-empty-state">
                    <h3>No matching nodes</h3>
                    <p>Adjust the search or source filter.</p>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => {
                        setGraphSearch("");
                        setGraphSourceFilter("all");
                      }}
                    >
                      Clear filters
                    </button>
                  </div>
                ) : (
                  <div
                    className="graph-visualization"
                    style={{ height: `${graphCanvasHeight}px` }}
                  >
                    <svg
                      className="graph-connections"
                      viewBox={`0 0 1000 ${graphCanvasHeight}`}
                      preserveAspectRatio="none"
                      role="img"
                      aria-label={`${filteredGraphEdges.length} actual evidence relationships`}
                    >
                      {filteredGraphEdges.map((edge, index) => {
                        const source = graphNodePositions.get(edge.source);
                        const target = graphNodePositions.get(edge.target);
                        if (!source || !target) {
                          return null;
                        }
                        const isSelected =
                          selectedEvidence?.id === edge.source ||
                          selectedEvidence?.id === edge.target;
                        return (
                          <line
                            key={`${edge.source}-${edge.target}-${index}`}
                            x1={source.x}
                            y1={source.y}
                            x2={target.x}
                            y2={target.y}
                            stroke={isSelected ? "#ff8738" : "#42a5ff"}
                            strokeWidth={isSelected ? "2.5" : "1.5"}
                          >
                            <title>
                              {edge.relationship_type ||
                                "Relationship type unavailable"}
                              {edge.description
                                ? `: ${edge.description}`
                                : ""}
                              {edge.relationship_score != null
                                ? ` (score ${edge.relationship_score})`
                                : ""}
                            </title>
                          </line>
                        );
                      })}
                    </svg>
                    {Array.from(graphNodePositions.values()).map(
                      ({ node, x, y }) => {
                        const record = graphRecordById.get(node.id);
                        const sourceType = record?.source_type;
                        return (
                          <button
                            className={`graph-node ${
                              evidenceSourceLabels[sourceType]
                                ? sourceType
                                : "unknown"
                            } ${
                              selectedEvidence?.id === node.id
                                ? "is-selected"
                                : ""
                            }`}
                            key={node.id}
                            type="button"
                            style={{
                              left: `${(x / 1000) * 100}%`,
                              top: `${(y / graphCanvasHeight) * 100}%`,
                            }}
                            onClick={() => setSelectedEvidence(node)}
                            aria-pressed={selectedEvidence?.id === node.id}
                            title={`${node.event_type || "Evidence event"} · ${
                              node.id
                            }`}
                          >
                            <span>
                              {getEvidenceSourceLabel(sourceType)}
                            </span>
                            <strong>
                              {node.event_type || "Event type unavailable"}
                            </strong>
                            <small>{node.id}</small>
                          </button>
                        );
                      }
                    )}
                  </div>
                )}
              </section>

              <aside className="graph-details" aria-label="Graph node details">
                {selectedGraphNode ? (
                  <>
                    <div className="graph-details-heading">
                      <h3>
                        {selectedGraphNode.event_type ||
                          "Evidence record"}
                      </h3>
                      <button
                        className="text-action"
                        type="button"
                        onClick={() => setSelectedEvidence(null)}
                      >
                        Clear
                      </button>
                    </div>
                    {!selectedGraphNodeIsVisible && (
                      <p className="graph-filter-note">
                        This node is hidden by the current graph filters.
                      </p>
                    )}
                    <dl className="graph-metadata">
                      {[
                        ["Evidence ID", selectedGraphNode.id],
                        ["Node type", selectedGraphNode.node_type],
                        ["Event time", selectedGraphNode.timestamp],
                        ["User", selectedGraphNode.user_id],
                        [
                          "Source type",
                          selectedGraphRecord
                            ? getEvidenceSourceLabel(
                                selectedGraphRecord.source_type
                              )
                            : null,
                        ],
                      ]
                        .filter(
                          ([, value]) =>
                            value !== undefined &&
                            value !== null &&
                            value !== ""
                        )
                        .map(([label, value]) => (
                          <div key={label}>
                            <dt>{label}</dt>
                            <dd>{value}</dd>
                          </div>
                        ))}
                    </dl>
                    <h4>Relationships</h4>
                    {selectedGraphEdges.length ? (
                      <ul className="graph-relationship-list">
                        {selectedGraphEdges.map((edge, index) => {
                          const relatedId =
                            edge.source === selectedGraphNode.id
                              ? edge.target
                              : edge.source;
                          const relatedNode = graphData.nodes.find(
                            (node) => node.id === relatedId
                          );
                          return (
                            <li key={`${relatedId}-${index}`}>
                              <strong>
                                {edge.relationship_type ||
                                  "Relationship type unavailable"}
                              </strong>
                              <span>{relatedId}</span>
                              {relatedNode?.event_type && (
                                <span>{relatedNode.event_type}</span>
                              )}
                              {edge.description && <p>{edge.description}</p>}
                              {edge.relationship_score != null && (
                                <small>
                                  Score: {edge.relationship_score}
                                </small>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="graph-muted-copy">
                        No relationships are attached to this node in the
                        backend graph.
                      </p>
                    )}
                    {selectedGraphRecord && (
                      <button
                        className="primary-button graph-inspect-button"
                        type="button"
                        onClick={() => {
                          setSelectedEvidenceSourceId(
                            selectedGraphRecord.source_id || ""
                          );
                          setSelectedForensicRecordId(
                            selectedGraphRecord.evidence_id
                          );
                          setActivePage("Evidence Explorer");
                        }}
                      >
                        Inspect source evidence
                      </button>
                    )}
                  </>
                ) : (
                  <div className="graph-empty-detail">
                    <h3>Select a node</h3>
                    <p>
                      Select a graph node to inspect its evidence metadata and
                      backend-returned relationships.
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
          <section className="simulator-page">
            <p className="simulator-description">
              Test how excluding one evidence record changes the analysis.
              Original evidence and the baseline remain unchanged.
            </p>

            {workspaceError && (
              <p className="forensic-message forensic-error" role="alert">
                {workspaceError}
              </p>
            )}
            {simulationError && (
              <p className="forensic-message forensic-error" role="alert">
                {simulationError}
              </p>
            )}

            <section className="simulator-configuration">
              <div className="simple-section-heading">
                <h2>Scenario setup</h2>
                <p>Choose an evidence record to exclude from a new scenario.</p>
              </div>
              {!analysisResult?.baseline_analysis_id ||
              evidenceRecords.length === 0 ? (
                <div className="simple-empty-state">
                  <p>
                    A baseline analysis and at least one evidence record are
                    required before a simulation can run.
                  </p>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setActivePage("Evidence Explorer")}
                  >
                    Open Evidence Explorer
                  </button>
                </div>
              ) : (
                <div className="simulator-form">
                  <label>
                    Scenario name
                    <input
                      type="text"
                      value={scenarioName}
                      required
                      maxLength={200}
                      onChange={(event) => {
                        setScenarioName(event.target.value);
                        setSimulationError("");
                        setSimulationResult(null);
                        setSimulationComparison(null);
                        setScenarioId(null);
                        setAuditHistory([]);
                      }}
                    />
                  </label>
                  <label>
                    Evidence record to exclude
                    <select
                      value={selectedEvidenceId}
                      onChange={(event) => {
                        setSelectedEvidenceId(event.target.value);
                        setSimulationError("");
                        setSimulationResult(null);
                        setSimulationComparison(null);
                        setScenarioId(null);
                        setAuditHistory([]);
                      }}
                      required
                    >
                      <option value="">Select a record</option>
                      {evidenceRecords.map((record) => (
                        <option
                          key={record.evidence_id}
                          value={record.evidence_id}
                        >
                          {record.evidence_id} ·{" "}
                          {record.event_type || record.original_event_type} ·{" "}
                          {getEvidenceSourceLabel(record.source_type)}
                          {getFileForRecord(record)?.filename
                            ? ` · ${getFileForRecord(record).filename}`
                            : ""}
                        </option>
                      ))}
                    </select>
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
                      type="button"
                      onClick={handleRunSimulation}
                      disabled={
                        simulationLoading ||
                        !selectedEvidenceId ||
                        !scenarioName.trim()
                      }
                    >
                      {simulationLoading
                        ? "Running simulation..."
                        : "Run simulation"}
                    </button>
                  </div>
                </div>
              )}
              {simulationLoading && (
                <p className="simulator-loading" role="status">
                  Running scenario and comparing it with the baseline...
                </p>
              )}
            </section>

            <section className="simulator-results">
              <div className="simple-section-heading">
                <h2>Simulation results</h2>
                <p>Results are shown after the backend completes a run.</p>
              </div>
              {simulationResult ? (
                <>
                  <div className="simulation-result-heading">
                    <div>
                      <strong>{scenarioName || "Scenario result"}</strong>
                      <span>Scenario ID: {scenarioId || "Not returned"}</span>
                    </div>
                    <span className="simulation-status">
                      {simulationResult.status || "Status not returned"}
                    </span>
                  </div>

                  <div className="simulation-result-columns">
                    <section className="simulation-result-section">
                      <h3>Findings</h3>
                      {simulationResult.findings?.length ? (
                        <ul className="simulation-finding-list">
                          {simulationResult.findings.map((finding) => (
                            <li key={finding.finding_id}>
                              <div>
                                <strong>{finding.title}</strong>
                                {finding.severity && (
                                  <span
                                    className={`simulation-severity ${String(
                                      finding.severity
                                    ).toLowerCase()}`}
                                  >
                                    {finding.severity}
                                  </span>
                                )}
                              </div>
                              <p>{finding.description}</p>
                              <small>
                                {finding.finding_id}
                                {finding.evidence_ids?.length
                                  ? ` · Evidence: ${finding.evidence_ids.join(
                                      ", "
                                    )}`
                                  : ""}
                              </small>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="simulator-result-empty">
                          No findings were returned for this scenario.
                        </p>
                      )}
                    </section>

                    <section className="simulation-result-section">
                      <h3>Relationships</h3>
                      {simulationResult.relationships?.length ? (
                        <ul className="simulation-relationship-list">
                          {simulationResult.relationships.map(
                            (relationship, index) => (
                              <li
                                key={`${relationship.source_evidence_id || ""}-${
                                  relationship.target_evidence_id || ""
                                }-${index}`}
                              >
                                <strong>
                                  {relationship.relationship_type ||
                                    "Type unavailable"}
                                </strong>
                                <span>
                                  {relationship.source_evidence_id || "Source unavailable"}
                                  {" → "}
                                  {relationship.target_evidence_id || "Target unavailable"}
                                </span>
                                {relationship.description && (
                                  <p>{relationship.description}</p>
                                )}
                                {relationship.relationship_score != null && (
                                  <small>
                                    Score: {relationship.relationship_score}
                                  </small>
                                )}
                              </li>
                            )
                          )}
                        </ul>
                      ) : (
                        <p className="simulator-result-empty">
                          No relationships were returned for this scenario.
                        </p>
                      )}
                    </section>
                  </div>
                </>
              ) : (
                <p className="simulator-result-empty">
                  Configure a scenario and run it to see findings and
                  relationships here.
                </p>
              )}

              {simulationComparison && (
                <section className="simulation-comparison">
                  <h3>Compared with baseline</h3>
                  <dl>
                    {[
                      [
                        "Unchanged relationships",
                        simulationComparison.comparison
                          ?.unchanged_relationships,
                      ],
                      [
                        "Removed relationships",
                        simulationComparison.comparison
                          ?.removed_relationships,
                      ],
                      [
                        "Added relationships",
                        simulationComparison.comparison?.added_relationships,
                      ],
                      [
                        "Unchanged findings",
                        simulationComparison.finding_details?.unchanged,
                      ],
                      [
                        "Removed findings",
                        simulationComparison.finding_details?.removed,
                      ],
                      [
                        "Added findings",
                        simulationComparison.finding_details?.added,
                      ],
                      [
                        "Removed graph nodes",
                        simulationComparison.graph_details?.removed_nodes,
                      ],
                    ].map(([label, entries]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>
                          {Array.isArray(entries)
                            ? entries.length
                            : "Not returned"}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p>
                    This is a hypothetical analysis. Original evidence and
                    baseline analysis are unchanged.
                  </p>
                </section>
              )}

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
            </section>
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