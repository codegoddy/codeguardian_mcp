import uuid

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.sql import func

from app.db.database import Base


class Milestone(Base):
    __tablename__ = "milestones"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    project_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    order = Column(Integer, default=0)  # For ordering milestones
    status = Column(String(50), default="pending", index=True)
    # Status values: 'pending', 'in_progress', 'completed', 'billed'

    # Completion tracking
    total_deliverables = Column(Integer, default=0)
    completed_deliverables = Column(Integer, default=0)
    ready_to_bill_deliverables = Column(Integer, default=0)

    # Dates
    target_date = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __str__(self):
        return f"Milestone(id={self.id}, name={self.name}, status={self.status})"
