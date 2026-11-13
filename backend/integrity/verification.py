from .hashing import calculate_file_hash, calculate_record_hash

def verify_file_integrity(file_path, original_hash):
    current_hash = calculate_file_hash(file_path)
    return {
        "is_intact": current_hash == original_hash,
        "original_hash": original_hash,
        "current_hash": current_hash
    }

def verify_record_integrity(record, original_hash):
    current_hash = calculate_record_hash(record)
    return {
        "is_intact": current_hash == original_hash,
        "original_hash": original_hash,
        "current_hash": current_hash
    }