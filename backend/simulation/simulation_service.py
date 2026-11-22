from uuid import uuid4

from backend.simulation.scenario_models import (
    SimulationResult,
    ScenarioStatus
)

from backend.simulation.scenario_manager import ScenarioManager

from backend.simulation.operation_manager import OperationManager

from backend.simulation.reanalysis_engine import ReanalysisEngine

from backend.comparison.comparison_engine import ComparisonEngine

from backend.simulation_audit.audit_manager import AuditManager


class SimulationService:

    def __init__(self, analysis_function):

        self.scenario_manager = ScenarioManager()

        self.operation_manager = OperationManager(
            self.scenario_manager
        )

        self.reanalysis_engine = ReanalysisEngine(
            analysis_function
        )

        self.comparison_engine = ComparisonEngine()

        self.audit_manager = AuditManager()

        self.simulation_results = {}

        self.comparison_results = {}

    # ---------------------------------
    # CREATE SCENARIO
    # ---------------------------------

    def create_scenario(
        self,
        investigation_id,
        baseline_analysis_id,
        scenario_name,
        description,
        evidence_ids,
        actor_user_id=None,
    ):

        scenario = self.scenario_manager.create_scenario(
            investigation_id,
            baseline_analysis_id,
            scenario_name,
            description,
            evidence_ids
        )

        self.audit_manager.log_action(
            scenario.scenario_id,
            "SCENARIO_CREATED",
            actor_user_id=actor_user_id,
        )

        return scenario

    # ---------------------------------
    # EXCLUDE EVENT
    # ---------------------------------

    def exclude_event(self, scenario_id, evidence_id, actor_user_id=None):

        operation = self.operation_manager.exclude_event(
            scenario_id,
            evidence_id
        )

        self.audit_manager.log_action(
            scenario_id,
            "EVENT_EXCLUDED",
            evidence_id,
            actor_user_id=actor_user_id,
        )

        return operation

    # ---------------------------------
    # MODIFY TIMESTAMP
    # ---------------------------------

    def modify_timestamp(
        self,
        scenario_id,
        evidence_id,
        original_value,
        simulated_value,
        actor_user_id=None,
    ):

        operation = self.operation_manager.modify_timestamp(
            scenario_id,
            evidence_id,
            original_value,
            simulated_value
        )

        self.audit_manager.log_action(
            scenario_id,
            "TIMESTAMP_MODIFIED",
            evidence_id,
            {
                "original_value": original_value,
                "simulated_value": simulated_value
            },
            actor_user_id=actor_user_id,
        )

        return operation

    # ---------------------------------
    # RUN SIMULATION
    # ---------------------------------

    def run_simulation(
        self,
        scenario_id,
        original_records,
        baseline_analysis,
        actor_user_id=None,
    ):

        scenario = self.scenario_manager.get_scenario(
            scenario_id
        )

        if scenario.status == ScenarioStatus.DISCARDED:
            raise ValueError("Cannot run a discarded scenario")

        simulated = self.reanalysis_engine.run_simulation(
            self.scenario_manager,
            scenario_id,
            original_records
        )

        result = SimulationResult(
            simulation_id=f"SIM-{uuid4().hex[:8].upper()}",
            scenario_id=scenario_id,
            baseline_analysis_id=scenario.baseline_analysis_id,
            status="COMPLETED",
            findings=simulated["findings"],
            relationships=simulated["relationships"],
            graph=simulated["graph"]
        )

        self.simulation_results[scenario_id] = result

        self.audit_manager.log_action(
            scenario_id,
            "SIMULATION_EXECUTED",
            actor_user_id=actor_user_id,
        )

        return result

    # ---------------------------------
    # COMPARE RESULTS
    # ---------------------------------

    def compare_results(
        self,
        scenario_id,
        baseline_analysis,
        actor_user_id=None,
    ):

        if scenario_id not in self.simulation_results:
            raise ValueError("Run simulation before comparison")

        simulated = self.simulation_results[scenario_id]

        comparison = self.comparison_engine.compare(
            scenario_id,
            baseline_analysis,
            simulated.model_dump()
        )

        self.comparison_results[scenario_id] = comparison

        self.audit_manager.log_action(
            scenario_id,
            "COMPARISON_GENERATED",
            actor_user_id=actor_user_id,
        )

        return comparison

    # ---------------------------------
    # RESET
    # ---------------------------------

    def reset_scenario(self, scenario_id, actor_user_id=None):

        scenario = self.scenario_manager.reset_scenario(
            scenario_id
        )

        self.simulation_results.pop(scenario_id, None)

        self.comparison_results.pop(scenario_id, None)

        self.audit_manager.log_action(
            scenario_id,
            "SCENARIO_RESET",
            actor_user_id=actor_user_id,
        )

        return scenario

    # ---------------------------------
    # DISCARD
    # ---------------------------------

    def discard_scenario(self, scenario_id, actor_user_id=None):

        scenario = self.scenario_manager.discard_scenario(
            scenario_id
        )

        self.audit_manager.log_action(
            scenario_id,
            "SCENARIO_DISCARDED",
            actor_user_id=actor_user_id,
        )

        return scenario