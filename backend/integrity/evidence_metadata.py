from datetime import datetime, timezone
from pathlib import Path
from .hashing import calculate_file_hash

def create_evidence_metadata(file_path, source_type):
    path = Path(file_path)
    if not path.is_file():
        raise FileNotFoundError(f"Evidence file not found: {path}")
    return {
        "filename": path.name,
        "file_path": str(path.resolve()),
        "file_size_bytes": path.stat().st_size,
        "file_extension": path.suffix.lower(),
        "source_type": source_type,
        "sha256": calculate_file_hash(path),
        "acquired_at": datetime.now(timezone.utc).isoformat(),
        "integrity_status": "VERIFIED_AT_ACQUISITION"
    }