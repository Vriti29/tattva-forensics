from datetime import datetime, timezone
from enum import Enum
from typing import Optional, Any

from pydantic import BaseModel, Field, model_validator


class ScenarioStatus(str, Enum):
    CREATED = "CREATED"
    MODIFIED = "MODIFIED"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    DISCARDED = "DISCARDED"


class Scenario(BaseModel):
    scenario_id: str
    investigation_id: str
    baseline_analysis_id: str

    scenario_name: str
    description: str | None = None

    status: ScenarioStatus = ScenarioStatus.CREATED

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )

    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )

class OperationType(str, Enum):
    EXCLUDE_EVENT = "EXCLUDE_EVENT"
    MODIFY_ATTRIBUTE = "MODIFY_ATTRIBUTE"


class ScenarioOperation(BaseModel):

    operation_id: str
    scenario_id: str

    operation_type: OperationType
    evidence_id: str

    attribute: Optional[str] = None
    original_value: Optional[Any] = None
    simulated_value: Optional[Any] = None

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )

    @model_validator(mode="after")
    def validate_operation(self):

        if self.operation_type == OperationType.MODIFY_ATTRIBUTE:

            if not self.attribute:
                raise ValueError("Attribute is required")

            if self.simulated_value is None:
                raise ValueError("Simulated value is required")

        if self.operation_type == OperationType.EXCLUDE_EVENT:

            if self.attribute is not None:
                raise ValueError("Attribute not allowed for exclusion")

        return self

class SimulationResult(BaseModel):

    simulation_id: str
    scenario_id: str
    baseline_analysis_id: str

    status: str = "COMPLETED"

    findings: list[dict[str, Any]] = Field(
        default_factory=list
    )

    relationships: list[dict[str, Any]] = Field(
        default_factory=list
    )

    graph: dict[str, Any] = Field(
        default_factory=dict
    )

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )

# ---------------------------------
# 1. COMPARISON RESULT
# ---------------------------------

class ComparisonResult(BaseModel):

    comparison_id: str
    scenario_id: str

    unchanged_relationships: list[str] = Field(
        default_factory=list
    )

    removed_relationships: list[str] = Field(
        default_factory=list
    )

    added_relationships: list[str] = Field(
        default_factory=list
    )

    unchanged_findings: list[str] = Field(
        default_factory=list
    )

    removed_findings: list[str] = Field(
        default_factory=list
    )

    added_findings: list[str] = Field(
        default_factory=list
    )

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )


# ---------------------------------
# 2. AUDIT RECORD
# ---------------------------------

class AuditRecord(BaseModel):

    audit_id: str
    scenario_id: str

    action: str

    evidence_id: Optional[str] = None

    details: dict[str, Any] = Field(
        default_factory=dict
    )

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )