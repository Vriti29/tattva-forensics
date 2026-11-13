import os
import tempfile
from pathlib import Path
from uuid import uuid4
from fastapi import FastAPI, UploadFile, File, Form, HTTPException

from backend.pipeline import process_evidence_file

app = FastAPI(
    title="Tattva Forensics API",
    description="AI-assisted digital evidence analysis and correlation",
    version="1.0.0"
)
INVESTIGATIONS = {}
ALLOWED_SOURCES = {"authentication", "file", "network", "archive"}

@app.get("/")
def home():
    return {"message": "Tattva Forensics API is running"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}

@app.post("/analyze")
async def analyze_evidence(
    file: UploadFile = File(...),
    source_type: str = Form(...)
):
    if source_type not in ALLOWED_SOURCES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid source type. Choose from {sorted(ALLOWED_SOURCES)}"
        )

    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".log", ".txt", ".csv", ".json"}:
        raise HTTPException(status_code=400, detail="Unsupported file format")

    temp_path = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_path = temp_file.name
            size = 0

            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > 10 * 1024 * 1024:
                    raise HTTPException(status_code=413, detail="File exceeds 10 MB limit")
                temp_file.write(chunk)

        result = process_evidence_file(temp_path, source_type)
        investigation_id = f"INV-{uuid4().hex[:10].upper()}"

        result["investigation_id"] = investigation_id
        INVESTIGATIONS[investigation_id] = result

        return result
    
    except HTTPException:
        raise
    except (ValueError, FileNotFoundError) as error:
        raise HTTPException(status_code=400, detail=str(error))
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Evidence processing failed: {error}")
    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)
        await file.close()

@app.get("/investigations/{investigation_id}/summary")
def get_investigation_summary(investigation_id: str):
    result = INVESTIGATIONS.get(investigation_id)
    if not result:
        raise HTTPException(status_code=404, detail="Investigation not found")

    findings = result["detection"]["findings"]
    anomalies = result["anomaly_detection"]["anomalies"]
    records = result["evidence_records"]

    severity_counts = {
        level: sum(1 for f in findings if f["severity"] == level)
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

@app.get("/investigations/{investigation_id}/findings")
def get_investigation_findings(investigation_id: str):
    result = INVESTIGATIONS.get(investigation_id)
    if not result:
        raise HTTPException(status_code=404, detail="Investigation not found")

    return result["detection"]

@app.get("/investigations/{investigation_id}/anomalies")
def get_investigation_anomalies(investigation_id: str):
    result = INVESTIGATIONS.get(investigation_id)
    if not result:
        raise HTTPException(status_code=404, detail="Investigation not found")

    return result["anomaly_detection"]

@app.get("/investigations/{investigation_id}/timeline")
def get_investigation_timeline(investigation_id: str):
    result = INVESTIGATIONS.get(investigation_id)
    if not result:
        raise HTTPException(status_code=404, detail="Investigation not found")

    records = result["evidence_records"]
    timeline = sorted(records, key=lambda r: r["timestamp"])

    return {
        "investigation_id": investigation_id,
        "total_events": len(timeline),
        "timeline": timeline
    }

@app.get("/investigations/{investigation_id}/graph")
def get_investigation_graph(investigation_id: str):
    result = INVESTIGATIONS.get(investigation_id)
    if not result:
        raise HTTPException(status_code=404, detail="Investigation not found")

    return result["correlation"]["graph"]