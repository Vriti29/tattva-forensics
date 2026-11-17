from datetime import datetime
from hashlib import sha256

from backend.normalization.schemas import EvidenceRecord
from backend.detection.rule_engine import run_detection
from backend.anomaly_detection.isolation_forest import detect_anomalies
from backend.correlation.correlation_engine import correlate_evidence


def convert_timestamp(value):
    """Convert JSON timestamp strings into datetime objects."""

    if isinstance(value, datetime):
        return value

    if isinstance(value, str):
        return datetime.fromisoformat(
            value.replace("Z", "+00:00")
        )

    raise ValueError(f"Invalid timestamp: {value}")


def prepare_records(records):
    """Validate records and restore datetime fields."""

    prepared = []

    for record in records:
        data = (
            record.model_dump(mode="python")
            if isinstance(record, EvidenceRecord)
            else dict(record)
        )

        data["timestamp"] = convert_timestamp(data["timestamp"])

        prepared.append(
            EvidenceRecord.model_validate(data)
        )

    return prepared


def build_relationship_id(relationship):
    """Generate a deterministic relationship identifier."""

    identity = "|".join([
        str(relationship.get("source_evidence_id")),
        str(relationship.get("target_evidence_id")),
        str(relationship.get("relationship_type")),
        str(relationship.get("description", ""))
    ])

    digest = sha256(identity.encode("utf-8")).hexdigest()[:12]

    return f"REL-{digest.upper()}"


def analyze_evidence(records):
    """
    Run the actual Tattva forensic engines
    and return simulator-compatible results.
    """

    prepared_records = prepare_records(records)

    # 1. Rule-based detection
    detection_result = run_detection(prepared_records)

    # 2. Machine-learning anomaly detection
    anomaly_result = detect_anomalies(prepared_records)

    # 3. Evidence correlation
    correlation_result = correlate_evidence(prepared_records)

    findings = list(detection_result["findings"])

    # Include ML anomalies as separately identifiable findings.
    for index, anomaly in enumerate(
        anomaly_result["anomalies"],
        start=1
    ):
        findings.append({
            "finding_id": f"ANOM-{index:04d}",
            "finding_type": "ANOMALY_DETECTION",
            "rule_id": None,
            "title": "Unusual Activity Detected",
            "description": anomaly["reason"],
            "severity": "REVIEW_REQUIRED",
            "evidence_ids": [anomaly["evidence_id"]],
            "timestamp": anomaly["timestamp"],
            "anomaly_score": anomaly["anomaly_score"]
        })

    # Add stable IDs to correlation relationships.
    relationships = []

    for relationship in correlation_result["relationships"]:
        normalized = dict(relationship)

        normalized["relationship_id"] = build_relationship_id(
            normalized
        )

        relationships.append(normalized)

    # Convert graph edges into simulator-compatible format.
    graph = correlation_result["graph"]

    normalized_graph = {
        "nodes": list(graph.get("nodes", [])),
        "edges": []
    }

    for edge in graph.get("edges", []):
        normalized_edge = dict(edge)

        matching_relationship = next(
            (
                relationship
                for relationship in relationships
                if relationship["source_evidence_id"] == edge.get("source")
                and relationship["target_evidence_id"] == edge.get("target")
                and relationship["relationship_type"] == edge.get("relationship_type")
            ),
            None
        )

        if matching_relationship is None:
            matching_relationship = next(
                (
                    relationship
                    for relationship in relationships
                    if relationship["source_evidence_id"] == edge.get("target")
                    and relationship["target_evidence_id"] == edge.get("source")
                    and relationship["relationship_type"] == edge.get("relationship_type")
                ),
                None
            )

        if matching_relationship:
            normalized_edge["id"] = matching_relationship["relationship_id"]

        normalized_graph["edges"].append(normalized_edge)

    return {
        "findings": findings,
        "relationships": relationships,
        "graph": normalized_graph,
        "anomalies": anomaly_result["anomalies"],
        "detection": detection_result,
        "anomaly_detection": anomaly_result
    }