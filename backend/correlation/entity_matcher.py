def _get(record, key):
    return record.get(key) if isinstance(record, dict) else getattr(record, key, None)

def match_entities(records):
    entity_map = {}
    fields = ["user_id", "ip_address", "source_ip", "destination_ip", "host_id", "file_id", "archive_id"]

    for record in records:
        evidence_id = _get(record, "evidence_id")
        if not evidence_id:
            continue

        for field in fields:
            value = _get(record, field)
            if value is not None and str(value).strip():
                key = (field, str(value).strip().lower())
                entity_map.setdefault(key, []).append(evidence_id)

    matches = []
    for (entity_type, entity_value), evidence_ids in entity_map.items():
        unique_ids = list(dict.fromkeys(evidence_ids))
        if len(unique_ids) > 1:
            matches.append({
                "entity_type": entity_type,
                "entity_value": entity_value,
                "evidence_ids": unique_ids
            })

    return matches