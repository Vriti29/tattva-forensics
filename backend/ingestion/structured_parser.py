import csv
import json
import io

from backend.normalization.timestamp_handler import normalize_timestamp

NUMERIC_FIELDS = {"transfer_size_bytes", "archive_size_bytes"}

def parse_structured_content(content, source_type, file_format):
    records = []
    errors = []

    if source_type not in {"authentication", "file", "network", "archive"}:
        raise ValueError(f"Unsupported source type: {source_type}")

    try:
        if file_format == ".json":
            data = json.loads(content)
            if isinstance(data, dict):
                data = data.get("records", [data])
            if not isinstance(data, list):
                raise ValueError("JSON must contain a record or a list of records")
        elif file_format == ".csv":
            reader = csv.DictReader(io.StringIO(content))
            if not reader.fieldnames:
                raise ValueError("CSV file must contain a header row")
            data = list(reader)
        else:
            raise ValueError("Unsupported structured file format")

    except (json.JSONDecodeError, csv.Error) as error:
        raise ValueError(f"Invalid {file_format} data: {error}") from error

    for index, item in enumerate(data, start=1):
        try:
            if not isinstance(item, dict):
                raise ValueError("Each record must be an object")

            record = {
                key: value.strip() if isinstance(value, str) else value
                for key, value in item.items()
                if value is not None
            }

            timestamp = record.get("timestamp")
            event = record.get("original_event_type") or record.get("event_type")

            if not timestamp:
                raise ValueError("Invalid timestamp: value is required")
            if not event:
                raise ValueError("Missing event type")

            normalize_timestamp(timestamp)
            record["timestamp"] = timestamp
            record["original_event_type"] = str(event).upper()
            record["source_type"] = source_type
            record["raw_record_reference"] = f"record:{index}"

            for field in NUMERIC_FIELDS:
                if record.get(field) not in (None, ""):
                    record[field] = int(record[field])

            records.append(record)

        except (ValueError, TypeError, AttributeError) as error:
            errors.append({
                "record_number": index,
                "raw_record": item,
                "error": str(error)
            })

    return {
        "records": records,
        "errors": errors,
        "total_records": len(records) + len(errors),
        "successful_records": len(records),
        "failed_records": len(errors)
    }