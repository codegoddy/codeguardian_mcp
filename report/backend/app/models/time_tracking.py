"""Time tracking models"""

import uuid

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.sql import func

from app.db.database import Base


class CommitParserConfig(Base):
    """Configuration for parsing commit messages"""

    __tablename__ = "commit_parser_configs"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    project_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True)

    # Deliverable ID patterns
    id_pattern = Column(String(255), default="DEVHQ-{id}")
    id_regex = Column(String(500))

    # Status keywords
    completion_keywords = Column(JSON)
    progress_keywords = Column(JSON)
    start_keywords = Column(JSON)
    break_keywords = Column(JSON)

    # Time extraction
    time_pattern = Column(String(100), default="[{time}h]")
    time_regex = Column(String(500))

    # Commit conventions
    use_conventional_commits = Column(Boolean, default=True)
    conventional_types = Column(JSON)

    # Auto-detection
    auto_detect_patterns = Column(Boolean, default=True)
    case_sensitive = Column(Boolean, default=False)

    # Custom rules
    custom_rules = Column(JSON)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class TimeEntry(Base):
    """Time entry from commits or manual input"""

    __tablename__ = "time_entries"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    project_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )
    deliverable_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("deliverables.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # Time entry details
    description = Column(Text)
    start_time = Column(DateTime(timezone=True))
    end_time = Column(DateTime(timezone=True))
    duration_minutes = Column(Integer)
    final_hours = Column(Numeric(10, 2))  # Final hours for billing (CLI or calculated from commits)

    # Notes
    developer_notes = Column(Text, nullable=True)
    notes_visible_to_client = Column(Boolean, default=False)

    # Attachments and preview links
    attachments = Column(JSON, nullable=True)  # Array of {url, filename, type, size}
    preview_links = Column(JSON, nullable=True)  # Array of {url, title, description}

    # Billing
    hourly_rate = Column(Numeric(10, 2))
    cost = Column(Numeric(10, 2))
    currency = Column(String(3), default="USD")

    # Source tracking
    source = Column(String(50))  # 'manual', 'git', 'time_tracker', etc.
    git_commit_sha = Column(String(100))
    git_commit_message = Column(Text)

    # Status
    auto_generated = Column(Boolean, default=False)
    is_billable = Column(Boolean, default=True)
    is_billed = Column(Boolean, default=False)
    invoice_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("invoices.id", ondelete="SET NULL"),
        nullable=True,
    )

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class CommitReview(Base):
    """Pending commit reviews before sending to client"""

    __tablename__ = "commit_reviews"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    project_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Commit info
    commit_hash = Column(String(40), nullable=False, index=True)
    commit_message = Column(Text)
    commit_author = Column(String(255))
    commit_timestamp = Column(DateTime(timezone=True))

    # Parsed data
    deliverable_id = Column(PGUUID(as_uuid=True), ForeignKey("deliverables.id", ondelete="SET NULL"))
    parsed_hours = Column(Numeric(10, 2))

    # Manual adjustments
    manual_hours = Column(Numeric(10, 2))
    manual_notes = Column(Text)

    # Review status
    status = Column(String(50), default="pending", index=True)  # pending, reviewed, rejected
    reviewed_by = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    reviewed_at = Column(DateTime(timezone=True))

    # Client portal
    sent_to_client = Column(Boolean, default=False)
    email_sent = Column(Boolean, default=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
