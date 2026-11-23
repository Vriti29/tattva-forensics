import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import (
    FastAPI,
    File,
    Form,
    Depends,
    HTTPException,
    Request,
    UploadFile,
)
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, Field

from backend.api.simulation_setup import install_simulation_api
from backend.api.auth_routes import router as auth_router
from backend.auth.security import (
    configure_http_security,
    get_current_user,
    require_investigation_access,
    require_roles,
)
from backend.investigation_store import InvestigationStore
from backend.normalization.timestamp_handler import sort_records_by_timestamp
from backend.pipeline import analyze_evidence_records, process_evidence_file
from backend.simulation.forensic_adapter import (
    analyze_evidence as run_forensic_analysis
)


ALLOWED_SOURCES = {"authentication", "file", "network", "archive"}
ALLOWED_SUFFIXES = {".log", ".txt", ".csv", ".json"}
MAX_FILE_SIZE = 10 * 1024 * 1024
UPLOAD_CHUNK_SIZE = 1024 * 1024


class CreateInvestigationRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=5000)
    status: str = Field(default="open", min_length=1, max_length=50)


class UpdateInvestigationRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    status: str | None = Field(default=None, min_length=1, max_length=50)


def _now():
    return datetime.now(timezone.utc).isoformat()


def _clean_filename(filename):
    name = (filename or "").replace("\\", "/").rsplit("/", 1)[-1]
    if not name or name in {".", ".."}:
        raise HTTPException(status_code=400, detail="Invalid evidence filename")
    return name


def _validate_source(source_type, filename):
    if source_type not in ALLOWED_SOURCES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid source type. Choose from {sorted(ALLOWED_SOURCES)}"
        )

    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise HTTPException(status_code=400, detail="Unsupported file format")
    return suffix


async def _save_upload(upload, evidence_directory, investigation_id, source_type):
    staging_path = None
    try:
        filename = _clean_filename(upload.filename)
        suffix = _validate_source(source_type, filename)
        file_id = uuid4().hex
        target_directory = evidence_directory / investigation_id
        target_directory.mkdir(parents=True, exist_ok=True)
        target_path = target_directory / f"{file_id}{suffix}"
        staging_path = target_directory / f".{file_id}.upload"
        size = 0

        with staging_path.open("wb") as saved_file:
            while chunk := await upload.read(UPLOAD_CHUNK_SIZE):
                size += len(chunk)
                if size > MAX_FILE_SIZE:
                    raise HTTPException(
                        status_code=413,
                        detail="File exceeds 10 MB limit"
                    )
                saved_file.write(chunk)

        os.replace(staging_path, target_path)
        return file_id, filename, target_path
    except Exception:
        if staging_path and staging_path.exists():
            staging_path.unlink()
        raise
    finally:
        await upload.close()


def _remove_file(path):
    if path and path.exists():
        path.unlink()


def _combined_analysis(investigation_id, file_analyses, baseline_analysis_id):
    records = [
        record
        for result in file_analyses
        for record in result["evidence_records"]
    ]
    latest = file_analyses[-1]

    def combine_counts(section):
        entries = [result[section] for result in file_analyses]
        return {
            "total_records": sum(item["total_records"] for item in entries),
            "successful_records": sum(
                item["successful_records"] for item in entries
            ),
            "failed_records": sum(item["failed_records"] for item in entries),
            "errors": [
                error
                for item in entries
                for error in item.get("errors", [])
            ],
        }

    return {
        "source_id": latest["source_id"],
        "metadata": latest["metadata"],
        "ingestion": combine_counts("ingestion"),
        "normalization": combine_counts("normalization"),
        **analyze_evidence_records(records),
        "investigation_id": investigation_id,
        "baseline_analysis_id": baseline_analysis_id,
    }


def _load_persisted_state(app):
    store = app.state.investigation_store
    for item in store.list_investigations():
        detail = store.get_investigation(item["investigation_id"])
        analysis = detail["analysis"]
        if analysis is None:
            continue

        app.state.investigations[item["investigation_id"]] = analysis
        app.state.simulation_evidence_store[item["investigation_id"]] = (
            analysis["evidence_records"]
        )
        if detail["baseline_analysis_id"] and detail["baseline_analysis"]:
            app.state.baseline_analysis_store[
                detail["baseline_analysis_id"]
            ] = detail["baseline_analysis"]


def create_app(data_directory=None):
    configured_directory = data_directory or os.environ.get(
        "TATTVA_DATA_DIR",
        str(Path(__file__).resolve().parents[1] / "data")
    )
    store = InvestigationStore(configured_directory)

    application = FastAPI(
        title="Tattva Forensics API",
        description="AI-assisted digital evidence analysis and correlation",
        version="1.0.0"
    )
    application.state.investigation_store = store
    application.state.investigations = {}
    application.state.simulation_evidence_store = {}
    application.state.baseline_analysis_store = {}
    application.state.investigation_lock = threading.RLock()

    configure_http_security(application)
    application.include_router(auth_router)

    install_simulation_api(
        app=application,
        analysis_function=run_forensic_analysis,
        evidence_store=application.state.simulation_evidence_store,
        baseline_store=application.state.baseline_analysis_store
    )
    _load_persisted_state(application)

    @application.get("/")
    def home():
        return {"message": "Tattva Forensics API is running"}

    @application.get("/health")
    def health_check():
        return {"status": "healthy"}

    @application.post("/investigations", status_code=201)
    def create_investigation(
        data: CreateInvestigationRequest,
        request: Request,
        actor=Depends(require_roles("ADMIN")),
    ):
        name = data.name.strip()
        status = data.status.strip()
        if not name or not status:
            raise HTTPException(
                status_code=422,
                detail="Investigation name and status cannot be blank"
            )

        investigation_id = f"INV-{uuid4().hex[:10].upper()}"
        try:
            investigation = request.app.state.investigation_store.create_investigation(
                investigation_id,
                name,
                data.description,
                _now(),
                status,
            )
            request.app.state.investigation_store.append_audit_event(
                action="INVESTIGATION_CREATED",
                actor_user_id=actor["user_id"],
                investigation_id=investigation_id,
                metadata={"name": name},
            )
            return investigation
        except Exception as error:
            raise HTTPException(
                status_code=500,
                detail=f"Could not create investigation: {error}"
            ) from error

    @application.get("/investigations")
    def list_investigations(
        request: Request,
        user=Depends(get_current_user),
    ):
        store = request.app.state.investigation_store
        investigations = store.list_investigations()
        if user["role"] == "ADMIN":
            return investigations
        assigned_ids = {
            assignment["investigation_id"]
            for assignment in store.list_assignments(user_id=user["user_id"])
            if assignment["revoked_at"] is None
        }
        return [
            item
            for item in investigations
            if item["investigation_id"] in assigned_ids
        ]

    @application.get("/investigations/{investigation_id}")
    def get_investigation(
        investigation_id: str,
        request: Request,
        _user=Depends(require_investigation_access("read")),
    ):
        detail = request.app.state.investigation_store.get_investigation(
            investigation_id
        )
        if detail is None:
            raise HTTPException(status_code=404, detail="Investigation not found")
        return detail

    @application.patch("/investigations/{investigation_id}")
    def update_investigation(
        investigation_id: str,
        data: UpdateInvestigationRequest,
        request: Request,
        actor=Depends(require_investigation_access("update")),
    ):
        fields = data.model_dump(exclude_unset=True)
        if "name" in fields:
            if fields["name"] is None or not fields["name"].strip():
                raise HTTPException(
                    status_code=422,
                    detail="Investigation name cannot be blank"
                )
            fields["name"] = fields["name"].strip()
        if "description" in fields and fields["description"] is None:
            fields["description"] = ""
        if "status" in fields:
            if fields["status"] is None or not fields["status"].strip():
                raise HTTPException(
                    status_code=422,
                    detail="Investigation status cannot be blank"
                )
            fields["status"] = fields["status"].strip()

        updated = request.app.state.investigation_store.update_investigation(
            investigation_id,
            fields,
            _now(),
        )
        if updated is None:
            raise HTTPException(status_code=404, detail="Investigation not found")
        request.app.state.investigation_store.append_audit_event(
            action="INVESTIGATION_UPDATED",
            actor_user_id=actor["user_id"],
            investigation_id=investigation_id,
            metadata={"changed_fields": sorted(fields)},
        )
        return updated

    async def ingest_evidence(
        investigation_id,
        upload,
        source_type,
        request,
        create_new=False,
        uploader_user_id=None,
    ):
        store = request.app.state.investigation_store
        if not create_new and store.get_investigation(investigation_id) is None:
            await upload.close()
            raise HTTPException(status_code=404, detail="Investigation not found")

        file_id, filename, file_path = await _save_upload(
            upload,
            store.evidence_directory,
            investigation_id,
            source_type,
        )

        created_investigation = False
        try:
            with request.app.state.investigation_lock:
                if create_new:
                    name = Path(filename).stem.strip() or "Investigation"
                    store.create_investigation(
                        investigation_id,
                        name,
                        "",
                        _now(),
                        "open",
                    )
                    created_investigation = True
                    prior_analyses = []
                else:
                    if store.get_investigation(investigation_id) is None:
                        raise HTTPException(
                            status_code=404,
                            detail="Investigation not found"
                        )
                    prior_analyses = store.get_evidence_analyses(
                        investigation_id
                    )

                file_analysis = jsonable_encoder(
                    process_evidence_file(
                        file_path,
                        source_type,
                        original_filename=filename,
                        evidence_id_prefix=(
                            None if create_new else f"EV-{file_id}"
                        ),
                    )
                )
                all_file_analyses = [*prior_analyses, file_analysis]
                baseline_analysis_id = (
                    f"ANL-{uuid4().hex[:10].upper()}"
                )
                combined = jsonable_encoder(
                    _combined_analysis(
                        investigation_id,
                        all_file_analyses,
                        baseline_analysis_id,
                    )
                )
                baseline_analysis = jsonable_encoder(
                    run_forensic_analysis(combined["evidence_records"])
                )

                store.add_evidence(
                    investigation_id,
                    file_id,
                    file_analysis["source_id"],
                    filename,
                    file_analysis["metadata"],
                    file_analysis,
                    combined,
                    baseline_analysis_id,
                    baseline_analysis,
                    _now(),
                    uploader_user_id=uploader_user_id,
                )
                request.app.state.investigations[investigation_id] = combined
                request.app.state.simulation_evidence_store[
                    investigation_id
                ] = combined["evidence_records"]
                request.app.state.baseline_analysis_store[
                    baseline_analysis_id
                ] = baseline_analysis

            return {
                "investigation_id": investigation_id,
                "evidence_file": {
                    **file_analysis["metadata"],
                    "source_id": file_analysis["source_id"],
                },
                "baseline_analysis_id": baseline_analysis_id,
                "analysis": combined,
            }
        except HTTPException:
            _remove_file(file_path)
            if created_investigation:
                store.delete_investigation(investigation_id)
            raise
        except (ValueError, FileNotFoundError) as error:
            _remove_file(file_path)
            if created_investigation:
                store.delete_investigation(investigation_id)
            raise HTTPException(status_code=400, detail=str(error)) from error
        except Exception as error:
            _remove_file(file_path)
            if created_investigation:
                store.delete_investigation(investigation_id)
            raise HTTPException(
                status_code=500,
                detail=f"Evidence processing failed: {error}"
            ) from error

    @application.post("/investigations/{investigation_id}/evidence")
    async def add_investigation_evidence(
        investigation_id: str,
        request: Request,
        file: UploadFile = File(...),
        source_type: str = Form(...),
        user=Depends(require_investigation_access("upload")),
    ):
        return await ingest_evidence(
            investigation_id,
            file,
            source_type,
            request,
            uploader_user_id=user["user_id"],
        )

    @application.post("/analyze")
    async def analyze_evidence(
        request: Request,
        file: UploadFile = File(...),
        source_type: str = Form(...),
        user=Depends(require_roles("ADMIN")),
    ):
        investigation_id = f"INV-{uuid4().hex[:10].upper()}"
        result = await ingest_evidence(
            investigation_id,
            file,
            source_type,
            request,
            create_new=True,
            uploader_user_id=user["user_id"],
        )
        analysis = result["analysis"]
        return {
            "source_id": analysis["source_id"],
            "metadata": analysis["metadata"],
            "ingestion": analysis["ingestion"],
            "normalization": analysis["normalization"],
            "evidence_records": analysis["evidence_records"],
            "detection": analysis["detection"],
            "anomaly_detection": analysis["anomaly_detection"],
            "correlation": analysis["correlation"],
            "investigation_id": investigation_id,
            "baseline_analysis_id": result["baseline_analysis_id"],
        }

    def get_cached_analysis(investigation_id, request):
        result = request.app.state.investigations.get(investigation_id)
        if result is None:
            raise HTTPException(status_code=404, detail="Investigation not found")
        return result

    @application.get("/investigations/{investigation_id}/summary")
    def get_investigation_summary(
        investigation_id: str,
        request: Request,
        _user=Depends(require_investigation_access("read")),
    ):
        result = get_cached_analysis(investigation_id, request)
        findings = result["detection"]["findings"]
        anomalies = result["anomaly_detection"]["anomalies"]
        records = result["evidence_records"]
        severity_counts = {
            level: sum(1 for finding in findings if finding["severity"] == level)
            for level in ["HIGH", "MEDIUM", "LOW"]
        }
        return {
            "investigation_id": investigation_id,
            "source_id": result["source_id"],
            "filename": result["metadata"]["filename"],
            "total_evidence": len(records),
            "total_findings": len(findings),
            "total_anomalies": len(anomalies),
            "severity_breakdown": severity_counts,
            "integrity_status": result["metadata"]["integrity_status"]
        }

    @application.get("/investigations/{investigation_id}/findings")
    def get_investigation_findings(
        investigation_id: str,
        request: Request,
        _user=Depends(require_investigation_access("read")),
    ):
        return get_cached_analysis(investigation_id, request)["detection"]

    @application.get("/investigations/{investigation_id}/anomalies")
    def get_investigation_anomalies(
        investigation_id: str,
        request: Request,
        _user=Depends(require_investigation_access("read")),
    ):
        return get_cached_analysis(investigation_id, request)["anomaly_detection"]

    @application.get("/investigations/{investigation_id}/timeline")
    def get_investigation_timeline(
        investigation_id: str,
        request: Request,
        _user=Depends(require_investigation_access("read")),
    ):
        result = get_cached_analysis(investigation_id, request)
        try:
            timeline = sort_records_by_timestamp(result["evidence_records"])
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        return {
            "investigation_id": investigation_id,
            "total_events": len(timeline),
            "timeline": timeline
        }

    @application.get("/investigations/{investigation_id}/graph")
    def get_investigation_graph(
        investigation_id: str,
        request: Request,
        _user=Depends(require_investigation_access("read")),
    ):
        return get_cached_analysis(investigation_id, request)["correlation"]["graph"]

    return application


app = create_app()
INVESTIGATIONS = app.state.investigations
SIMULATION_EVIDENCE_STORE = app.state.simulation_evidence_store
BASELINE_ANALYSIS_STORE = app.state.baseline_analysis_store
