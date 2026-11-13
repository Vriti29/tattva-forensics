def _get(record, key):
    return record.get(key) if isinstance(record, dict) else getattr(record, key, None)

def analyze_sequences(records):
    ordered = sorted(records, key=lambda r: _get(r, "timestamp"))
    sequences = []
    patterns = [
        ("LOGIN_FAILED", "LOGIN_SUCCESS", "Failed login followed by successful login"),
        ("FILE_ACCESS", "ARCHIVE_CREATED", "File access followed by archive creation"),
        ("FILE_MODIFIED", "ARCHIVE_CREATED", "File modification followed by archive creation"),
        ("LOGIN_SUCCESS", "DATA_TRANSFER", "Successful login followed by data transfer")
    ]

    for index, first in enumerate(ordered):
        for second in ordered[index + 1:]:
            if _get(first, "user_id") != _get(second, "user_id"):
                continue

            if _get(second, "timestamp") - _get(first, "timestamp") > __import__("datetime").timedelta(minutes=30):
                break

            for first_event, second_event, description in patterns:
                if (
                    _get(first, "event_type") == first_event
                    and _get(second, "event_type") == second_event
                ):
                    sequences.append({
                        "source_evidence_id": _get(first, "evidence_id"),
                        "target_evidence_id": _get(second, "evidence_id"),
                        "relationship_type": "SEQUENCE",
                        "description": description
                    })

    return sequences