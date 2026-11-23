
from datetime import datetime, timezone


def normalize_timestamp(value):
    """Normalize aware values to UTC and leave naive wall-clock values unzoned."""
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        raw_value = value.strip()
        formats = [
            "%Y-%m-%d %H:%M:%S",
            "%d/%m/%Y %I:%M %p",
            "%Y-%m-%d %H:%M:%S.%f",
        ]

        try:
            parsed = datetime.fromisoformat(
                raw_value.replace("Z", "+00:00")
            )
        except ValueError:
            parsed = None

        if parsed is None:
            for fmt in formats:
                try:
                    parsed = datetime.strptime(raw_value, fmt)
                    break
                except ValueError:
                    continue

        if parsed is None:
            raise ValueError(
                "Invalid timestamp format; use ISO 8601 or a supported "
                "legacy format"
            )
    else:
        raise ValueError("Invalid timestamp: expected a string or datetime")

    if parsed.tzinfo is None or parsed.utcoffset() is None:
        return parsed
    return parsed.astimezone(timezone.utc)


def original_timestamp(value):
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, str):
        return value
    raise ValueError("Invalid timestamp: expected a string or datetime")


def ensure_compatible_timestamps(timestamps):
    """Reject mixed timezone awareness rather than inventing an offset."""
    normalized = [normalize_timestamp(value) for value in timestamps]
    awareness = {
        value.tzinfo is not None and value.utcoffset() is not None
        for value in normalized
    }
    if len(awareness) > 1:
        raise ValueError(
            "Evidence contains both timezone-aware and timezone-naive "
            "timestamps. Naive timestamps are preserved as timezone-"
            "unspecified wall-clock values, not assumed UTC; add explicit "
            "timezone offsets before combining these records."
        )
    return normalized


def sort_records_by_timestamp(records):
    normalized = ensure_compatible_timestamps(
        [record["timestamp"] for record in records]
    )
    return [
        record
        for _, record in sorted(
            zip(normalized, records),
            key=lambda item: item[0],
        )
    ]
