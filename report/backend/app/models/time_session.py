"""Time session model for CLI-based time tracking."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.db.database import Base


class TimeSession(Base):
    """Active time tracking sessions from CLI."""

    __tablename__ = "time_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    project_id = Column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )
    deliverable_id = Column(
        UUID(as_uuid=True),
        ForeignKey("deliverables.id", ondelete="CASCADE"),
        nullable=False,
    )
    tracking_code = Column(String(50), nullable=False)
    work_type = Column(String(50), nullable=True)

    # Session state
    status = Column(String(20), nullable=False)  # 'active', 'paused', 'completed'
    start_time = Column(DateTime(timezone=True), nullable=False)
    end_time = Column(DateTime(timezone=True), nullable=True)

    # Time tracking
    accumulated_minutes = Column(Integer, default=0)
    pause_duration_minutes = Column(Integer, default=0)

    # Metadata
    client_session_id = Column(String(100), unique=True)  # From CLI for idempotency
    last_heartbeat = Column(DateTime(timezone=True), nullable=True)

    # Auto-pause/stop tracking
    auto_paused = Column(Boolean, default=False)
    auto_stopped = Column(Boolean, default=False)
    stop_reason = Column(String(50), nullable=True)  # 'manual', 'inactivity', 'max_duration'

    # Completion data
    commit_message = Column(String, nullable=True)
    commit_sha = Column(String(100), nullable=True)
    deliverable_status_after = Column(String(50), nullable=True)  # Status to set on deliverable
    developer_notes = Column(Text, nullable=True)
    notes_visible_to_client = Column(Boolean, default=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    user = relationship("User", back_populates="time_sessions")
    project = relationship("Project")
    deliverable = relationship("Deliverable")

    # Indexes
    __table_args__ = (
        Index("idx_time_sessions_user_status", "user_id", "status"),
        Index("idx_time_sessions_deliverable", "deliverable_id"),
        Index("idx_time_sessions_tracking_code", "tracking_code"),
        # Unique constraint: one active session per user per deliverable
        Index(
            "idx_time_sessions_active_unique",
            "user_id",
            "deliverable_id",
            unique=True,
            postgresql_where=(status == "active"),
        ),
    )

    def __repr__(self):
        return f"<TimeSession {self.tracking_code} - {self.status}>"
