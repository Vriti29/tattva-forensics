const API_BASE_URL = "";
const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const AUTH_ENDPOINTS_WITHOUT_SESSION = new Set([
  "/auth/csrf",
  "/auth/login",
  "/auth/me",
]);

let csrfToken = "";

export function setCsrfToken(token) {
  csrfToken = token || "";
}

export async function refreshCsrfToken() {
  const response = await fetch(`${API_BASE_URL}/auth/csrf`, {
    credentials: "include",
    cache: "no-store",
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.csrf_token) {
    const error = new Error(
      data?.detail || "Could not initialize secure session protection."
    );
    error.status = response.status;
    throw error;
  }
  setCsrfToken(data.csrf_token);
  return csrfToken;
}

function notifySessionExpired(url) {
  const path = url.split("?")[0];
  if (
    typeof window !== "undefined" &&
    !AUTH_ENDPOINTS_WITHOUT_SESSION.has(path)
  ) {
    window.dispatchEvent(new CustomEvent("tattva:session-expired"));
  }
}

export async function requestJson(url, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const headers = new Headers(options.headers || {});
  if (STATE_CHANGING_METHODS.has(method)) {
    if (!csrfToken) {
      await refreshCsrfToken();
    }
    headers.set("X-CSRF-Token", csrfToken);
  }

  const response = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers,
    credentials: "include",
    cache: options.cache || "no-store",
  });
  const data = response.status === 204
    ? null
    : await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401) {
      notifySessionExpired(url);
    }
    const detail = data?.detail;
    const message = Array.isArray(detail)
      ? detail.map((item) => item.msg).join(", ")
      : detail;
    const error = new Error(
      message || `Request failed with status ${response.status}.`
    );
    error.status = response.status;
    throw error;
  }

  return data;
}

export function formatDate(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
