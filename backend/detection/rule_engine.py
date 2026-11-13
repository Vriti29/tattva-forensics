from datetime import timedelta
from .rules import (
    RULES, FAILED_LOGIN_THRESHOLD, LOGIN_WINDOW_MINUTES,
    MULTIPLE_IP_WINDOW_MINUTES, LARGE_TRANSFER_BYTES,
    UNUSUAL_HOURS, SENSITIVE_PATH_KEYWORDS
)
from .finding_generator import create_finding

def _get(record, key, default=None):
    return record.get(key, default) if isinstance(record, dict) else getattr(record, key, default)

def _sort_records(records):
    return sorted(records, key=lambda record: _get(record, "timestamp"))

def _finding(rule_id, records, severity="MEDIUM"):
    return create_finding(
        rule_id, RULES[rule_id],
        f"Detection rule triggered: {RULES[rule_id]}.",
        records, severity
    )

def detect_repeated_failed_logins(records):
    findings = []
    failed = [r for r in records if _get(r, "event_type") == "LOGIN_FAILED"]
    users = set(_get(r, "user_id") for r in failed if _get(r, "user_id"))
    for user in users:
        user_records = _sort_records([r for r in failed if _get(r, "user_id") == user])
        for index, record in enumerate(user_records):
            window = [
                r for r in user_records[index:]
                if _get(r, "timestamp") <= _get(record, "timestamp") + timedelta(minutes=LOGIN_WINDOW_MINUTES)
            ]
            if len(window) >= FAILED_LOGIN_THRESHOLD:
                findings.append(_finding("R01", window, "HIGH"))
                break
    return findings

def detect_success_after_failures(records):
    findings = []
    for success in records:
        if _get(success, "event_type") != "LOGIN_SUCCESS":
            continue
        user = _get(success, "user_id")
        timestamp = _get(success, "timestamp")
        previous = [
            r for r in records
            if _get(r, "event_type") == "LOGIN_FAILED"
            and _get(r, "user_id") == user
            and timedelta(0) <= timestamp - _get(r, "timestamp") <= timedelta(minutes=LOGIN_WINDOW_MINUTES)
        ]
        if len(previous) >= FAILED_LOGIN_THRESHOLD:
            findings.append(_finding("R02", _sort_records(previous + [success]), "HIGH"))
    return findings

def detect_unusual_hour_logins(records):
    findings = []
    for record in records:
        timestamp = _get(record, "timestamp")
        if (
            _get(record, "event_type") == "LOGIN_SUCCESS"
            and (timestamp.hour >= 22 or timestamp.hour < 6)
        ):
            findings.append(_finding("R03", [record], "MEDIUM"))
    return findings

def detect_sensitive_file_access(records):
    findings = []
    for record in records:
        path = str(_get(record, "file_path", "")).lower()
        if (
            _get(record, "event_type") in {"FILE_ACCESS", "FILE_MODIFIED", "FILE_DELETED"}
            and any(keyword in path for keyword in SENSITIVE_PATH_KEYWORDS)
        ):
            findings.append(_finding("R04", [record], "HIGH"))
    return findings

def detect_archive_after_file_access(records):
    findings = []
    for archive in records:
        if _get(archive, "event_type") != "ARCHIVE_CREATED":
            continue
        user = _get(archive, "user_id")
        host = _get(archive, "host_id")
        timestamp = _get(archive, "timestamp")
        related = [
            r for r in records
            if _get(r, "event_type") in {"FILE_ACCESS", "FILE_MODIFIED"}
            and _get(r, "user_id") == user
            and _get(r, "host_id") == host
            and timedelta(0) <= timestamp - _get(r, "timestamp") <= timedelta(minutes=30)
        ]
        if related:
            findings.append(_finding("R05", _sort_records(related + [archive]), "HIGH"))
    return findings

def detect_large_outbound_transfer(records):
    findings = []
    for record in records:
        if (
            _get(record, "event_type") == "DATA_TRANSFER"
            and (_get(record, "transfer_size_bytes") or 0) >= LARGE_TRANSFER_BYTES
        ):
            findings.append(_finding("R06", [record], "HIGH"))
    return findings

def detect_multiple_ips(records):
    findings = []
    users = set(_get(r, "user_id") for r in records if _get(r, "user_id"))
    for user in users:
        user_records = _sort_records([
            r for r in records
            if _get(r, "user_id") == user
            and _get(r, "event_type") in {"LOGIN_SUCCESS", "LOGIN_FAILED"}
        ])
        for index, record in enumerate(user_records):
            window = [
                r for r in user_records[index:]
                if _get(r, "timestamp") <= _get(record, "timestamp") + timedelta(minutes=MULTIPLE_IP_WINDOW_MINUTES)
            ]
            ips = {
                _get(r, "ip_address") or _get(r, "source_ip")
                for r in window
            } - {None}
            if len(ips) > 1:
                findings.append(_finding("R07", window, "MEDIUM"))
                break
    return findings

def run_detection(records):
    records = list(records)
    detectors = [
        detect_repeated_failed_logins,
        detect_success_after_failures,
        detect_unusual_hour_logins,
        detect_sensitive_file_access,
        detect_archive_after_file_access,
        detect_large_outbound_transfer,
        detect_multiple_ips
    ]
    findings = []
    for detector in detectors:
        findings.extend(detector(records))
    for index, finding in enumerate(findings, start=1):
        finding["finding_id"] = f"F-{index:04d}"
    return {
        "findings": findings,
        "total_findings": len(findings),
        "rules_evaluated": len(detectors)
    }