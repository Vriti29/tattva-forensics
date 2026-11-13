
import re
from datetime import datetime

def parse_archive_log(content):
    records = []
    errors = []
    pattern = r"^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+(\S+)\s+(\S+)\s+(\S+)\s+(.+?)\s+(\d+)\s+(\S+)$"
    allowed_events = {"ARCHIVE_CREATED", "ARCHIVE_EXTRACTED"}

    for line_number, line in enumerate(content.splitlines(), start=1):
        line = line.strip()
        if not line:
            continue
        try:
            match = re.match(pattern, line)
            if not match:
                raise ValueError("Invalid archive log format")

            date, time, event, user, archive_id, path, size, host = match.groups()
            timestamp = f"{date} {time}"
            datetime.strptime(timestamp, "%Y-%m-%d %H:%M:%S")

            if event not in allowed_events:
                raise ValueError(f"Unknown event type: {event}")

            records.append({
                "timestamp": timestamp,
                "original_event_type": event,
                "user_id": user,
                "archive_id": archive_id,
                "archive_path": path,
                "archive_size_bytes": int(size),
                "host_id": host,
                "source_type": "archive",
                "raw_record_reference": f"line:{line_number}"
            })
        except ValueError as error:
            errors.append({
                "line_number": line_number,
                "raw_record": line,
                "error": str(error)
            })

    return {
        "records": records,
        "errors": errors,
        "total_records": len(records) + len(errors),
        "successful_records": len(records),
        "failed_records": len(errors)
    }
