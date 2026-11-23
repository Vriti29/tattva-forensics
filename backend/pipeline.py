from pathlib import Path
from uuid import uuid4

from backend.ingestion.file_handler import validate_file, read_file
from backend.ingestion.auth_parser import parse_auth_log
from backend.ingestion.file_parser import parse_file_log
from backend.ingestion.network_parser import parse_network_log
from backend.ingestion.archive_parser import parse_archive_log

from backend.normalization.normalizer import normalize_records
from backend.normalization.timestamp_handler import (
    ensure_compatible_timestamps,
    normalize_timestamp,
    original_timestamp,
)
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


def _raise_invalid_timestamp_errors(errors, stage):
    for error in errors:
        message = error.get("error", "")
        if message.startswith("Invalid timestamp"):
            location = error.get(
                "record_number",
                error.get("line_number", "unknown"),
            )
            raise ValueError(
                f"Timestamp validation failed in {stage} record "
                f"{location}: {message}"
            )


def process_evidence_file(
    file_path,
    source_type,
    original_filename=None,
    evidence_id_prefix=None
):
    if source_type not in PARSERS:
        raise ValueError(f"Unsupported source type: {source_type}")

    validate_file(file_path)
    content = read_file(file_path)

    # 1. Preserve original file metadata and calculate its hash
    metadata = create_evidence_metadata(
        file_path,
        source_type,
        filename=original_filename
    )
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

    _raise_invalid_timestamp_errors(parser_result["errors"], "input")

    # 3. Normalize parsed records
    normalization_result = normalize_records(
        parser_result["records"],
        source_id=source_id,
        evidence_id_prefix=evidence_id_prefix
    )
    _raise_invalid_timestamp_errors(
        normalization_result["errors"],
        "normalized",
    )

    records = normalization_result["records"]

    # 4. Calculate individual record hashes
    for record in records:
        record.record_sha256 = calculate_record_hash(record)

    analysis = analyze_evidence_records(
        [record.model_dump(mode="json") for record in records]
    )

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
        **analysis
    }


def analyze_evidence_records(records):
    """Run the forensic engines over a combined set of evidence records."""
    from backend.normalization.schemas import EvidenceRecord

    prepared_records = []
    for record in records:
        data = (
            record.model_dump(mode="python")
            if isinstance(record, EvidenceRecord)
            else dict(record)
        )
        raw_timestamp = data.get("timestamp")
        if not data.get("original_timestamp"):
            data["original_timestamp"] = original_timestamp(raw_timestamp)
        data["timestamp"] = normalize_timestamp(raw_timestamp)
        prepared_records.append(EvidenceRecord.model_validate(data))

    normalized_timestamps = ensure_compatible_timestamps(
        [record.timestamp for record in prepared_records]
    )
    prepared_records = [
        record.model_copy(update={"timestamp": timestamp})
        for record, timestamp in zip(prepared_records, normalized_timestamps)
    ]

    return {
        "evidence_records": [
            record.model_dump(mode="json")
            for record in prepared_records
        ],
        "detection": run_detection(prepared_records),
        "anomaly_detection": detect_anomalies(prepared_records),
        "correlation": correlate_evidence(prepared_records)
    }