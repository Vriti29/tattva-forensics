

from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime
from typing import Optional

class EvidenceRecord(BaseModel):
    model_config = ConfigDict(extra="allow")

    evidence_id: str
    source_id: Optional[str] = None
    timestamp: datetime
    source_type: str
    original_event_type: str
    event_type: str
    user_id: Optional[str] = None
    ip_address: Optional[str] = None
    source_ip: Optional[str] = None
    destination_ip: Optional[str] = None
    host_id: Optional[str] = None
    file_id: Optional[str] = None
    file_path: Optional[str] = None
    operation: Optional[str] = None
    transfer_size_bytes: Optional[int] = None
    archive_id: Optional[str] = None
    archive_path: Optional[str] = None
    archive_size_bytes: Optional[int] = None
    raw_record_reference: str
    record_sha256: Optional[str] = None
