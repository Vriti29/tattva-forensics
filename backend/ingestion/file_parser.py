
import re
from datetime import datetime

def parse_file_log(content):
    records = []
    errors = []
    pattern = r"^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.+?)\s+(\S+)$"
    allowed_events = {"FILE_ACCESS", "FILE_MODIFIED", "FILE_DELETED"}

    for line_number, line in enumerate(content.splitlines(), start=1):
        line = line.strip()
        if not line:
            continue
        try:
            match = re.match(pattern, line)
            if not match:
                raise ValueError("Invalid file access log format")

            date, time, event_type, username, file_id, operation, file_path, host_id = match.groups()
            timestamp = f"{date} {time}"
            datetime.strptime(timestamp, "%Y-%m-%d %H:%M:%S")

            if event_type not in allowed_events:
                raise ValueError(f"Unknown event type: {event_type}")

            if operation not in {"READ", "WRITE", "DELETE"}:
                raise ValueError(f"Unknown file operation: {operation}")

            records.append({
                "timestamp": timestamp,
                "original_event_type": event_type,
                "user_id": username,
                "file_id": file_id,
                "operation": operation,
                "file_path": file_path,
                "host_id": host_id,
                "source_type": "file",
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
