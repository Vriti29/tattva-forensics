def create_finding(rule_id, title, description, evidence_records, severity="MEDIUM"):
    return {
        "finding_id": None,
        "rule_id": rule_id,
        "title": title,
        "description": description,
        "severity": severity,
        "evidence_ids": [
            record.get("evidence_id") if isinstance(record, dict)
            else record.evidence_id
            for record in evidence_records
        ],
        "timestamp": (
            evidence_records[-1].get("timestamp")
            if isinstance(evidence_records[-1], dict)
            else evidence_records[-1].timestamp
        )
    }