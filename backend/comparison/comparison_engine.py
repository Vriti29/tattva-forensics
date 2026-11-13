from uuid import uuid4

from backend.simulation.scenario_models import ComparisonResult


class ComparisonEngine:

    @staticmethod
    def _get_id(item, key):
        if isinstance(item, dict):
            return item.get(key)
        return getattr(item, key, None)

    def compare_relationships(self, baseline, simulated):

        baseline_map = {
            self._get_id(item, "relationship_id"): item
            for item in baseline
        }

        simulated_map = {
            self._get_id(item, "relationship_id"): item
            for item in simulated
        }

        baseline_ids = set(baseline_map)
        simulated_ids = set(simulated_map)

        return {
            "unchanged": sorted(baseline_ids & simulated_ids),
            "removed": sorted(baseline_ids - simulated_ids),
            "added": sorted(simulated_ids - baseline_ids)
        }

    def compare_findings(self, baseline, simulated):

        baseline_map = {
            self._get_id(item, "finding_id"): item
            for item in baseline
        }

        simulated_map = {
            self._get_id(item, "finding_id"): item
            for item in simulated
        }

        baseline_ids = set(baseline_map)
        simulated_ids = set(simulated_map)

        unchanged = baseline_ids & simulated_ids
        removed = baseline_ids - simulated_ids
        added = simulated_ids - baseline_ids

        severity_changes = []

        for finding_id in unchanged:

            old = baseline_map[finding_id]
            new = simulated_map[finding_id]

            old_severity = self._get_id(old, "severity")
            new_severity = self._get_id(new, "severity")

            if old_severity != new_severity:
                severity_changes.append({
                    "finding_id": finding_id,
                    "baseline_severity": old_severity,
                    "simulated_severity": new_severity
                })

        return {
            "unchanged": sorted(unchanged),
            "removed": sorted(removed),
            "added": sorted(added),
            "severity_changes": severity_changes
        }

    def compare_graphs(self, baseline, simulated):

        baseline_nodes = {
            item["id"] for item in baseline.get("nodes", [])
        }

        simulated_nodes = {
            item["id"] for item in simulated.get("nodes", [])
        }

        baseline_edges = {
            item["id"] for item in baseline.get("edges", [])
        }

        simulated_edges = {
            item["id"] for item in simulated.get("edges", [])
        }

        return {
            "retained_nodes": sorted(baseline_nodes & simulated_nodes),
            "removed_nodes": sorted(baseline_nodes - simulated_nodes),
            "added_nodes": sorted(simulated_nodes - baseline_nodes),
            "retained_edges": sorted(baseline_edges & simulated_edges),
            "removed_edges": sorted(baseline_edges - simulated_edges),
            "added_edges": sorted(simulated_edges - baseline_edges)
        }

    def compare(self, scenario_id, baseline, simulated):

        relationship_diff = self.compare_relationships(
            baseline.get("relationships", []),
            simulated.get("relationships", [])
        )

        finding_diff = self.compare_findings(
            baseline.get("findings", []),
            simulated.get("findings", [])
        )

        graph_diff = self.compare_graphs(
            baseline.get("graph", {}),
            simulated.get("graph", {})
        )

        result = ComparisonResult(
            comparison_id=f"CMP-{uuid4().hex[:8].upper()}",
            scenario_id=scenario_id,
            unchanged_relationships=relationship_diff["unchanged"],
            removed_relationships=relationship_diff["removed"],
            added_relationships=relationship_diff["added"],
            unchanged_findings=finding_diff["unchanged"],
            removed_findings=finding_diff["removed"],
            added_findings=finding_diff["added"]
        )

        return {
            "comparison": result.model_dump(mode="json"),
            "finding_details": finding_diff,
            "graph_details": graph_diff
        }