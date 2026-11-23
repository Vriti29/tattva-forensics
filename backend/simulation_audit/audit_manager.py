from uuid import uuid4

from backend.simulation.scenario_models import AuditRecord


class AuditManager:

    def __init__(self):
        self.records = []

    def log_action(
        self,
        scenario_id,
        action,
        evidence_id=None,
        details=None,
        actor_user_id=None,
    ):

        record = AuditRecord(
            audit_id=f"AUD-{uuid4().hex[:8].upper()}",
            scenario_id=scenario_id,
            action=action,
            actor_user_id=actor_user_id,
            evidence_id=evidence_id,
            details=details or {}
        )

        self.records.append(record)

        return record

    def get_history(self, scenario_id):

        return [
            record
            for record in self.records
            if record.scenario_id == scenario_id
        ]

    def get_all_history(self):

        return list(self.records)