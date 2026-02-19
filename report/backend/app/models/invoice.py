import uuid

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.sql import func

from app.db.database import Base


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    project_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    client_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("clients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    invoice_number = Column(String(50), nullable=False, unique=True, index=True)
    status = Column(String(50), default="draft", index=True)
    # Status values: 'draft', 'sent', 'awaiting_verification', 'paid', 'cancelled'

    subtotal = Column(Numeric(10, 2), nullable=False)
    platform_fee = Column(Numeric(10, 2), default=0)
    tax_amount = Column(Numeric(10, 2), default=0)
    total_amount = Column(Numeric(10, 2), nullable=False)

    # Payment details
    payment_method = Column(String(50), nullable=True, index=True)  # 'paystack' or 'manual'
    payment_gateway_name = Column(String(100), nullable=True)
    payment_transaction_id = Column(String(255), nullable=True)
    payment_reference = Column(String(255), nullable=True)
    payment_received_at = Column(DateTime(timezone=True), nullable=True)

    # Manual payment verification
    client_marked_paid = Column(Boolean, default=False)
    client_marked_paid_at = Column(DateTime(timezone=True), nullable=True)
    developer_verified = Column(Boolean, default=False)
    developer_verified_at = Column(DateTime(timezone=True), nullable=True)

    # PDF generation
    invoice_pdf_url = Column(String(500), nullable=True)

    due_date = Column(DateTime(timezone=True), nullable=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)

    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __str__(self):
        return f"Invoice(id={self.id}, invoice_number={self.invoice_number}, status={self.status})"
