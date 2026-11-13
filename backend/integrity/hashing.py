import hashlib
import json

def calculate_file_hash(file_path):
    sha256 = hashlib.sha256()
    with open(file_path, "rb") as file:
        for chunk in iter(lambda: file.read(4096), b""):
            sha256.update(chunk)
    return sha256.hexdigest()

def calculate_record_hash(record):
    if hasattr(record, "model_dump"):
        record = record.model_dump(mode="json")
    elif hasattr(record, "dict"):
        record = record.dict()
    serialized = json.dumps(record, sort_keys=True, default=str, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()