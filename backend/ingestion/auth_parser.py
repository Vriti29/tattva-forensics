import re
import ipaddress

from backend.normalization.timestamp_handler import normalize_timestamp

def parse_auth_log(content):
    records = []
    errors = []
    pattern = r"^(\S+(?:\s+\S+)?)\s+(\S+)\s+(\S+)\s+(\S+)$"
    allowed_events = {"LOGIN_SUCCESS", "LOGIN_FAILED", "LOGOUT"}

    for line_number, line in enumerate(content.splitlines(), start=1):
        line = line.strip()
        if not line:
            continue
        try:
            match = re.match(pattern, line)
            if not match:
                raise ValueError("Invalid authentication log format")

            timestamp, event_type, username, ip_address = match.groups()
            normalize_timestamp(timestamp)

            if event_type not in allowed_events:
                raise ValueError(f"Unknown event type: {event_type}")

            ipaddress.ip_address(ip_address)

            records.append({
                "timestamp": timestamp,
                "original_event_type": event_type,
                "user_id": username,
                "ip_address": ip_address,
                "source_type": "authentication",
                "raw_record_reference": f"line:{line_number}"
            })
        except (ValueError, TypeError) as error:
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