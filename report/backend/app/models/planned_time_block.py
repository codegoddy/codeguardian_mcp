import uuid

from sqlalchemy import Column, Date, DateTime, ForeignKey, Numeric, String, Text, Time
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.database import Base


class PlannedTimeBlock(Base):
    __tablename__ = "planned_time_blocks"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
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

    planned_date = Column(Date, nullable=False, index=True)
    start_time = Column(Time, nullable=True)
    end_time = Column(Time, nullable=True)
    planned_hours = Column(Numeric(5, 2), nullable=False)
    description = Column(Text, nullable=True)

    google_calendar_event_id = Column(String(255), nullable=True)
    status = Column(String(20), default="planned", nullable=False, index=True)
    # Status values: 'planned', 'in_progress', 'completed', 'missed'

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="planned_time_blocks")
    project = relationship("Project")
    deliverable = relationship("Deliverable")

    def __str__(self):
        return f"PlannedTimeBlock(id={self.id}, deliverable_id={self.deliverable_id}, date={self.planned_date}, hours={self.planned_hours})"
