from copy import deepcopy


class ReanalysisEngine:

    def __init__(self, analysis_function):
        self.analysis_function = analysis_function

    def build_simulated_evidence(
        self,
        scenario_manager,
        scenario_id,
        original_records
    ):

        active_ids = set(
            scenario_manager.get_active_evidence(scenario_id)
        )

        overrides = scenario_manager.attribute_overrides[scenario_id]

        simulated_records = []

        for record in original_records:

            evidence_id = record.get("evidence_id")

            if evidence_id not in active_ids:
                continue

            simulated_record = deepcopy(record)

            if evidence_id in overrides:

                for attribute, value in overrides[evidence_id].items():

                    simulated_record[attribute] = value

            simulated_records.append(simulated_record)

        return simulated_records

    def run_simulation(
        self,
        scenario_manager,
        scenario_id,
        original_records
    ):

        simulated_evidence = self.build_simulated_evidence(
            scenario_manager,
            scenario_id,
            original_records
        )

        analysis_result = self.analysis_function(
            simulated_evidence
        )

        return {
            "scenario_id": scenario_id,
            "simulated_evidence": simulated_evidence,
            "findings": analysis_result.get("findings", []),
            "relationships": analysis_result.get("relationships", []),
            "graph": analysis_result.get("graph", {})
        }