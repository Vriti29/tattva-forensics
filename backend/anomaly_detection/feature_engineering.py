def _get(record, key, default=None):
    return record.get(key, default) if isinstance(record, dict) else getattr(record, key, default)

def extract_features(records):
    features = []
    for record in records:
        timestamp = _get(record, "timestamp")
        event_type = _get(record, "event_type", "")
        transfer_size = _get(record, "transfer_size_bytes") or 0
        hour = timestamp.hour if timestamp else 0

        features.append({
            "hour": hour,
            "is_night": int(hour < 6 or hour >= 22),
            "is_login": int(event_type in {"LOGIN_SUCCESS", "LOGIN_FAILED"}),
            "is_failed_login": int(event_type == "LOGIN_FAILED"),
            "is_file_event": int(event_type in {"FILE_ACCESS", "FILE_MODIFIED", "FILE_DELETED"}),
            "is_network_event": int(event_type in {"DATA_TRANSFER", "CONNECTION_ALLOWED", "CONNECTION_BLOCKED"}),
            "is_archive_event": int(event_type in {"ARCHIVE_CREATED", "ARCHIVE_EXTRACTED"}),
            "transfer_size_bytes": transfer_size,
            "has_ip": int(bool(_get(record, "ip_address") or _get(record, "source_ip"))),
            "has_user": int(bool(_get(record, "user_id"))),
        })
    return features