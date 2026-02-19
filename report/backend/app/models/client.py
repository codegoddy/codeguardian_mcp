import secrets
import uuid

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.sql import func

from app.db.database import Base


class Client(Base):
    __tablename__ = "clients"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False, index=True)
    company = Column(String(255), nullable=True)
    default_hourly_rate = Column(Numeric(10, 2), nullable=False)
    change_request_rate = Column(Numeric(10, 2), nullable=False)

    # Payment configuration
    payment_method = Column(String(50), nullable=False)  # 'paystack' or 'manual'
    payment_gateway_name = Column(String(100), nullable=True)  # For manual: 'Bank Transfer', 'PayPal', 'Wise', etc.
    payment_instructions = Column(Text, nullable=True)  # For manual: bank details, PayPal email, etc.

    # Paystack integration
    paystack_subaccount_code = Column(String(255), nullable=True)  # Paystack subaccount ID
    paystack_customer_code = Column(String(255), nullable=True)

    # Passwordless portal access
    portal_access_token = Column(String(255), unique=True, nullable=True, index=True)  # Permanent client identifier

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __str__(self):
        return f"Client(id={self.id}, name={self.name}, email={self.email})"

    def generate_portal_token(self):
        """Generate a unique portal access token for the client"""
        if not self.portal_access_token:
            self.portal_access_token = secrets.token_urlsafe(32)
        return self.portal_access_token
