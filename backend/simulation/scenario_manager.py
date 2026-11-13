from uuid import uuid4
from datetime import datetime, timezone

from backend.simulation.scenario_models import (
    Scenario,
    ScenarioStatus
)


class ScenarioManager:

    def __init__(self):
        self.scenarios = {}
        self.baseline_evidence = {}
        self.active_evidence = {}
        self.operations = {}
        self.attribute_overrides = {}

    # ---------------------------------
    # 1. CREATE SCENARIO
    # ---------------------------------

    def create_scenario(
        self,
        investigation_id,
        baseline_analysis_id,
        scenario_name,
        description,
        evidence_ids
    ):

        scenario_id = f"SCN-{uuid4().hex[:8].upper()}"

        scenario = Scenario(
            scenario_id=scenario_id,
            investigation_id=investigation_id,
            baseline_analysis_id=baseline_analysis_id,
            scenario_name=scenario_name,
            description=description
        )

        original_ids = list(evidence_ids)

        self.scenarios[scenario_id] = scenario

        self.baseline_evidence[scenario_id] = original_ids.copy()

        self.active_evidence[scenario_id] = original_ids.copy()

        self.operations[scenario_id] = []

        self.attribute_overrides[scenario_id] = {}

        return scenario

    # ---------------------------------
    # 2. GET SCENARIO
    # ---------------------------------

    def get_scenario(self, scenario_id):

        if scenario_id not in self.scenarios:
            raise ValueError("Scenario not found")

        return self.scenarios[scenario_id]

    # ---------------------------------
    # 3. LIST SCENARIOS
    # ---------------------------------

    def list_scenarios(self):

        return list(self.scenarios.values())

    # ---------------------------------
    # 4. UPDATE DESCRIPTION
    # ---------------------------------

    def update_scenario(self, scenario_id, description):

        scenario = self.get_scenario(scenario_id)

        if scenario.status == ScenarioStatus.DISCARDED:
            raise ValueError("Discarded scenario cannot be updated")

        updated = scenario.model_copy(
            update={
                "description": description,
                "updated_at": datetime.now(timezone.utc),
                "status": ScenarioStatus.MODIFIED
            }
        )

        self.scenarios[scenario_id] = updated

        return updated

    # ---------------------------------
    # 5. GET ACTIVE EVIDENCE
    # ---------------------------------

    def get_active_evidence(self, scenario_id):

        self.get_scenario(scenario_id)

        return self.active_evidence[scenario_id].copy()

    # ---------------------------------
    # 6. RESET SCENARIO
    # ---------------------------------

    def reset_scenario(self, scenario_id):

        scenario = self.get_scenario(scenario_id)

        if scenario.status == ScenarioStatus.DISCARDED:
            raise ValueError("Discarded scenario cannot be reset")

        self.active_evidence[scenario_id] = (
            self.baseline_evidence[scenario_id].copy()
        )

        self.operations[scenario_id] = []

        self.attribute_overrides[scenario_id] = {}

        updated = scenario.model_copy(
            update={
                "status": ScenarioStatus.CREATED,
                "updated_at": datetime.now(timezone.utc)
            }
        )

        self.scenarios[scenario_id] = updated

        return updated

    # ---------------------------------
    # 7. DISCARD SCENARIO
    # ---------------------------------

    def discard_scenario(self, scenario_id):

        scenario = self.get_scenario(scenario_id)

        updated = scenario.model_copy(
            update={
                "status": ScenarioStatus.DISCARDED,
                "updated_at": datetime.now(timezone.utc)
            }
        )

        self.scenarios[scenario_id] = updated

        return updated