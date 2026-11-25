from datetime import datetime, timedelta, timezone
import secrets
import sqlite3
from typing import Literal

from argon2.exceptions import InvalidHashError
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from backend.auth.passwords import hash_password, verify_password
from backend.auth.security import (
    SESSION_COOKIE_NAME,
    authorize_investigation,
    clear_auth_cookies,
    get_current_user,
    issue_csrf_token,
    require_roles,
    set_csrf_cookie,
    set_session_cookie,
)


Role = Literal[
    "ADMIN",
    "LEAD_INVESTIGATOR",
    "INVESTIGATOR",
    "VIEWER",
]
SignInMode = Literal["investigator", "administrator"]
INVESTIGATOR_SIGN_IN_ROLES = {
    "LEAD_INVESTIGATOR",
    "INVESTIGATOR",
    "VIEWER",
}
_DUMMY_PASSWORD_HASH = hash_password(secrets.token_urlsafe(9))

router = APIRouter(tags=["Authentication and access management"])


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=320)
    password: str = Field(min_length=1, max_length=1024)
    sign_in_as: SignInMode | None = None


class CreateUserRequest(BaseModel):
    username: str = Field(min_length=1, max_length=320)
    password: str = Field(min_length=8, max_length=15)
    role: Role


class UpdateUserRequest(BaseModel):
    role: Role | None = None
    is_active: bool | None = None


class PasswordRequest(BaseModel):
    password: str = Field(min_length=8, max_length=15)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=1024)
    new_password: str = Field(min_length=8, max_length=15)


class AssignmentRequest(BaseModel):
    user_id: str = Field(min_length=1, max_length=128)
    reason: str = Field(default="", max_length=2000)


def _now():
    return datetime.now(timezone.utc)


def _iso(value):
    return value.isoformat()


def _audit(
    request,
    actor_user_id,
    action,
    target_id=None,
    investigation_id=None,
    metadata=None,
):
    request.app.state.investigation_store.append_audit_event(
        action=action,
        actor_user_id=actor_user_id,
        target_id=target_id,
        investigation_id=investigation_id,
        metadata=metadata or {},
    )


@router.get("/auth/csrf")
def get_csrf_token(request: Request, response: Response):
    token = issue_csrf_token()
    set_csrf_cookie(response, request, token)
    return {"csrf_token": token}


@router.post("/auth/login")
def login(data: LoginRequest, request: Request, response: Response):
    store = request.app.state.investigation_store
    source = request.client.host if request.client is not None else "unknown"
    retry_after = store.begin_login_attempt(data.username, source)
    if retry_after is not None:
        raise HTTPException(
            status_code=429,
            detail="Too many login attempts. Try again later.",
            headers={"Retry-After": str(retry_after)},
        )

    try:
        auth_record = store.get_user_auth_record(data.username)
    except ValueError:
        auth_record = None
    password_hash = (
        auth_record["password_hash"]
        if auth_record is not None
        else _DUMMY_PASSWORD_HASH
    )
    try:
        is_valid_password = verify_password(data.password, password_hash)
    except InvalidHashError:
        verify_password(data.password, _DUMMY_PASSWORD_HASH)
        is_valid_password = False

    if (
        auth_record is None
        or not is_valid_password
        or not auth_record["user"]["is_active"]
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid username or password",
        )

    if data.sign_in_as is not None:
        user_role = auth_record["user"]["role"]
        allowed_roles = (
            {"ADMIN"}
            if data.sign_in_as == "administrator"
            else INVESTIGATOR_SIGN_IN_ROLES
        )
        if user_role not in allowed_roles:
            sign_in_area = (
                "Administrator"
                if data.sign_in_as == "administrator"
                else "Investigator"
            )
            raise HTTPException(
                status_code=403,
                detail=(
                    f"This account is not authorized for "
                    f"{sign_in_area} sign-in."
                ),
            )

    now = _now()
    expires_at = now + timedelta(
        seconds=request.app.state.session_ttl_seconds
    )
    token = secrets.token_urlsafe(32)
    try:
        session_id = store.create_session(
            auth_record["user"]["user_id"],
            token,
            _iso(expires_at),
            created_at=_iso(now),
            expected_password_hash=auth_record["password_hash"],
        )
    except ValueError as error:
        raise HTTPException(
            status_code=401,
            detail="Invalid username or password",
        ) from error
    store.clear_login_attempts(data.username, source)
    csrf_token = issue_csrf_token()
    set_session_cookie(
        response,
        request,
        token,
        request.app.state.session_ttl_seconds,
    )
    set_csrf_cookie(response, request, csrf_token)
    _audit(
        request,
        auth_record["user"]["user_id"],
        "LOGIN_SUCCEEDED",
        target_id=session_id,
    )
    return {
        "user": auth_record["user"],
        "csrf_token": csrf_token,
        "expires_at": _iso(expires_at),
    }


@router.post("/auth/logout", status_code=204)
def logout(request: Request, response: Response):
    token = request.cookies.get(SESSION_COOKIE_NAME)
    store = request.app.state.investigation_store
    if token:
        session = store.get_session_by_token(token)
        if session is not None and session["revoked_at"] is None:
            store.revoke_session(session["session_id"])
            _audit(
                request,
                session["user_id"],
                "LOGOUT",
                target_id=session["session_id"],
            )
    clear_auth_cookies(response, request)
    response.status_code = 204
    return response


@router.get("/auth/me")
def get_me(user=Depends(get_current_user)):
    return user


@router.post("/auth/password", status_code=204)
def change_own_password(
    data: ChangePasswordRequest,
    request: Request,
    response: Response,
    user=Depends(get_current_user),
):
    auth_record = request.app.state.investigation_store.get_user_auth_record(
        user["username"]
    )
    try:
        valid = verify_password(
            data.current_password,
            auth_record["password_hash"],
        )
    except InvalidHashError:
        valid = False
    if not valid:
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if verify_password(data.new_password, auth_record["password_hash"]):
        raise HTTPException(
            status_code=400,
            detail="New password must differ from the current password",
        )

    request.app.state.investigation_store.update_user_password(
        user["user_id"],
        hash_password(data.new_password),
        password_change_required=False,
    )
    _audit(
        request,
        user["user_id"],
        "PASSWORD_CHANGED",
        target_id=user["user_id"],
    )
    clear_auth_cookies(response, request)
    response.status_code = 204
    return response


@router.get("/users")
def list_users(
    request: Request,
    _admin=Depends(require_roles("ADMIN")),
):
    return request.app.state.investigation_store.list_users()


@router.post("/users", status_code=201)
def create_user(
    data: CreateUserRequest,
    request: Request,
    admin=Depends(require_roles("ADMIN")),
):
    try:
        user = request.app.state.investigation_store.create_user(
            data.username,
            hash_password(data.password),
            data.role,
            created_by=admin["user_id"],
            password_change_required=True,
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except sqlite3.IntegrityError as error:
        if "UNIQUE constraint failed" in str(error):
            raise HTTPException(
                status_code=409,
                detail="Username or email is already in use",
            ) from error
        raise

    _audit(
        request,
        admin["user_id"],
        "USER_CREATED",
        target_id=user["user_id"],
        metadata={"role": user["role"]},
    )
    return user


@router.get("/users/{user_id}")
def get_user(
    user_id: str,
    request: Request,
    _admin=Depends(require_roles("ADMIN")),
):
    user = request.app.state.investigation_store.get_user(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.patch("/users/{user_id}")
def update_user(
    user_id: str,
    data: UpdateUserRequest,
    request: Request,
    admin=Depends(require_roles("ADMIN")),
):
    fields = data.model_dump(exclude_unset=True, exclude_none=True)
    if not fields:
        raise HTTPException(status_code=422, detail="No account changes provided")
    try:
        user = request.app.state.investigation_store.update_user(
            user_id,
            role=fields.get("role"),
            is_active=fields.get("is_active"),
        )
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    _audit(
        request,
        admin["user_id"],
        "USER_UPDATED",
        target_id=user_id,
        metadata=fields,
    )
    return user


@router.post("/users/{user_id}/password-reset", status_code=204)
def reset_user_password(
    user_id: str,
    data: PasswordRequest,
    request: Request,
    _admin=Depends(require_roles("ADMIN")),
):
    updated = request.app.state.investigation_store.update_user_password(
        user_id,
        hash_password(data.password),
        password_change_required=True,
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="User not found")
    _audit(
        request,
        _admin["user_id"],
        "USER_PASSWORD_RESET",
        target_id=user_id,
    )
    return Response(status_code=204)


@router.get("/investigations/{investigation_id}/assignments")
def list_case_assignments(
    investigation_id: str,
    request: Request,
    user=Depends(get_current_user),
):
    authorize_investigation(request, user, investigation_id, "assign")
    if request.app.state.investigation_store.get_investigation(
        investigation_id
    ) is None:
        raise HTTPException(status_code=404, detail="Investigation not found")
    return request.app.state.investigation_store.list_assignments(
        investigation_id=investigation_id
    )


@router.post(
    "/investigations/{investigation_id}/assignments",
    status_code=201,
)
def assign_user_to_case(
    investigation_id: str,
    data: AssignmentRequest,
    request: Request,
    actor=Depends(get_current_user),
):
    authorize_investigation(request, actor, investigation_id, "assign")
    store = request.app.state.investigation_store
    if store.get_investigation(investigation_id) is None:
        raise HTTPException(status_code=404, detail="Investigation not found")
    target = store.get_user(data.user_id)
    if target is None or not target["is_active"]:
        raise HTTPException(status_code=404, detail="Active user not found")
    try:
        assignment = store.create_assignment(
            investigation_id,
            data.user_id,
            actor["user_id"],
            reason=data.reason,
        )
    except sqlite3.IntegrityError as error:
        if "UNIQUE constraint failed" in str(error):
            raise HTTPException(
                status_code=409,
                detail="User is already assigned to this investigation",
            ) from error
        raise
    _audit(
        request,
        actor["user_id"],
        "INVESTIGATION_ASSIGNED",
        target_id=assignment["assignment_id"],
        investigation_id=investigation_id,
        metadata={"user_id": data.user_id, "reason": data.reason},
    )
    return assignment


@router.delete(
    "/investigations/{investigation_id}/assignments/{assignment_id}",
    status_code=204,
)
def revoke_case_assignment(
    investigation_id: str,
    assignment_id: str,
    request: Request,
    actor=Depends(get_current_user),
):
    authorize_investigation(request, actor, investigation_id, "assign")
    store = request.app.state.investigation_store
    assignment = store.get_assignment(assignment_id)
    if (
        assignment is None
        or assignment["investigation_id"] != investigation_id
    ):
        raise HTTPException(status_code=404, detail="Assignment not found")
    revoked = store.revoke_assignment(assignment_id)
    if revoked is None:
        raise HTTPException(status_code=404, detail="Assignment not found")
    _audit(
        request,
        actor["user_id"],
        "INVESTIGATION_ASSIGNMENT_REVOKED",
        target_id=assignment_id,
        investigation_id=investigation_id,
        metadata={"user_id": assignment["user_id"]},
    )
    return Response(status_code=204)
