import uuid

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.database import Base


class ChangeRequest(Base):
    __tablename__ = "change_requests"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    project_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    status = Column(String(50), default="pending", index=True)  # pending, approved, rejected, completed, billed

    estimated_hours = Column(Numeric(10, 2), nullable=False)
    hourly_rate = Column(Numeric(10, 2), nullable=False)
    total_cost = Column(Numeric(10, 2), nullable=False)

    # Payment tracking
    payment_required = Column(Boolean, default=True)
    payment_received = Column(Boolean, default=False)
    payment_transaction_id = Column(String(255))

    # Revision tracking
    revision_count = Column(Integer, default=0)
    max_revisions = Column(Integer, default=3)

    approved_at = Column(DateTime(timezone=True))
    completed_at = Column(DateTime(timezone=True))

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    project = relationship("Project", back_populates="change_requests")
