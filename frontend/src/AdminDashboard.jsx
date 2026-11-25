import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDate, requestJson } from "./investigationApi.js";

const ROLES = [
  "ADMIN",
  "LEAD_INVESTIGATOR",
  "INVESTIGATOR",
  "VIEWER",
];
const ASSIGNABLE_ROLES = new Set([
  "LEAD_INVESTIGATOR",
  "INVESTIGATOR",
  "VIEWER",
]);

function jsonOptions(method, body) {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export function AdminDashboard() {
  const [users, setUsers] = useState([]);
  const [investigations, setInvestigations] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [assignmentDrafts, setAssignmentDrafts] = useState({});
  const [newUser, setNewUser] = useState({
    username: "",
    password: "",
    role: "INVESTIGATOR",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");

  const usersById = useMemo(
    () => new Map(users.map((user) => [user.user_id, user])),
    [users]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [userRows, investigationRows] = await Promise.all([
        requestJson("/users"),
        requestJson("/investigations"),
      ]);
      const assignmentRows = await Promise.all(
        investigationRows.map(async (investigation) => [
          investigation.investigation_id,
          await requestJson(
            `/investigations/${encodeURIComponent(
              investigation.investigation_id
            )}/assignments`
          ),
        ])
      );
      setUsers(userRows);
      setInvestigations(investigationRows);
      setAssignments(Object.fromEntries(assignmentRows));
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(loadData);
  }, [loadData]);

  const createUser = async (event) => {
    event.preventDefault();
    setBusy("create-user");
    setError("");
    setNotice("");
    try {
      const created = await requestJson(
        "/users",
        jsonOptions("POST", newUser)
      );
      setNewUser({ username: "", password: "", role: "INVESTIGATOR" });
      setNotice(
        `${created.username} was created. They must change this password after signing in.`
      );
      await loadData();
    } catch (createError) {
      setError(createError.message);
    } finally {
      setBusy("");
    }
  };

  const changeRole = async (user, role) => {
    if (role === user.role) {
      return;
    }
    setBusy(user.user_id);
    setError("");
    setNotice("");
    try {
      const updated = await requestJson(
        `/users/${encodeURIComponent(user.user_id)}`,
        jsonOptions("PATCH", { role })
      );
      setUsers((current) =>
        current.map((item) =>
          item.user_id === updated.user_id ? updated : item
        )
      );
      setNotice(`${updated.username}'s role is now ${updated.role}.`);
    } catch (updateError) {
      setError(updateError.message);
    } finally {
      setBusy("");
    }
  };

  const toggleUser = async (user) => {
    const isActive = !user.is_active;
    if (
      !isActive &&
      !window.confirm(`Deactivate ${user.username}? Their sessions will end.`)
    ) {
      return;
    }
    setBusy(user.user_id);
    setError("");
    setNotice("");
    try {
      const updated = await requestJson(
        `/users/${encodeURIComponent(user.user_id)}`,
        jsonOptions("PATCH", { is_active: isActive })
      );
      setUsers((current) =>
        current.map((item) =>
          item.user_id === updated.user_id ? updated : item
        )
      );
      setNotice(
        `${updated.username} is ${updated.is_active ? "active" : "inactive"}.`
      );
    } catch (updateError) {
      setError(updateError.message);
    } finally {
      setBusy("");
    }
  };

  const assignUser = async (investigation) => {
    const investigationId = investigation.investigation_id;
    const userId = assignmentDrafts[investigationId];
    if (!userId) {
      setError("Choose an active investigator or viewer to assign.");
      return;
    }
    setBusy(`assignment:${investigationId}`);
    setError("");
    setNotice("");
    try {
      await requestJson(
        `/investigations/${encodeURIComponent(investigationId)}/assignments`,
        jsonOptions("POST", { user_id: userId })
      );
      setNotice(
        `${usersById.get(userId)?.username || "User"} was assigned to ${investigation.name}.`
      );
      setAssignmentDrafts((current) => ({
        ...current,
        [investigationId]: "",
      }));
      await loadData();
    } catch (assignmentError) {
      setError(assignmentError.message);
    } finally {
      setBusy("");
    }
  };

  const removeAssignment = async (investigation, assignment) => {
    const assignedUser =
      usersById.get(assignment.user_id)?.username || assignment.user_id;
    if (
      !window.confirm(
        `Remove ${assignedUser} from ${investigation.name}?`
      )
    ) {
      return;
    }
    const investigationId = investigation.investigation_id;
    setBusy(`assignment:${investigationId}`);
    setError("");
    setNotice("");
    try {
      await requestJson(
        `/investigations/${encodeURIComponent(investigationId)}/assignments/${encodeURIComponent(assignment.assignment_id)}`,
        { method: "DELETE" }
      );
      setNotice(`${assignedUser} was removed from ${investigation.name}.`);
      await loadData();
    } catch (assignmentError) {
      setError(assignmentError.message);
    } finally {
      setBusy("");
    }
  };

  const activeUsers = users.filter(
    (user) =>
      user.is_active && ASSIGNABLE_ROLES.has(user.role)
  );

  return (
    <section className="management-page admin-dashboard">
      <div className="management-page-heading">
        <div className="admin-page-description">
          <p>Manage accounts and assigned investigation access.</p>
        </div>
        <button
          className="secondary-button"
          onClick={loadData}
          disabled={loading}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
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
      {loading && !users.length && (
        <p className="management-state" role="status">
          Loading users and investigations...
        </p>
      )}

      <div className="admin-dashboard-grid">
        <section className="management-card">
          <h3>Create Account</h3>
          <p>Accounts are admin-created; no public registration is available.</p>
          <form className="management-form" onSubmit={createUser}>
            <label htmlFor="new-user-username">Username or email</label>
            <input
              id="new-user-username"
              autoComplete="username"
              value={newUser.username}
              onChange={(event) =>
                setNewUser((current) => ({
                  ...current,
                  username: event.target.value,
                }))
              }
              minLength={1}
              maxLength={320}
              required
              disabled={busy === "create-user"}
            />
            <label htmlFor="new-user-password">Initial password</label>
            <input
              id="new-user-password"
              type="password"
              autoComplete="new-password"
              aria-describedby="new-user-password-help"
              value={newUser.password}
              onChange={(event) =>
                setNewUser((current) => ({
                  ...current,
                  password: event.target.value,
                }))
              }
              minLength={12}
              maxLength={256}
              required
              disabled={busy === "create-user"}
            />
            <label htmlFor="new-user-role">Role</label>
            <select
              id="new-user-role"
              value={newUser.role}
              onChange={(event) =>
                setNewUser((current) => ({
                  ...current,
                  role: event.target.value,
                }))
              }
              disabled={busy === "create-user"}
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            <p id="new-user-password-help" className="admin-help">
              Passwords must contain 12 to 256 characters. The user must change
              the initial password before accessing cases.
            </p>
            <button
              className="primary-button"
              type="submit"
              disabled={
                busy === "create-user" ||
                !newUser.username.trim() ||
                newUser.password.length < 12
              }
            >
              {busy === "create-user" ? "Creating account..." : "Create account"}
            </button>
          </form>
        </section>

        <section className="management-card admin-audit-card">
          <h3>Audit Activity</h3>
          <div className="admin-audit-unavailable" role="status">
            <strong>Audit events unavailable</strong>
            <p>
              The backend does not provide an audit read endpoint yet. No
              activity records are shown.
            </p>
          </div>
        </section>
      </div>

      <section className="management-card admin-section">
        <div className="section-heading">
          <div>
            <h3>User Management</h3>
            <p>Account roles and status are enforced by the backend.</p>
          </div>
          <span className="status-pill">{users.length} accounts</span>
        </div>
        {users.length ? (
          <div className="management-table-wrap">
            <table className="management-table admin-users-table">
              <thead>
                <tr>
                  <th>Investigator</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Password</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.user_id}>
                    <td>
                      <strong>{user.username}</strong>
                      <span className="table-secondary">{user.user_id}</span>
                    </td>
                    <td>
                      <select
                        aria-label={`Role for ${user.username}`}
                        value={user.role}
                        onChange={(event) =>
                          changeRole(user, event.target.value)
                        }
                        disabled={busy === user.user_id}
                      >
                        {ROLES.map((role) => (
                          <option key={role} value={role}>
                            {role.replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <span
                        className={`status-pill ${
                          user.is_active ? "" : "inactive-status"
                        }`}
                      >
                        {user.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>{formatDate(user.created_at)}</td>
                    <td>
                      {user.password_change_required
                        ? "Change required"
                        : "Current"}
                    </td>
                    <td>
                      <button
                        className="secondary-button"
                        onClick={() => toggleUser(user)}
                        disabled={busy === user.user_id}
                      >
                        {user.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !loading ? (
          <p className="management-state">No user accounts were returned.</p>
        ) : null}
      </section>

      <section className="management-card admin-section">
        <div className="section-heading">
          <div>
            <h3>Case Assignments</h3>
            <p>
              Assign active officers to the existing cases without creating or
              replacing investigations.
            </p>
          </div>
          <span className="status-pill">
            {investigations.length} investigations
          </span>
        </div>

        {investigations.length ? (
          <div className="admin-case-list">
            {investigations.map((investigation) => {
              const activeAssignments = (
                assignments[investigation.investigation_id] || []
              ).filter((assignment) => assignment.revoked_at === null);
              return (
                <article
                  className="admin-case-card"
                  key={investigation.investigation_id}
                >
                  <div className="admin-case-heading">
                    <div>
                      <strong>{investigation.name}</strong>
                      <span className="table-secondary">
                        {investigation.investigation_id}
                      </span>
                    </div>
                    <span className="status-pill">{investigation.status}</span>
                  </div>
                  <p className="admin-case-meta">
                    {investigation.evidence_file_count ?? 0} evidence files
                    {" · "}Created {formatDate(investigation.created_at)}
                  </p>

                  <div className="assigned-officers">
                    <strong>Assigned officers</strong>
                    {activeAssignments.length ? (
                      <ul>
                        {activeAssignments.map((assignment) => (
                          <li key={assignment.assignment_id}>
                            <span>
                              {usersById.get(assignment.user_id)?.username ||
                                assignment.user_id}
                              {" · "}
                              {usersById.get(assignment.user_id)?.role ||
                                "Unknown role"}
                            </span>
                            <button
                              className="text-button"
                              onClick={() =>
                                removeAssignment(investigation, assignment)
                              }
                              disabled={
                                busy ===
                                `assignment:${investigation.investigation_id}`
                              }
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="management-state">
                        No investigators are assigned.
                      </p>
                    )}
                  </div>

                  <div className="admin-assignment-controls">
                    <label htmlFor={`assign-${investigation.investigation_id}`}>
                      Assign an active officer
                    </label>
                    <select
                      id={`assign-${investigation.investigation_id}`}
                      value={
                        assignmentDrafts[investigation.investigation_id] || ""
                      }
                      onChange={(event) =>
                        setAssignmentDrafts((current) => ({
                          ...current,
                          [investigation.investigation_id]: event.target.value,
                        }))
                      }
                      disabled={busy === `assignment:${investigation.investigation_id}`}
                    >
                      <option value="">Select an account</option>
                      {activeUsers
                        .filter(
                          (user) =>
                            !activeAssignments.some(
                              (assignment) =>
                                assignment.user_id === user.user_id
                            )
                        )
                        .map((user) => (
                          <option key={user.user_id} value={user.user_id}>
                            {user.username} — {user.role.replaceAll("_", " ")}
                          </option>
                        ))}
                    </select>
                    <button
                      className="primary-button"
                      onClick={() => assignUser(investigation)}
                      disabled={
                        busy === `assignment:${investigation.investigation_id}` ||
                        !assignmentDrafts[investigation.investigation_id]
                      }
                    >
                      {busy === `assignment:${investigation.investigation_id}`
                        ? "Saving..."
                        : "Assign"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : !loading ? (
          <p className="management-state">No investigations were returned.</p>
        ) : null}
      </section>
    </section>
  );
}
