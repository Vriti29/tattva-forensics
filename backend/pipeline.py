from pathlib import Path
from uuid import uuid4

from backend.ingestion.file_handler import validate_file, read_file
from backend.ingestion.auth_parser import parse_auth_log
from backend.ingestion.file_parser import parse_file_log
from backend.ingestion.network_parser import parse_network_log
from backend.ingestion.archive_parser import parse_archive_log

from backend.normalization.normalizer import normalize_records
from backend.integrity.hashing import calculate_record_hash
from backend.integrity.evidence_metadata import create_evidence_metadata
from backend.detection.rule_engine import run_detection
from backend.anomaly_detection.isolation_forest import detect_anomalies
from backend.correlation.correlation_engine import correlate_evidence
from backend.ingestion.structured_parser import parse_structured_content
PARSERS = {
    "authentication": parse_auth_log,
    "file": parse_file_log,
    "network": parse_network_log,
    "archive": parse_archive_log
}

def process_evidence_file(file_path, source_type):
    if source_type not in PARSERS:
        raise ValueError(f"Unsupported source type: {source_type}")

    validate_file(file_path)
    content = read_file(file_path)

    # 1. Preserve original file metadata and calculate its hash
    metadata = create_evidence_metadata(file_path, source_type)
    source_id = f"SRC-{uuid4().hex[:8].upper()}"

   # 2. Parse raw evidence records
    extension = Path(file_path).suffix.lower()
    
    if extension in {".csv", ".json"}:
        parser_result = parse_structured_content(
            content,
            source_type,
            extension
        )
    else:
        parser_result = PARSERS[source_type](content)

    # 3. Normalize parsed records
    normalization_result = normalize_records(
        parser_result["records"],
        source_id=source_id
    )

    records = normalization_result["records"]

    # 4. Calculate individual record hashes
    for record in records:
        record.record_sha256 = calculate_record_hash(record)

    # 5. Run rule-based detection
    detection_result = run_detection(records)

    # 6. Run anomaly detection
    anomaly_result = detect_anomalies(records)

    # 7. Correlate evidence and build graph
    correlation_result = correlate_evidence(records)

    return {
        "source_id": source_id,
        "metadata": metadata,
        "ingestion": {
            "total_records": parser_result["total_records"],
            "successful_records": parser_result["successful_records"],
            "failed_records": parser_result["failed_records"],
            "errors": parser_result["errors"]
        },
        "normalization": {
            "total_records": normalization_result["total_records"],
            "successful_records": normalization_result["successful_records"],
            "failed_records": normalization_result["failed_records"],
            "errors": normalization_result["errors"]
        },
        "evidence_records": [
            record.model_dump(mode="json") for record in records
        ],
        "detection": detection_result,
        "anomaly_detection": anomaly_result,
        "correlation": correlation_result
    }