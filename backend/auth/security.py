from datetime import datetime, timedelta, timezone
import hmac
import os
import secrets
from urllib.parse import urlsplit

from fastapi import Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware


SESSION_COOKIE_NAME = "tattva_session"
CSRF_COOKIE_NAME = "tattva_csrf"
CSRF_HEADER_NAME = "x-csrf-token"
_STATE_CHANGING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
_LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}


def _session_time(value):
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _cookie_is_secure(request):
    return request.app.state.environment == "production"


def get_current_user(request: Request):
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")

    store = request.app.state.investigation_store
    session = store.get_session_by_token(token)
    if session is None or session["revoked_at"] is not None:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    user = session["user"]
    if not user["is_active"]:
        store.revoke_session(session["session_id"])
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    try:
        expired = _session_time(session["expires_at"]) <= datetime.now(timezone.utc)
    except (TypeError, ValueError):
        expired = True
    if expired:
        store.revoke_session(session["session_id"])
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    if user["password_change_required"] and request.url.path not in {
        "/auth/me",
        "/auth/logout",
        "/auth/password",
    }:
        raise HTTPException(
            status_code=403,
            detail="Password change required before continuing",
        )

    request.state.current_user = user
    try:
        last_seen = _session_time(session["last_seen_at"])
    except (TypeError, ValueError):
        last_seen = datetime.min.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) - last_seen >= timedelta(minutes=1):
        store.touch_session(session["session_id"])
    return user


def require_roles(*roles):
    def dependency(
        user=Depends(get_current_user),
    ):
        if user["role"] != "ADMIN" and user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user

    return dependency


def authorize_investigation(request, user, investigation_id, permission="read"):
    if user["role"] == "ADMIN":
        return

    if not has_investigation_assignment(request, user, investigation_id):
        raise HTTPException(status_code=404, detail="Investigation not found")

    allowed_roles = {
        "read": {"LEAD_INVESTIGATOR", "INVESTIGATOR", "VIEWER"},
        "update": {"LEAD_INVESTIGATOR"},
        "upload": {"LEAD_INVESTIGATOR", "INVESTIGATOR"},
        "assign": {"LEAD_INVESTIGATOR"},
        "simulate": {"LEAD_INVESTIGATOR", "INVESTIGATOR"},
    }
    if permission not in allowed_roles:
        raise ValueError(f"Unknown investigation permission: {permission}")
    if user["role"] not in allowed_roles[permission]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")


def has_investigation_assignment(request, user, investigation_id):
    assignments = request.app.state.investigation_store.list_assignments(
        investigation_id=investigation_id,
        user_id=user["user_id"],
    )
    return any(item["revoked_at"] is None for item in assignments)


def require_investigation_access(permission="read"):
    def dependency(
        investigation_id: str,
        request: Request,
        user=Depends(get_current_user),
    ):
        authorize_investigation(request, user, investigation_id, permission)
        return user

    return dependency


def issue_csrf_token():
    return secrets.token_urlsafe(32)


def set_csrf_cookie(response, request, csrf_token):
    response.set_cookie(
        CSRF_COOKIE_NAME,
        csrf_token,
        httponly=True,
        secure=_cookie_is_secure(request),
        samesite="none",
        path="/",
    )


def set_session_cookie(response, request, token, max_age):
    response.set_cookie(
        SESSION_COOKIE_NAME,
        token,
        httponly=True,
        secure=_cookie_is_secure(request),
        samesite="none",
        path="/",
        max_age=max_age,
    )


def clear_auth_cookies(response, request):
    secure = _cookie_is_secure(request)
    response.delete_cookie(
        SESSION_COOKIE_NAME,
        path="/",
        secure=secure,
        httponly=True,
        samesite="none",
    )
    response.delete_cookie(
        CSRF_COOKIE_NAME,
        path="/",
        secure=secure,
        httponly=True,
        samesite="none",
    )


def configure_http_security(app):
    environment = os.environ.get("TATTVA_ENV", "production").strip().lower()
    if environment not in {"development", "production", "test"}:
        raise RuntimeError("TATTVA_ENV must be development, test, or production")

    configured_origins = os.environ.get("TATTVA_CORS_ORIGINS")

    if configured_origins:
        origins = [
            origin.strip().rstrip("/")
            for origin in configured_origins.split(",")
            if origin.strip()
        ]
    
    elif environment == "development":
        origins = [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ]
    
    elif environment == "test":
        origins = [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ]
    
    else:
        raise RuntimeError(
            "TATTVA_CORS_ORIGINS must be configured in production."
        )
    if any("*" in origin for origin in origins):
        raise RuntimeError(
            "TATTVA_CORS_ORIGINS must contain explicit origins, not '*'."
        )
    for origin in origins:
        parsed_origin = urlsplit(origin)
        if (
            parsed_origin.scheme not in {"http", "https"}
            or not parsed_origin.netloc
            or parsed_origin.path
            or parsed_origin.query
            or parsed_origin.fragment
            or parsed_origin.username
            or parsed_origin.password
        ):
            raise RuntimeError(
                "TATTVA_CORS_ORIGINS entries must be HTTP(S) origins only."
            )

    try:
        session_ttl = int(os.environ.get("TATTVA_SESSION_TTL_SECONDS", "28800"))
    except ValueError as error:
        raise RuntimeError("TATTVA_SESSION_TTL_SECONDS must be an integer") from error
    if session_ttl < 60 or session_ttl > 30 * 24 * 60 * 60:
        raise RuntimeError(
            "TATTVA_SESSION_TTL_SECONDS must be between 60 seconds and 30 days"
        )

    app.state.environment = environment
    app.state.cors_origins = tuple(origins)
    app.state.session_ttl_seconds = session_ttl

    @app.middleware("http")
    async def enforce_csrf(request, call_next):
        if request.method.upper() in _STATE_CHANGING_METHODS:
            cookie_token = request.cookies.get(CSRF_COOKIE_NAME, "")
            header_token = request.headers.get(CSRF_HEADER_NAME, "")
            origin = request.headers.get("origin")
            if (
                not cookie_token
                or not header_token
                or not cookie_token.isascii()
                or not header_token.isascii()
                or not hmac.compare_digest(cookie_token, header_token)
                or not origin
                or origin not in app.state.cors_origins
            ):
                return JSONResponse(
                    status_code=403,
                    content={"detail": "CSRF validation failed"},
                    headers={"Cache-Control": "no-store"},
                )
        response = await call_next(request)
        if request.url.path.startswith(
            ("/auth", "/users", "/investigations", "/api/simulations")
        ):
            response.headers["Cache-Control"] = "no-store"
        return response

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "X-CSRF-Token"],
    )
