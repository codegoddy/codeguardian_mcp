import uuid

from sqlalchemy import Boolean, Column, DateTime, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.sql import func

from app.db.database import Base


class PaystackSubaccount(Base):
    __tablename__ = "paystack_subaccounts"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(PGUUID(as_uuid=True), nullable=False, unique=True, index=True)

    subaccount_code = Column(String(255), nullable=False, unique=True, index=True)
    business_name = Column(String(255), nullable=False)
    settlement_bank = Column(String(255), nullable=False)
    account_number = Column(String(50), nullable=False)

    percentage_charge = Column(Numeric(5, 2), default=1.50)

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __str__(self):
        return f"PaystackSubaccount(user_id={self.user_id}, subaccount_code={self.subaccount_code})"
