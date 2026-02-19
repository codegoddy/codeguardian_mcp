import uuid

from sqlalchemy import JSON, Boolean, Column, DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.sql import func

from app.db.database import Base


class AutoPauseEvent(Base):
    __tablename__ = "auto_pause_events"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    project_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    event_type = Column(String(50), nullable=False, index=True)  # 'triggered', 'resolved'
    retainer_balance = Column(Numeric(10, 2), nullable=False)
    threshold_percentage = Column(Numeric(5, 2), nullable=False)

    repositories_affected = Column(JSON, nullable=True)
    access_revoked = Column(Boolean, default=False)
    access_restored = Column(Boolean, default=False)

    resolved_at = Column(DateTime(timezone=True), nullable=True)
    resolution_method = Column(String(50), nullable=True)  # 'payment', 'manual_override'

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def __str__(self):
        return f"AutoPauseEvent(id={self.id}, project_id={self.project_id}, event_type={self.event_type})"
