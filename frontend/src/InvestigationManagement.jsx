import { useMemo, useState } from "react";
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

export function UpdateInvestigationModal({
  investigation,
  onClose,
  onUpdated,
}) {
  const [name, setName] = useState(investigation.name || "");
  const [description, setDescription] = useState(
    investigation.description || ""
  );
  const [status, setStatus] = useState(investigation.status || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!name.trim() || !status.trim()) {
      setError("Enter an investigation name and status.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const updated = await requestJson(
        `/investigations/${encodeURIComponent(
          investigation.investigation_id
        )}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim(),
            status: status.trim(),
          }),
        }
      );
      await onUpdated(updated);
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
        aria-labelledby="edit-investigation-title"
      >
        <div className="management-modal-heading">
          <div>
            <span className="eyebrow">CASE MANAGEMENT</span>
            <h2 id="edit-investigation-title">Edit investigation</h2>
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
          <label htmlFor="edit-investigation-name">Investigation name</label>
          <input
            id="edit-investigation-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={200}
            required
            autoFocus
            disabled={submitting}
          />

          <label htmlFor="edit-investigation-status">Status</label>
          <input
            id="edit-investigation-status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            maxLength={50}
            required
            disabled={submitting}
          />

          <label htmlFor="edit-investigation-description">Description</label>
          <textarea
            id="edit-investigation-description"
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
              disabled={submitting || !name.trim() || !status.trim()}
            >
              {submitting ? "Saving..." : "Save changes"}
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
  canCreate = false,
  canUpdate = false,
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editingInvestigation, setEditingInvestigation] = useState(null);
  const [notice, setNotice] = useState("");
  const statuses = useMemo(
    () =>
      [...new Set(investigations.map((item) => item.status).filter(Boolean))]
        .sort(),
    [investigations]
  );
  const statusCounts = useMemo(() => {
    const counts = new Map();
    investigations.forEach((item) => {
      const status = item.status || "Status unavailable";
      counts.set(status, (counts.get(status) || 0) + 1);
    });
    return [...counts.entries()].sort(([left], [right]) =>
      left.localeCompare(right)
    );
  }, [investigations]);
  const totalEvidenceFiles = useMemo(
    () =>
      investigations.reduce(
        (total, item) => total + Number(item.evidence_file_count || 0),
        0
      ),
    [investigations]
  );
  const totalFindings = useMemo(
    () =>
      investigations.reduce(
        (total, item) => total + Number(item.total_findings || 0),
        0
      ),
    [investigations]
  );
  const visibleInvestigations = useMemo(() => {
    const query = search.trim().toLowerCase();
    return investigations.filter((item) => {
      const matchesSearch =
        !query ||
        item.name.toLowerCase().includes(query) ||
        item.investigation_id.toLowerCase().includes(query) ||
        (item.description || "").toLowerCase().includes(query);
      const matchesStatus =
        statusFilter === "all" || item.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [investigations, search, statusFilter]);
  const handleUpdated = async (updated) => {
    await onRetry(updated);
    if (
      updated.name !== editingInvestigation.name ||
      updated.description !== editingInvestigation.description
    ) {
      setSearch("");
    }
    if (updated.status !== editingInvestigation.status) {
      setStatusFilter("all");
    }
    setNotice(`${updated.name} was updated.`);
    setEditingInvestigation(null);
  };
  const hasFilters = Boolean(search.trim()) || statusFilter !== "all";

  return (
    <section className="management-page investigations-page">
      <div className="investigations-page-heading">
        <div>
          <span className="investigations-kicker">CASE MANAGEMENT</span>
          <h2>Investigation register</h2>
          <p>
            Search, review, and manage investigations available to your
            account.
          </p>
        </div>
        {canCreate && (
          <button
            className="primary-button investigations-create-button"
            onClick={onCreate}
          >
            <span aria-hidden="true">+</span>
            New investigation
          </button>
        )}
      </div>

      <section
        className="investigations-overview"
        aria-label="Investigation overview"
      >
        {[
          ["Investigations", investigations.length],
          ["Evidence files", totalEvidenceFiles],
          ["Recorded findings", totalFindings],
        ].map(([label, value]) => (
          <article className="investigation-overview-metric" key={label}>
            <span>{label}</span>
            <strong>{loading || error ? "—" : value}</strong>
          </article>
        ))}
      </section>

      <section
        className="investigation-status-overview"
        aria-label="Investigation status summary"
      >
        <div className="investigation-status-heading">
          <span className="investigations-kicker">STATUS OVERVIEW</span>
          <span>
            {loading || error
              ? "Status counts unavailable"
              : `${statusCounts.length} ${
                  statusCounts.length === 1 ? "status" : "statuses"
                }`}
          </span>
        </div>
        {loading || error ? (
          <p className="investigation-status-empty">
            Status counts will be shown when investigation data is available.
          </p>
        ) : statusCounts.length ? (
          <div className="investigation-status-list">
            {statusCounts.map(([status, count]) => (
              <span className="investigation-status-count" key={status}>
                <span>{status}</span>
                <strong>{count}</strong>
              </span>
            ))}
          </div>
        ) : (
          <p className="investigation-status-empty">
            No investigation statuses are available yet.
          </p>
        )}
      </section>

      <section className="investigation-register-panel">
        <div className="investigation-register-heading">
          <div>
            <span className="investigations-kicker">CASEWORK</span>
            <h3>Investigations</h3>
            <p>
              {loading
                ? "Loading available investigations..."
                : `${visibleInvestigations.length} of ${investigations.length} investigations`}
            </p>
          </div>
          <div className="investigation-filters">
            <label>
              <span>Search</span>
              <input
                type="search"
                aria-label="Search investigations"
                placeholder="Name, ID, or description"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <label>
              <span>Status</span>
              <select
                aria-label="Filter investigations by status"
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
        </div>

        {error && (
          <div className="investigations-message investigations-error" role="alert">
            <span>{error}</span>
            <button className="investigations-inline-button" onClick={() => onRetry()}>
              Retry
            </button>
          </div>
        )}
        {notice && (
          <p className="investigations-message investigations-success" role="status">
            {notice}
          </p>
        )}

        {loading && investigations.length === 0 ? (
          <p className="investigations-state" role="status">
            Loading investigation records…
          </p>
        ) : error && investigations.length === 0 ? (
          <div className="investigations-empty">
            <h4>Investigation records unavailable</h4>
            <p>Retry the request to load the investigation register.</p>
          </div>
        ) : investigations.length === 0 ? (
          <div className="investigations-empty">
            <span className="investigations-empty-mark" aria-hidden="true">
              IN
            </span>
            <h4>No investigations available</h4>
            <p>
              {canCreate
                ? "Create an investigation to begin organizing evidence and analysis."
                : "Investigations assigned to your account will appear here."}
            </p>
            {canCreate && (
              <button
                className="primary-button"
                onClick={onCreate}
              >
                Create investigation
              </button>
            )}
          </div>
        ) : visibleInvestigations.length === 0 ? (
          <div className="investigations-empty">
            <h4>No matching investigations</h4>
            <p>Try a different search term or status filter.</p>
            {hasFilters && (
              <button
                className="investigations-inline-button"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="investigation-record-list">
            {visibleInvestigations.map((item) => (
              <article
                className="investigation-record"
                key={item.investigation_id}
              >
                <div className="investigation-record-main">
                  <div className="investigation-record-title">
                    <h4>{item.name}</h4>
                    <code>{item.investigation_id}</code>
                  </div>
                  <span
                    className={`investigation-record-status ${
                      String(item.status).toLowerCase() === "open"
                        ? "is-open"
                        : ""
                    }`}
                  >
                    {item.status}
                  </span>
                </div>

                {item.description && (
                  <p className="investigation-record-description">
                    {item.description}
                  </p>
                )}

                <div className="investigation-record-details">
                  <div>
                    <span>Created</span>
                    <strong>{formatDate(item.created_at)}</strong>
                  </div>
                  <div>
                    <span>Last updated</span>
                    <strong>{formatDate(item.updated_at)}</strong>
                  </div>
                  <div>
                    <span>Evidence files</span>
                    <strong>{item.evidence_file_count ?? 0}</strong>
                  </div>
                  <div>
                    <span>Recorded findings</span>
                    <strong>{item.total_findings ?? 0}</strong>
                  </div>
                </div>

                <div className="investigation-record-actions">
                  <button
                    className="secondary-button"
                    onClick={() => onOpen(item.investigation_id)}
                  >
                    Open investigation
                  </button>
                  {canUpdate && (
                    <button
                      className="investigation-edit-button"
                      onClick={() => {
                        setNotice("");
                        setEditingInvestigation(item);
                      }}
                    >
                      Edit details
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {editingInvestigation && (
        <UpdateInvestigationModal
          investigation={editingInvestigation}
          onClose={() => setEditingInvestigation(null)}
          onUpdated={handleUpdated}
        />
      )}
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
}) {
  const files = investigation?.evidence_files || [];

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
