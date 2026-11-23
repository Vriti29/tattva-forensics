from typing import Optional
from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, ConfigDict

from backend.auth.security import (
    authorize_investigation,
    get_current_user,
    has_investigation_assignment,
)

router = APIRouter(
    prefix="/api/simulations",
    tags=["What-If Investigation Simulator"]
)


# ==========================================
# REQUEST MODELS
# ==========================================

class CreateScenarioRequest(BaseModel):

    investigation_id: str
    baseline_analysis_id: str

    scenario_name: str
    description: Optional[str] = None


class ExcludeEventRequest(BaseModel):

    evidence_id: str


class ModifyTimestampRequest(BaseModel):

    evidence_id: str
    original_value: datetime
    simulated_value: datetime


# ==========================================
# COMMON HELPERS
# ==========================================

def get_service(request: Request):

    service = getattr(
        request.app.state,
        "simulation_service",
        None
    )

    if service is None:
        raise HTTPException(
            status_code=503,
            detail="Simulation service is not initialized"
        )

    return service


def get_evidence_store(request: Request):

    store = getattr(
        request.app.state,
        "evidence_store",
        None
    )

    if store is None:
        raise HTTPException(
            status_code=503,
            detail="Evidence store is not initialized"
        )

    return store


def get_baseline_store(request: Request):

    store = getattr(
        request.app.state,
        "baseline_store",
        None
    )

    if store is None:
        raise HTTPException(
            status_code=503,
            detail="Baseline store is not initialized"
        )

    return store


def get_scenario_or_404(service, scenario_id):

    try:
        return service.scenario_manager.get_scenario(
            scenario_id
        )

    except ValueError:
        raise HTTPException(
            status_code=404,
            detail="Scenario not found"
        )


def _record_simulation_audit(
    request,
    user,
    scenario,
    action,
    evidence_id=None,
    details=None,
):
    request.app.state.investigation_store.append_audit_event(
        action=f"SIMULATOR_{action}",
        actor_user_id=user["user_id"],
        investigation_id=scenario.investigation_id,
        evidence_id=evidence_id,
        target_id=scenario.scenario_id,
        metadata=details or {},
    )


# ==========================================
# 1. CREATE SCENARIO
# ==========================================

@router.post("", status_code=201)
def create_scenario(
    data: CreateScenarioRequest,
    request: Request,
    user=Depends(get_current_user),
):

    service = get_service(request)

    authorize_investigation(
        request,
        user,
        data.investigation_id,
        permission="simulate",
    )

    evidence_store = get_evidence_store(request)

    baseline_store = get_baseline_store(request)

    if data.investigation_id not in evidence_store:

        raise HTTPException(
            status_code=404,
            detail="Investigation evidence not found"
        )

    if data.baseline_analysis_id not in baseline_store:

        raise HTTPException(
            status_code=404,
            detail="Baseline analysis not found"
        )

    evidence_records = evidence_store[
        data.investigation_id
    ]

    evidence_ids = [
        item["evidence_id"]
        for item in evidence_records
    ]

    baseline = baseline_store[
        data.baseline_analysis_id
    ]

    if not isinstance(baseline, dict):

        raise HTTPException(
            status_code=500,
            detail="Invalid baseline analysis format"
        )

    try:

        scenario = service.create_scenario(
            data.investigation_id,
            data.baseline_analysis_id,
            data.scenario_name,
            data.description,
            evidence_ids,
            actor_user_id=user["user_id"],
        )
        _record_simulation_audit(
            request,
            user,
            scenario,
            "SCENARIO_CREATED",
            details={
                "baseline_analysis_id": scenario.baseline_analysis_id,
                "scenario_name": scenario.scenario_name,
            },
        )

        return scenario.model_dump(mode="json")

    except (ValueError, KeyError) as error:

        raise HTTPException(
            status_code=400,
            detail=str(error)
        )


# ==========================================
# 2. LIST SCENARIOS
# ==========================================

@router.get("")
def list_scenarios(request: Request, user=Depends(get_current_user)):

    service = get_service(request)

    return [
        item.model_dump(mode="json")
        for item in service.scenario_manager.list_scenarios()
        if user["role"] == "ADMIN"
        or has_investigation_assignment(
            request,
            user,
            item.investigation_id,
        )
    ]


# ==========================================
# 3. GET SCENARIO DETAILS
# ==========================================

@router.get("/{scenario_id}")
def get_scenario(
    scenario_id: str,
    request: Request,
    user=Depends(get_current_user),
):

    service = get_service(request)

    scenario = get_scenario_or_404(
        service,
        scenario_id
    )
    authorize_investigation(
        request,
        user,
        scenario.investigation_id,
    )

    return {
        "scenario": scenario.model_dump(mode="json"),

        "active_evidence": (
            service.scenario_manager.get_active_evidence(
                scenario_id
            )
        ),

        "operations": [
            item.model_dump(mode="json")
            for item in service.scenario_manager.operations[
                scenario_id
            ]
        ],

        "simulation_result": (
            service.simulation_results.get(scenario_id)
        ),

        "comparison_result": (
            service.comparison_results.get(scenario_id)
        )
    }


# ==========================================
# 4. EXCLUDE EVENT
# ==========================================

@router.post("/{scenario_id}/exclude")
def exclude_event(
    scenario_id: str,
    data: ExcludeEventRequest,
    request: Request,
    user=Depends(get_current_user),
):

    service = get_service(request)

    scenario = get_scenario_or_404(service, scenario_id)
    authorize_investigation(
        request,
        user,
        scenario.investigation_id,
        permission="simulate",
    )

    try:

        result = service.exclude_event(
            scenario_id,
            data.evidence_id,
            actor_user_id=user["user_id"],
        )
        _record_simulation_audit(
            request,
            user,
            scenario,
            "EVENT_EXCLUDED",
            evidence_id=data.evidence_id,
        )

        return {
            "message": "Evidence excluded from scenario",
            "operation": result.model_dump(mode="json")
        }

    except ValueError as error:

        raise HTTPException(
            status_code=400,
            detail=str(error)
        )


# ==========================================
# 5. MODIFY TIMESTAMP
# ==========================================

@router.post("/{scenario_id}/modify")
def modify_timestamp(
    scenario_id: str,
    data: ModifyTimestampRequest,
    request: Request,
    user=Depends(get_current_user),
):

    service = get_service(request)

    scenario = get_scenario_or_404(service, scenario_id)
    authorize_investigation(
        request,
        user,
        scenario.investigation_id,
        permission="simulate",
    )

    try:

        result = service.modify_timestamp(
            scenario_id,
            data.evidence_id,
            data.original_value.isoformat(),
            data.simulated_value.isoformat(),
            actor_user_id=user["user_id"],
        )
        _record_simulation_audit(
            request,
            user,
            scenario,
            "TIMESTAMP_MODIFIED",
            evidence_id=data.evidence_id,
            details={
                "original_value": data.original_value.isoformat(),
                "simulated_value": data.simulated_value.isoformat(),
            },
        )

        return {
            "message": "Timestamp modified in scenario",
            "operation": result.model_dump(mode="json")
        }

    except ValueError as error:

        raise HTTPException(
            status_code=400,
            detail=str(error)
        )


# ==========================================
# 6. RUN SIMULATION
# ==========================================

@router.post("/{scenario_id}/run")
def run_simulation(
    scenario_id: str,
    request: Request,
    user=Depends(get_current_user),
):

    service = get_service(request)

    evidence_store = get_evidence_store(request)

    baseline_store = get_baseline_store(request)

    scenario = get_scenario_or_404(
        service,
        scenario_id
    )
    authorize_investigation(
        request,
        user,
        scenario.investigation_id,
        permission="simulate",
    )

    if scenario.investigation_id not in evidence_store:

        raise HTTPException(
            status_code=404,
            detail="Original evidence not found"
        )

    if scenario.baseline_analysis_id not in baseline_store:

        raise HTTPException(
            status_code=404,
            detail="Baseline analysis not found"
        )

    try:

        result = service.run_simulation(
            scenario_id,
            evidence_store[scenario.investigation_id],
            baseline_store[scenario.baseline_analysis_id],
            actor_user_id=user["user_id"],
        )
        _record_simulation_audit(
            request,
            user,
            scenario,
            "SIMULATION_EXECUTED",
        )

        return {
            "message": "Simulation completed",
            "result": result.model_dump(mode="json")
        }

    except ValueError as error:

        raise HTTPException(
            status_code=400,
            detail=str(error)
        )


# ==========================================
# 7. COMPARE BASELINE AND SIMULATION
# ==========================================

@router.get("/{scenario_id}/compare")
def compare_results(
    scenario_id: str,
    request: Request,
    user=Depends(get_current_user),
):

    service = get_service(request)

    baseline_store = get_baseline_store(request)

    scenario = get_scenario_or_404(
        service,
        scenario_id
    )
    authorize_investigation(
        request,
        user,
        scenario.investigation_id,
    )

    baseline = baseline_store.get(
        scenario.baseline_analysis_id
    )

    if baseline is None:

        raise HTTPException(
            status_code=404,
            detail="Baseline analysis not found"
        )

    try:

        result = service.compare_results(
            scenario_id,
            baseline,
            actor_user_id=user["user_id"],
        )
        _record_simulation_audit(
            request,
            user,
            scenario,
            "COMPARISON_GENERATED",
        )
        return result

    except ValueError as error:

        raise HTTPException(
            status_code=400,
            detail=str(error)
        )


# ==========================================
# 8. AUDIT HISTORY
# ==========================================

@router.get("/{scenario_id}/history")
def get_audit_history(
    scenario_id: str,
    request: Request,
    user=Depends(get_current_user),
):

    service = get_service(request)

    scenario = get_scenario_or_404(service, scenario_id)
    authorize_investigation(
        request,
        user,
        scenario.investigation_id,
    )

    history = service.audit_manager.get_history(
        scenario_id
    )

    return [
        item.model_dump(mode="json")
        for item in history
    ]


# ==========================================
# 9. RESET SCENARIO
# ==========================================

@router.post("/{scenario_id}/reset")
def reset_scenario(
    scenario_id: str,
    request: Request,
    user=Depends(get_current_user),
):

    service = get_service(request)

    scenario = get_scenario_or_404(service, scenario_id)
    authorize_investigation(
        request,
        user,
        scenario.investigation_id,
        permission="simulate",
    )

    try:

        result = service.reset_scenario(
            scenario_id,
            actor_user_id=user["user_id"],
        )
        _record_simulation_audit(
            request,
            user,
            scenario,
            "SCENARIO_RESET",
        )

        return {
            "message": "Scenario reset successfully",
            "scenario": result.model_dump(mode="json")
        }

    except ValueError as error:

        raise HTTPException(
            status_code=400,
            detail=str(error)
        )


# ==========================================
# 10. DISCARD SCENARIO
# ==========================================

@router.post("/{scenario_id}/discard")
def discard_scenario(
    scenario_id: str,
    request: Request,
    user=Depends(get_current_user),
):

    service = get_service(request)

    scenario = get_scenario_or_404(service, scenario_id)
    authorize_investigation(
        request,
        user,
        scenario.investigation_id,
        permission="simulate",
    )

    try:

        result = service.discard_scenario(
            scenario_id,
            actor_user_id=user["user_id"],
        )
        _record_simulation_audit(
            request,
            user,
            scenario,
            "SCENARIO_DISCARDED",
        )

        return {
            "message": "Scenario discarded successfully",
            "scenario": result.model_dump(mode="json")
        }

    except ValueError as error:

        raise HTTPException(
            status_code=400,
            detail=str(error)
        )