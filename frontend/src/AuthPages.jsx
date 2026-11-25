import { useState } from "react";

export function AuthLoadingPage({ message = "Restoring your secure session..." }) {
  return (
    <main className="auth-page">
      <AuthBrand />
      <section className="auth-panel auth-panel-compact" aria-live="polite">
        <div className="brand-logo auth-logo">TF</div>
        <p className="auth-kicker">SECURE WORKSPACE</p>
        <h1>Restoring access</h1>
        <p className="auth-description">{message}</p>
      </section>
    </main>
  );
}

function AuthBrand() {
  return (
    <header className="auth-header">
      <a className="auth-wordmark" href="/" aria-label="Tattva Forensics home">
        <span className="brand-logo">TF</span>
        <span>
          <strong>TATTVA</strong>
          <small>FORENSICS PLATFORM</small>
        </span>
      </a>
      <span className="auth-header-status">
        <span className="auth-status-dot" />
        SECURE ACCESS
      </span>
    </header>
  );
}

export function LoginPage({ onLogin, notice, connectionError }) {
  const [loginMode, setLoginMode] = useState("investigator");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await onLogin(username.trim(), password);
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <AuthBrand />
      <div className="auth-layout">
        <section className="auth-story">
          <p className="auth-kicker">DIGITAL FORENSICS · CASE INTELLIGENCE</p>
          <h1>
            Every detail
            <br />
            <span>moves the case forward.</span>
          </h1>
          <p className="auth-story-copy">
            A focused workspace for examining evidence, tracing events, and
            understanding the connections between them.
          </p>

          <div className="auth-visualization" aria-hidden="true">
            <div className="visualization-grid" />
            <div className="visualization-orbit orbit-outer" />
            <div className="visualization-orbit orbit-inner" />
            <div className="visualization-core">
              <span>CASE</span>
              <strong>INTELLIGENCE</strong>
            </div>
            <span className="visualization-node node-one" />
            <span className="visualization-node node-two" />
            <span className="visualization-node node-three" />
            <span className="visualization-node node-four" />
            <div className="visualization-caption">
              <span>01</span>
              <span>Evidence. Context. Clarity.</span>
            </div>
          </div>

          <div className="auth-trust-row">
            <span>PRIVATE BY DESIGN</span>
            <i />
            <span>ROLE-VERIFIED ACCESS</span>
          </div>
        </section>

        <section className="auth-panel">
          <div className="auth-panel-heading">
            <p className="auth-kicker">WELCOME BACK</p>
            <h2>Sign in to Tattva</h2>
            <p className="auth-description">
              Choose your sign-in area, then use your provisioned account.
            </p>
          </div>

          <div
            className="auth-mode-switch"
            role="group"
            aria-label="Choose sign-in area"
          >
            <button
              type="button"
              className={`auth-mode-option ${
                loginMode === "investigator" ? "selected" : ""
              }`}
              aria-pressed={loginMode === "investigator"}
              onClick={() => setLoginMode("investigator")}
              disabled={submitting}
            >
              <span className="auth-mode-icon" aria-hidden="true">⌕</span>
              <span>
                <strong>Investigator Sign In</strong>
                <small>Case workspace</small>
              </span>
            </button>
            <button
              type="button"
              className={`auth-mode-option ${
                loginMode === "administrator" ? "selected" : ""
              }`}
              aria-pressed={loginMode === "administrator"}
              onClick={() => setLoginMode("administrator")}
              disabled={submitting}
            >
              <span className="auth-mode-icon admin-icon" aria-hidden="true">◇</span>
              <span>
                <strong>Administrator Sign In</strong>
                <small>Platform controls</small>
              </span>
            </button>
          </div>

          <p className="auth-mode-note">
            {loginMode === "administrator"
              ? "Sign in with the administrator account assigned to you."
              : "Sign in with the investigator account assigned to you."}
            {" "}Your account role and permissions are verified by the server.
          </p>

          {notice && (
            <p className="auth-message auth-success" role="status">
              {notice}
            </p>
          )}
          {(error || connectionError) && (
            <p className="auth-message auth-error" role="alert">
              {error || connectionError}
            </p>
          )}

          <form className="auth-form" onSubmit={handleSubmit}>
            <label htmlFor="login-username">Username or email</label>
            <input
              id="login-username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              maxLength={320}
              required
              disabled={submitting}
              placeholder="name@organization.com"
            />
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              maxLength={1024}
              required
              disabled={submitting}
              placeholder="Enter your password"
            />
            <button
              className="auth-submit"
              type="submit"
              disabled={submitting || !username.trim() || !password}
            >
              {submitting ? "Verifying credentials..." : "Continue securely"}
              <span aria-hidden="true">→</span>
            </button>
          </form>

          <p className="auth-registration-note">
            Accounts are created by your Tattva Forensics administrator.
            Public registration is disabled.
          </p>
        </section>
      </div>
      <footer className="auth-footer">
        <span>© TATTVA FORENSICS</span>
        <span>SECURE DIGITAL INVESTIGATION WORKSPACE</span>
      </footer>
    </main>
  );
}

export function RequiredPasswordChangePage({ username, onSubmit, onLogout }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }
    if (newPassword.length < 8 || newPassword.length > 15) {
      setError("The new password must contain 8 to 15 characters.");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(currentPassword, newPassword);
    } catch (changeError) {
      setError(changeError.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <AuthBrand />
      <section className="auth-panel auth-panel-compact">
        <div className="brand-logo auth-logo">TF</div>
        <p className="auth-kicker">ACCOUNT SECURITY</p>
        <h1>Change your password</h1>
        <p className="auth-description">
          {username} must choose a new password before accessing assigned cases.
          Use 8 to 15 characters. Changing it signs out all active sessions.
        </p>

        {error && (
          <p className="auth-message auth-error" role="alert">
            {error}
          </p>
        )}
        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="current-password">Current password</label>
          <input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
            disabled={submitting}
          />
          <label htmlFor="new-password">New password</label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={256}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            required
            disabled={submitting}
          />
          <label htmlFor="confirm-password">Confirm new password</label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={256}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            disabled={submitting}
          />
          <div className="auth-form-actions">
            <button
              className="auth-secondary"
              type="button"
              onClick={onLogout}
              disabled={submitting}
            >
              Sign out
            </button>
            <button
              className="auth-submit"
              type="submit"
              disabled={
                submitting ||
                !currentPassword ||
                !newPassword ||
                !confirmPassword
              }
            >
              {submitting ? "Updating..." : "Change password"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
