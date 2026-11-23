
from .timestamp_handler import normalize_timestamp
from .event_mapper import map_event_type
from .validators import validate_evidence

def normalize_records(
    records,
    starting_id=1,
    source_id=None,
    evidence_id_prefix=None
):
    normalized = []
    errors = []

    for index, record in enumerate(records):
        try:
            original_event = record["original_event_type"]

            evidence = {
                **record,
                "evidence_id": (
                    f"{evidence_id_prefix}-{starting_id + index:04d}"
                    if evidence_id_prefix
                    else f"EV-{starting_id + index:04d}"
                ),
                "source_id": source_id,
                "timestamp": normalize_timestamp(record["timestamp"]),
                "event_type": map_event_type(original_event),
                "ip_address": record.get("ip_address") or record.get("source_ip")
            }

            normalized.append(validate_evidence(evidence))

        except (ValueError, KeyError, TypeError) as error:
            errors.append({
                "record_number": index + 1,
                "raw_record": record,
                "error": str(error)
            })

    return {
        "records": normalized,
        "errors": errors,
        "total_records": len(records),
        "successful_records": len(normalized),
        "failed_records": len(errors)
    }
