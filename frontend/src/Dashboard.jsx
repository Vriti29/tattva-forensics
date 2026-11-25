import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDate, requestJson } from "./investigationApi.js";

function formatStatus(status) {
  return String(status || "Status unavailable").replaceAll("_", " ");
}

function getUpdatedTime(investigation) {
  const timestamp = Date.parse(
    investigation.updated_at || investigation.created_at || ""
  );
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function InvestigatorDashboard({
  username,
  investigations,
  loading,
  error,
  onRetry,
  onOpenInvestigation,
  onViewAll,
  selectedInvestigationId,
  investigation,
  workspaceLoading,
  workspaceError,
  workspaceNotice,
  evidenceFiles,
  evidenceRecords,
  findings,
  totalFindings,
  totalAnomalies,
  canCreate,
  onCreate,
  onContinue,
}) {
  const recentInvestigations = useMemo(
    () =>
      [...investigations]
        .sort(
          (left, right) =>
            getUpdatedTime(right) - getUpdatedTime(left)
        )
        .slice(0, 6),
    [investigations]
  );
  const statusCounts = useMemo(() => {
    const counts = new Map();
    investigations.forEach((item) => {
      const status = formatStatus(item.status);
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
  const totalRecordedFindings = useMemo(
    () =>
      investigations.reduce(
        (total, item) => total + Number(item.total_findings || 0),
        0
      ),
    [investigations]
  );
  const severityCounts = useMemo(() => {
    const counts = new Map();
    findings.forEach((finding) => {
      const severity = String(finding.severity || "Unspecified");
      counts.set(severity, (counts.get(severity) || 0) + 1);
    });
    return [...counts.entries()].sort(([left], [right]) =>
      left.localeCompare(right)
    );
  }, [findings]);
  const recentEvidenceFiles = useMemo(
    () =>
      [...evidenceFiles]
        .sort((left, right) => {
          const leftTime = Date.parse(left.acquired_at || "");
          const rightTime = Date.parse(right.acquired_at || "");
          return (
            (Number.isNaN(rightTime) ? 0 : rightTime) -
            (Number.isNaN(leftTime) ? 0 : leftTime)
          );
        })
        .slice(0, 4),
    [evidenceFiles]
  );
  const metricsUnavailable = loading || Boolean(error);

  return (
    <section className="dashboard-view investigator-dashboard">
      <header className="dashboard-welcome-panel">
        <div className="dashboard-welcome-copy">
          <span className="dashboard-kicker">INVESTIGATION WORKSPACE</span>
          <h2>Welcome back, {username}</h2>
          <p>
            Review your accessible investigations and continue the casework
            that needs your attention.
          </p>
        </div>
        <div className="dashboard-welcome-actions">
          {canCreate && (
            <button className="primary-button" onClick={onCreate}>
              New investigation
            </button>
          )}
          <button className="secondary-button" onClick={onViewAll}>
            View all investigations
          </button>
        </div>
      </header>

      {error && (
        <div className="dashboard-alert" role="alert">
          <span>{error}</span>
          <button className="dashboard-text-button" onClick={onRetry}>
            Retry
          </button>
        </div>
      )}

      <section className="dashboard-metrics" aria-label="Investigation overview">
        {[
          ["Accessible investigations", investigations.length],
          ["Evidence files", totalEvidenceFiles],
          ["Findings recorded", totalRecordedFindings],
        ].map(([label, value]) => (
          <article className="dashboard-metric-card" key={label}>
            <span>{label}</span>
            <strong>{metricsUnavailable ? "—" : value}</strong>
          </article>
        ))}
      </section>

      <div className="investigator-dashboard-grid">
        <section className="dashboard-panel dashboard-investigation-list">
          <div className="dashboard-panel-heading">
            <div>
              <span className="dashboard-kicker">CASEWORK</span>
              <h3>Recently updated investigations</h3>
              <p>Open a case to make it your active investigation.</p>
            </div>
          </div>

          {loading ? (
            <p className="dashboard-empty-state" role="status">
              Loading investigations…
            </p>
          ) : error ? (
            <p className="dashboard-empty-state">
              Investigation records could not be loaded.
            </p>
          ) : investigations.length === 0 ? (
            <div className="dashboard-empty-state">
              <strong>No investigations are available.</strong>
              <p>
                Investigations assigned to your account will appear here.
              </p>
              {canCreate && (
                <button className="primary-button" onClick={onCreate}>
                  Create an investigation
                </button>
              )}
            </div>
          ) : (
            <div className="dashboard-investigation-rows">
              {recentInvestigations.map((item) => {
                const isSelected =
                  item.investigation_id === selectedInvestigationId;
                return (
                  <article
                    className={`dashboard-investigation-row ${
                      isSelected ? "is-selected" : ""
                    }`}
                    key={item.investigation_id}
                  >
                    <div className="dashboard-investigation-main">
                      <div className="dashboard-investigation-title">
                        <strong>{item.name}</strong>
                        <span>{item.investigation_id}</span>
                      </div>
                      <span className="dashboard-status-pill">
                        {formatStatus(item.status)}
                      </span>
                    </div>
                    <div className="dashboard-investigation-meta">
                      <span>
                        {item.evidence_file_count ?? 0} evidence files
                      </span>
                      <span>
                        Updated{" "}
                        {formatDate(item.updated_at || item.created_at)}
                      </span>
                    </div>
                    <button
                      className="dashboard-row-action"
                      onClick={() =>
                        onOpenInvestigation(item.investigation_id)
                      }
                      aria-pressed={isSelected}
                    >
                      {isSelected ? "Active investigation" : "Open case"}
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <div className="dashboard-side-column">
          <section className="dashboard-panel">
            <div className="dashboard-panel-heading">
              <div>
                <span className="dashboard-kicker">STATUS OVERVIEW</span>
                <h3>Investigations by status</h3>
              </div>
            </div>
            {loading ? (
              <p className="dashboard-empty-state" role="status">
                Loading status information…
              </p>
            ) : error ? (
              <p className="dashboard-empty-state">
                Status information is unavailable.
              </p>
            ) : statusCounts.length ? (
              <ul className="dashboard-status-list">
                {statusCounts.map(([status, count]) => (
                  <li key={status}>
                    <span className="dashboard-status-pill">{status}</span>
                    <strong>{count}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="dashboard-empty-state">
                Status information will appear when investigations are
                available.
              </p>
            )}
          </section>

          <section className="dashboard-panel dashboard-selected-case">
            <div className="dashboard-panel-heading">
              <div>
                <span className="dashboard-kicker">CONTINUE CASEWORK</span>
                <h3>
                  {investigation?.name || "Select an investigation"}
                </h3>
              </div>
              {investigation && (
                <span className="dashboard-status-pill">
                  {formatStatus(investigation.status)}
                </span>
              )}
            </div>

            {workspaceNotice && (
              <p className="dashboard-notice" role="status">
                {workspaceNotice}
              </p>
            )}
            {workspaceError && (
              <p className="dashboard-alert" role="alert">
                {workspaceError}
              </p>
            )}

            {workspaceLoading && !investigation ? (
              <p className="dashboard-empty-state" role="status">
                Loading the selected investigation…
              </p>
            ) : investigation ? (
              <>
                <p className="dashboard-selected-case-description">
                  {investigation.description ||
                    "No investigation description is available."}
                </p>
                <div className="dashboard-selected-case-stats">
                  <div>
                    <span>Evidence files</span>
                    <strong>{evidenceFiles.length}</strong>
                  </div>
                  <div>
                    <span>Evidence records</span>
                    <strong>{evidenceRecords.length}</strong>
                  </div>
                  <div>
                    <span>Findings</span>
                    <strong>{totalFindings}</strong>
                  </div>
                  <div>
                    <span>Anomalies</span>
                    <strong>{totalAnomalies}</strong>
                  </div>
                </div>

                {severityCounts.length > 0 && findings.length > 0 && (
                  <div className="dashboard-severity">
                    <h4>Finding severity</h4>
                    {severityCounts.map(([severity, count]) => (
                      <div className="dashboard-severity-row" key={severity}>
                        <span>{severity}</span>
                        <div
                          className="dashboard-severity-track"
                          role="progressbar"
                          aria-label={`${severity} findings`}
                          aria-valuemin="0"
                          aria-valuemax={findings.length}
                          aria-valuenow={count}
                        >
                          <span
                            style={{
                              width: `${(count / findings.length) * 100}%`,
                            }}
                          />
                        </div>
                        <strong>{count}</strong>
                      </div>
                    ))}
                  </div>
                )}

                <div className="dashboard-recent-evidence">
                  <div className="dashboard-subsection-heading">
                    <h4>Recent evidence</h4>
                    <span>{evidenceFiles.length} files</span>
                  </div>
                  {recentEvidenceFiles.length ? (
                    <ul>
                      {recentEvidenceFiles.map((file) => (
                        <li key={file.source_id}>
                          <div>
                            <strong>{file.filename}</strong>
                            <span>{file.source_type}</span>
                          </div>
                          <time dateTime={file.acquired_at}>
                            {formatDate(file.acquired_at)}
                          </time>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="dashboard-empty-state">
                      No evidence files have been added to this investigation.
                    </p>
                  )}
                </div>
                <button
                  className="primary-button dashboard-continue-button"
                  onClick={onContinue}
                  disabled={workspaceLoading}
                >
                  Open evidence workspace
                </button>
              </>
            ) : (
              <p className="dashboard-empty-state">
                Choose a case from the list to see its evidence and continue
                working.
              </p>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}

export function AdministratorDashboard({
  username,
  investigationCount,
  investigationsLoading,
  onManageAccess,
  onManageInvestigations,
}) {
  const [users, setUsers] = useState([]);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await requestJson("/users");
      if (!Array.isArray(rows)) {
        throw new Error("The users endpoint returned an unexpected response.");
      }
      setUsers(rows);
      setUsersLoaded(true);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(loadUsers);
  }, [loadUsers]);

  const activeUsers = useMemo(
    () => users.filter((user) => user.is_active),
    [users]
  );
  const accountsNeedingAttention = useMemo(
    () =>
      users.filter(
        (user) => !user.is_active || user.password_change_required
      ),
    [users]
  );
  const roleDistribution = useMemo(() => {
    const counts = new Map();
    users.forEach((user) => {
      const role = String(user.role || "Unspecified");
      counts.set(role, (counts.get(role) || 0) + 1);
    });
    return [...counts.entries()].sort(
      ([roleA, countA], [roleB, countB]) =>
        countB - countA || roleA.localeCompare(roleB)
    );
  }, [users]);
  const accountDataAvailable = usersLoaded && !error;

  return (
    <section className="dashboard-view administrator-dashboard">
      <header className="dashboard-welcome-panel">
        <div className="dashboard-welcome-copy">
          <span className="dashboard-kicker">PLATFORM ADMINISTRATION</span>
          <h2>Administration overview</h2>
          <p>
            Welcome, {username}. Review account posture and manage access to
            the investigation platform.
          </p>
        </div>
        <button className="primary-button" onClick={onManageAccess}>
          Manage accounts and access
        </button>
      </header>

      {error && (
        <div className="dashboard-alert" role="alert">
          <span>{error}</span>
          <button
            className="dashboard-text-button"
            onClick={loadUsers}
            disabled={loading}
          >
            {loading ? "Retrying…" : "Retry"}
          </button>
        </div>
      )}

      <section className="dashboard-metrics" aria-label="Platform overview">
        {[
          ["User accounts", accountDataAvailable ? users.length : "—"],
          ["Active accounts", accountDataAvailable ? activeUsers.length : "—"],
          [
            "Password updates required",
            accountDataAvailable ? accountsNeedingAttention.filter(
              (user) => user.password_change_required
            ).length : "—",
          ],
          [
            "Investigations",
            investigationsLoading ? "—" : investigationCount,
          ],
        ].map(([label, value]) => (
          <article className="dashboard-metric-card" key={label}>
            <span>{label}</span>
            <strong>{loading && !accountDataAvailable ? "—" : value}</strong>
          </article>
        ))}
      </section>

      <div className="administrator-dashboard-grid">
        <section className="dashboard-panel">
          <div className="dashboard-panel-heading">
            <div>
              <span className="dashboard-kicker">ACCOUNT POSTURE</span>
              <h3>User role distribution</h3>
              <p>Counts are calculated from the accounts returned by the API.</p>
            </div>
          </div>
          {loading && !usersLoaded ? (
            <p className="dashboard-empty-state" role="status">
              Loading account information…
            </p>
          ) : error && !usersLoaded ? (
            <p className="dashboard-empty-state">
              Account distribution is unavailable until user data loads.
            </p>
          ) : roleDistribution.length ? (
            <div className="dashboard-role-list">
              {roleDistribution.map(([role, count]) => (
                <div className="dashboard-role-row" key={role}>
                  <div className="dashboard-role-label">
                    <span>{role.replaceAll("_", " ")}</span>
                    <strong>{count}</strong>
                  </div>
                  <div
                    className="dashboard-role-track"
                    role="progressbar"
                    aria-label={`${role.replaceAll("_", " ")} accounts`}
                    aria-valuemin="0"
                    aria-valuemax={users.length}
                    aria-valuenow={count}
                  >
                    <span
                      style={{
                        width: `${(count / users.length) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="dashboard-empty-state">
              No user accounts were returned.
            </p>
          )}
        </section>

        <section className="dashboard-panel">
          <div className="dashboard-panel-heading">
            <div>
              <span className="dashboard-kicker">ACCESS REVIEW</span>
              <h3>Accounts needing attention</h3>
              <p>
                Inactive accounts and accounts requiring a password update.
              </p>
            </div>
          </div>
          {loading && !usersLoaded ? (
            <p className="dashboard-empty-state" role="status">
              Loading account information…
            </p>
          ) : error && !usersLoaded ? (
            <p className="dashboard-empty-state">
              Account review is unavailable until user data loads.
            </p>
          ) : accountsNeedingAttention.length ? (
            <ul className="dashboard-attention-list">
              {accountsNeedingAttention.slice(0, 5).map((user) => (
                <li key={user.user_id}>
                  <div>
                    <strong>{user.username}</strong>
                    <span>{String(user.role || "Unspecified").replaceAll("_", " ")}</span>
                  </div>
                  <div className="dashboard-attention-tags">
                    {!user.is_active && (
                      <span className="dashboard-status-pill">Inactive</span>
                    )}
                    {user.password_change_required && (
                      <span className="dashboard-status-pill dashboard-status-warning">
                        Password update required
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="dashboard-empty-state">
              No returned accounts require attention.
            </p>
          )}
          {accountsNeedingAttention.length > 5 && (
            <p className="dashboard-supporting-text">
              Showing 5 of {accountsNeedingAttention.length} accounts requiring
              attention.
            </p>
          )}
        </section>
      </div>

      <section className="dashboard-panel dashboard-admin-actions">
        <div className="dashboard-panel-heading">
          <div>
            <span className="dashboard-kicker">ADMINISTRATIVE CONTROLS</span>
            <h3>Platform operations</h3>
            <p>Open existing controls for account access and investigations.</p>
          </div>
        </div>
        <div className="dashboard-admin-action-list">
          <button className="dashboard-admin-action" onClick={onManageAccess}>
            <span className="dashboard-admin-action-icon" aria-hidden="true">
              AC
            </span>
            <span>
              <strong>User and access management</strong>
              <small>Create accounts, review roles, and manage assignments.</small>
            </span>
            <span aria-hidden="true">→</span>
          </button>
          <button
            className="dashboard-admin-action"
            onClick={onManageInvestigations}
          >
            <span className="dashboard-admin-action-icon" aria-hidden="true">
              IN
            </span>
            <span>
              <strong>Investigation register</strong>
              <small>Review the investigations available to your account.</small>
            </span>
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </section>
    </section>
  );
}