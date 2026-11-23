
import re
import ipaddress

from backend.normalization.timestamp_handler import normalize_timestamp

def parse_network_log(content):
    records = []
    errors = []
    pattern = r"^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\d+)\s+(\S+)$"
    allowed_events = {"CONNECTION_ALLOWED", "CONNECTION_BLOCKED", "DATA_TRANSFER"}

    for line_number, line in enumerate(content.splitlines(), start=1):
        line = line.strip()
        if not line:
            continue
        try:
            match = re.match(pattern, line)
            if not match:
                raise ValueError("Invalid network log format")

            date, time, event, user, src_ip, dest_ip, size, host = match.groups()
            timestamp = f"{date} {time}"
            normalize_timestamp(timestamp)

            if event not in allowed_events:
                raise ValueError(f"Unknown event type: {event}")

            ipaddress.ip_address(src_ip)
            ipaddress.ip_address(dest_ip)

            records.append({
                "timestamp": timestamp,
                "original_event_type": event,
                "user_id": user,
                "source_ip": src_ip,
                "destination_ip": dest_ip,
                "transfer_size_bytes": int(size),
                "host_id": host,
                "source_type": "network",
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
