import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.database import Base


class PaymentMilestone(Base):
    """
    Payment milestones extracted from contract payment terms.
    Tracks scheduled payments like upfront, midpoint, completion.
    """

    __tablename__ = "payment_milestones"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    project_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    name = Column(String(100), nullable=False)  # "Upfront Deposit", "Midpoint", etc.
    percentage = Column(Numeric(5, 2), nullable=False)  # 30.00 for 30%
    amount = Column(Numeric(10, 2), nullable=False)  # Calculated from budget * percentage

    # Trigger configuration
    trigger_type = Column(String(50), nullable=False)
    # Values: 'contract_signed', 'percentage_complete', 'milestone_complete', 'date', 'manual'
    trigger_value = Column(String(100), nullable=True)  # "50" for 50%, milestone_id, or ISO date

    # Status tracking
    status = Column(String(20), default="pending", index=True)
    # Values: 'pending', 'triggered', 'invoiced', 'awaiting_confirmation', 'paid'

    # Invoice relationship
    invoice_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("invoices.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Timestamps
    triggered_at = Column(DateTime(timezone=True), nullable=True)
    invoiced_at = Column(DateTime(timezone=True), nullable=True)
    paid_at = Column(DateTime(timezone=True), nullable=True)

    # Display order
    order = Column(Integer, nullable=False, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    project = relationship("Project", back_populates="payment_milestones")
    invoice = relationship("Invoice", backref="payment_milestone")

    def __str__(self):
        return f"PaymentMilestone(id={self.id}, name={self.name}, status={self.status})"
