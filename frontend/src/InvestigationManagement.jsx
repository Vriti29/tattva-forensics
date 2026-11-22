import { useMemo, useRef, useState } from "react";
import { formatDate, requestJson } from "./investigationApi.js";

export function CreateInvestigationModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("Enter an investigation name.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const investigation = await requestJson("/investigations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
        }),
      });
      await onCreated(investigation);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="management-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-investigation-title"
      >
        <div className="management-modal-heading">
          <div>
            <span className="eyebrow">CASE MANAGEMENT</span>
            <h2 id="create-investigation-title">New Investigation</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>

        <form className="management-form" onSubmit={handleSubmit}>
          <label htmlFor="investigation-name">Investigation Name *</label>
          <input
            id="investigation-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={200}
            required
            autoFocus
            disabled={submitting}
          />

          <label htmlFor="investigation-description">Description</label>
          <textarea
            id="investigation-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={5000}
            rows={4}
            disabled={submitting}
          />

          {error && (
            <p className="management-message error-message" role="alert">
              {error}
            </p>
          )}

          <div className="management-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={submitting || !name.trim()}
            >
              {submitting ? "Creating..." : "Create Investigation"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function InvestigationList({
  investigations,
  loading,
  error,
  onRetry,
  onOpen,
  onCreate,
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const statuses = useMemo(
    () => [...new Set(investigations.map((item) => item.status))].sort(),
    [investigations]
  );
  const visibleInvestigations = useMemo(() => {
    const query = search.trim().toLowerCase();
    return investigations.filter((item) => {
      const matchesSearch =
        !query ||
        item.name.toLowerCase().includes(query) ||
        item.investigation_id.toLowerCase().includes(query);
      const matchesStatus =
        statusFilter === "all" || item.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [investigations, search, statusFilter]);

  return (
    <section className="management-page">
      <div className="management-page-heading">
        <div>
          <span className="eyebrow">CASE MANAGEMENT</span>
          <h2>All Investigations</h2>
          <p>Search, review, and open investigation workspaces.</p>
        </div>
        <button className="primary-button" onClick={onCreate}>
          + New Investigation
        </button>
      </div>

      <div className="management-card">
        <div className="investigation-filters">
          <label className="search-field">
            <span>Search</span>
            <input
              type="search"
              placeholder="Name or investigation ID"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label className="status-filter">
            <span>Status</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All statuses</option>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && (
          <div className="management-message error-message" role="alert">
            <span>{error}</span>
            <button className="text-button" onClick={onRetry}>
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <p className="management-state" role="status">
            Loading investigations...
          </p>
        ) : investigations.length === 0 ? (
          <div className="management-empty">
            <h3>No investigations yet</h3>
            <p>Create an investigation to start organizing evidence and analysis.</p>
            <button className="primary-button" onClick={onCreate}>
              Create Investigation
            </button>
          </div>
        ) : visibleInvestigations.length === 0 ? (
          <p className="management-state">No investigations match these filters.</p>
        ) : (
          <div className="management-table-wrap">
            <table className="management-table">
              <thead>
                <tr>
                  <th>Investigation</th>
                  <th>Created</th>
                  <th>Last updated</th>
                  <th>Status</th>
                  <th>Evidence files</th>
                  <th>Findings</th>
                  <th aria-label="Actions"></th>
                </tr>
              </thead>
              <tbody>
                {visibleInvestigations.map((item) => (
                  <tr key={item.investigation_id}>
                    <td>
                      <strong>{item.name}</strong>
                      <span className="table-secondary">
                        {item.investigation_id}
                      </span>
                      {item.description && (
                        <span className="table-description">
                          {item.description}
                        </span>
                      )}
                    </td>
                    <td>{formatDate(item.created_at)}</td>
                    <td>{formatDate(item.updated_at)}</td>
                    <td>
                      <span className="status-pill">{item.status}</span>
                    </td>
                    <td>{item.evidence_file_count ?? 0}</td>
                    <td>{item.total_findings ?? 0}</td>
                    <td>
                      <button
                        className="secondary-button"
                        onClick={() => onOpen(item.investigation_id)}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

export function InvestigationWorkspace({
  investigation,
  analysis,
  summary,
  findings,
  anomalies,
  loading,
  error,
  notice,
  uploading,
  onUpload,
}) {
  const [file, setFile] = useState(null);
  const [sourceType, setSourceType] = useState("authentication");
  const fileInput = useRef(null);
  const files = investigation?.evidence_files || [];

  const handleUpload = async (event) => {
    event.preventDefault();
    if (!file) {
      return;
    }
    const succeeded = await onUpload(file, sourceType);
    if (succeeded) {
      setFile(null);
      if (fileInput.current) {
        fileInput.current.value = "";
      }
    }
  };

  if (loading && !investigation) {
    return <p className="management-state">Loading investigation workspace...</p>;
  }

  if (!investigation) {
    return (
      <div className="management-card management-empty">
        <h2>No investigation selected</h2>
        <p>Choose an investigation from the list to open its workspace.</p>
      </div>
    );
  }

  return (
    <section className="management-page">
      <div className="management-page-heading workspace-heading">
        <div>
          <span className="eyebrow">INVESTIGATION WORKSPACE</span>
          <h2>{investigation.name}</h2>
          <p className="workspace-id">{investigation.investigation_id}</p>
          {investigation.description && <p>{investigation.description}</p>}
        </div>
        <span className="status-pill">{investigation.status}</span>
      </div>

      {error && (
        <p className="management-message error-message" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="management-message success-message" role="status">
          {notice}
        </p>
      )}

      <div className="workspace-stats">
        <div className="management-card">
          <span>Evidence files</span>
          <strong>{files.length}</strong>
        </div>
        <div className="management-card">
          <span>Evidence records</span>
          <strong>
            {summary?.total_evidence ?? analysis?.evidence_records?.length ?? 0}
          </strong>
        </div>
        <div className="management-card">
          <span>Findings</span>
          <strong>
            {summary?.total_findings ??
              findings?.total_findings ??
              findings?.findings?.length ??
              0}
          </strong>
        </div>
        <div className="management-card">
          <span>Anomalies</span>
          <strong>
            {summary?.total_anomalies ??
              anomalies?.anomaly_count ??
              anomalies?.anomalies?.length ??
              0}
          </strong>
        </div>
      </div>

      <div className="management-card evidence-files-card">
        <div className="section-heading">
          <div>
            <h3>Associated Evidence Files</h3>
            <p>Original filenames, source types, and acquisition hashes.</p>
          </div>
        </div>
        {files.length ? (
          <div className="management-table-wrap">
            <table className="management-table evidence-files-table">
              <thead>
                <tr>
                  <th>Filename</th>
                  <th>Source type</th>
                  <th>Size</th>
                  <th>SHA-256</th>
                  <th>Acquired</th>
                </tr>
              </thead>
              <tbody>
                {files.map((item) => (
                  <tr key={`${item.source_id}-${item.file_path}`}>
                    <td>
                      <strong>{item.filename}</strong>
                    </td>
                    <td>{item.source_type}</td>
                    <td>{(item.file_size_bytes / 1024).toFixed(1)} KB</td>
                    <td>
                      <code title={item.sha256}>{item.sha256}</code>
                    </td>
                    <td>{formatDate(item.acquired_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="management-state">
            No evidence files have been added to this investigation.
          </p>
        )}
      </div>

      <div className="management-card upload-evidence-card">
        <h3>Add Evidence</h3>
        <p>Uploads are analyzed with the evidence already in this investigation.</p>
        <form className="workspace-upload-form" onSubmit={handleUpload}>
          <label>
            Evidence file
            <input
              ref={fileInput}
              type="file"
              accept=".log,.txt,.csv,.json"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
          </label>
          <label>
            Source type
            <select
              value={sourceType}
              onChange={(event) => setSourceType(event.target.value)}
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
            disabled={!file || uploading}
          >
            {uploading ? "Analyzing..." : "Upload to Investigation"}
          </button>
        </form>
      </div>

      <div className="workspace-analysis-grid">
        <div className="management-card">
          <h3>Findings</h3>
          {findings?.findings?.length ? (
            findings.findings.map((item, index) => (
              <article
                className="analysis-list-item"
                key={item.finding_id || index}
              >
                <strong>{item.title || item.rule_id || "Finding"}</strong>
                <span>{item.severity || "Review"}</span>
                <p>{item.description || "No description provided."}</p>
              </article>
            ))
          ) : (
            <p className="management-state">No findings in this investigation.</p>
          )}
        </div>
        <div className="management-card">
          <h3>Anomalies</h3>
          {anomalies?.anomalies?.length ? (
            anomalies.anomalies.map((item, index) => (
              <article
                className="analysis-list-item"
                key={`${item.evidence_id}-${index}`}
              >
                <strong>{item.event_type || "Anomaly"}</strong>
                <span>
                  {item.anomaly_score != null
                    ? `Score ${item.anomaly_score}`
                    : "Review"}
                </span>
                <p>{item.reason || item.evidence_id}</p>
              </article>
            ))
          ) : (
            <p className="management-state">No anomalies in this investigation.</p>
          )}
        </div>
      </div>
    </section>
  );
}
