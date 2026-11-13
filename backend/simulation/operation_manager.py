from datetime import datetime, timezone
from uuid import uuid4

from backend.simulation.scenario_models import (
    ScenarioOperation,
    OperationType,
    ScenarioStatus
)


class OperationManager:

    def __init__(self, scenario_manager):
        self.manager = scenario_manager

    def _get_scenario(self, scenario_id):

        scenario = self.manager.get_scenario(scenario_id)

        if scenario.status == ScenarioStatus.DISCARDED:
            raise ValueError("Scenario is discarded")

        return scenario

    def _record_operation(self, operation):

        self.manager.operations[operation.scenario_id].append(operation)

        scenario = self.manager.get_scenario(operation.scenario_id)

        self.manager.scenarios[operation.scenario_id] = (
            scenario.model_copy(
                update={
                    "status": ScenarioStatus.MODIFIED,
                    "updated_at": datetime.now(timezone.utc)
                }
            )
        )

        return operation

    # ---------------------------------
    # 1. EXCLUDE EVENT
    # ---------------------------------

    def exclude_event(self, scenario_id, evidence_id):

        self._get_scenario(scenario_id)

        active = self.manager.active_evidence[scenario_id]

        if evidence_id not in active:
            raise ValueError("Evidence not found or already excluded")

        operation = ScenarioOperation(
            operation_id=f"OP-{uuid4().hex[:8].upper()}",
            scenario_id=scenario_id,
            operation_type=OperationType.EXCLUDE_EVENT,
            evidence_id=evidence_id
        )

        active.remove(evidence_id)

        return self._record_operation(operation)

    # ---------------------------------
    # 2. MODIFY TIMESTAMP
    # ---------------------------------

    def modify_timestamp(
        self,
        scenario_id,
        evidence_id,
        original_value,
        simulated_value
    ):

        self._get_scenario(scenario_id)

        if evidence_id not in self.manager.active_evidence[scenario_id]:
            raise ValueError("Evidence not active in scenario")

        if not isinstance(original_value, str):
            raise ValueError("Original timestamp must be a string")

        if not isinstance(simulated_value, str):
            raise ValueError("New timestamp must be a string")

        try:
            old_time = datetime.fromisoformat(
                original_value.replace("Z", "+00:00")
            )

            new_time = datetime.fromisoformat(
                simulated_value.replace("Z", "+00:00")
            )

        except ValueError:
            raise ValueError("Invalid timestamp format")

        if old_time.tzinfo is None or new_time.tzinfo is None:
            raise ValueError("Timezone-aware timestamps are required")

        operation = ScenarioOperation(
            operation_id=f"OP-{uuid4().hex[:8].upper()}",
            scenario_id=scenario_id,
            operation_type=OperationType.MODIFY_ATTRIBUTE,
            evidence_id=evidence_id,
            attribute="timestamp",
            original_value=original_value,
            simulated_value=simulated_value
        )

        self.manager.attribute_overrides[scenario_id][evidence_id] = {
            "timestamp": simulated_value
        }

        return self._record_operation(operation)