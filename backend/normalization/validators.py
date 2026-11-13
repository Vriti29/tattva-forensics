
from .schemas import EvidenceRecord

def validate_evidence(record):
    return EvidenceRecord(**record)

def validate_evidence_collection(records):
    valid_records = []
    errors = []

    for index, record in enumerate(records, start=1):
        try:
            valid_records.append(validate_evidence(record))
        except Exception as error:
            errors.append({
                "record_number": index,
                "error": str(error)
            })

    return valid_records, errors
