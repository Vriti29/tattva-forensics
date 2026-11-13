
from datetime import datetime

def normalize_timestamp(value):
    if isinstance(value, datetime):
        return value

    if not isinstance(value, str):
        raise ValueError("Timestamp must be a string or datetime")

    value = value.strip()

    formats = [
        "%Y-%m-%d %H:%M:%S",
        "%d/%m/%Y %I:%M %p",
        "%Y-%m-%d %H:%M:%S.%f"
    ]

    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        pass

    for fmt in formats:
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue

    raise ValueError(f"Unsupported timestamp format: {value}")
