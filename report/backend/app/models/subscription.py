import uuid

from sqlalchemy import DECIMAL, Boolean, Column, DateTime, Integer, String
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.sql import func

from app.db.database import Base


class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(PGUUID(as_uuid=True), nullable=False, unique=True, index=True)

    plan = Column(String(50), nullable=False, default="free")  # 'free', 'pro', 'enterprise'
    status = Column(String(50), default="active")  # 'active', 'cancelled', 'expired', 'trial'

    # Subscription details
    started_at = Column(DateTime(timezone=True), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)

    # Payment
    payment_method = Column(String(50), nullable=True)  # 'paystack', 'manual'
    payment_reference = Column(String(255), nullable=True)
    amount = Column(DECIMAL(10, 2), nullable=True)
    currency = Column(String(3), default="USD")

    # Features
    paystack_fee_waived = Column(Boolean, default=False)  # True for paid subscribers
    max_projects = Column(Integer, nullable=True)  # NULL for unlimited
    max_clients = Column(Integer, nullable=True)  # NULL for unlimited

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __str__(self):
        return f"Subscription(user_id={self.user_id}, plan={self.plan}, status={self.status})"
