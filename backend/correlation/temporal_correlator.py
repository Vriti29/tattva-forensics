from datetime import timedelta

def _get(record, key):
    return record.get(key) if isinstance(record, dict) else getattr(record, key, None)

def correlate_temporal_events(records, window_minutes=30):
    if window_minutes < 0:
        raise ValueError("Time window cannot be negative.")

    ordered = sorted(records, key=lambda r: _get(r, "timestamp"))
    relationships = []

    for i, first in enumerate(ordered):
        for second in ordered[i + 1:]:
            difference = _get(second, "timestamp") - _get(first, "timestamp")
            if difference > timedelta(minutes=window_minutes):
                break

            relationships.append({
                "source_evidence_id": _get(first, "evidence_id"),
                "target_evidence_id": _get(second, "evidence_id"),
                "time_difference_seconds": int(difference.total_seconds()),
                "relationship_type": "TEMPORAL"
            })

    return relationships