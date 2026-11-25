import { useState } from "react";

export function AuthLoadingPage({ message = "Restoring your secure session..." }) {
  return (
    <main className="auth-page">
      <section className="auth-panel management-card" aria-live="polite">
        <div className="brand-logo auth-logo">TF</div>
        <h1>Tattva Forensics</h1>
        <p className="management-state">{message}</p>
      </section>
    </main>
  );
}

export function LoginPage({ onLogin, notice, connectionError }) {
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
      <section className="auth-panel management-card">
        <div className="brand-logo auth-logo">TF</div>
        <span className="eyebrow">SECURE INVESTIGATOR ACCESS</span>
        <h1>Sign in</h1>
        <p className="auth-description">
          Use credentials provisioned by your Tattva Forensics administrator.
          Public account registration is disabled.
        </p>

        {notice && (
          <p className="management-message success-message" role="status">
            {notice}
          </p>
        )}
        {(error || connectionError) && (
          <p className="management-message error-message" role="alert">
            {error || connectionError}
          </p>
        )}

        <form className="management-form" onSubmit={handleSubmit}>
          <label htmlFor="login-username">Username or email</label>
          <input
            id="login-username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            maxLength={320}
            required
            disabled={submitting}
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
          />
          <button
            className="primary-button"
            type="submit"
            disabled={submitting || !username.trim() || !password}
          >
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
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
      <section className="auth-panel management-card">
        <div className="brand-logo auth-logo">TF</div>
        <span className="eyebrow">ACCOUNT SECURITY</span>
        <h1>Change your password</h1>
        <p className="auth-description">
          {username} must choose a new password before accessing assigned cases.
          Use 8 to 15 characters. Changing it signs out all active sessions.
        </p>

        {error && (
          <p className="management-message error-message" role="alert">
            {error}
          </p>
        )}
        <form className="management-form" onSubmit={handleSubmit}>
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
          <div className="management-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={onLogout}
              disabled={submitting}
            >
              Sign out
            </button>
            <button
              className="primary-button"
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
