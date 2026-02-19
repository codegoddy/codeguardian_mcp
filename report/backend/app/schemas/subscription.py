from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class SubscriptionPlanBase(BaseModel):
    name: str
    description: Optional[str] = None
    price: Decimal
    currency: str = "USD"
    billing_period: str  # 'monthly', 'yearly'


class SubscriptionPlan(SubscriptionPlanBase):
    """Subscription plan details"""

    features: list[str]
    max_projects: Optional[int] = None  # None = unlimited
    max_clients: Optional[int] = None  # None = unlimited
    paystack_fee_waived: bool = False
    manual_payment_enabled: bool = False


class SubscriptionCreate(BaseModel):
    plan: str  # 'free', 'pro', 'enterprise'
    payment_method: str  # 'paystack', 'manual'
    payment_reference: Optional[str] = None


class SubscriptionUpdate(BaseModel):
    status: Optional[str] = None
    expires_at: Optional[datetime] = None


class SubscriptionResponse(BaseModel):
    id: UUID
    user_id: UUID
    plan: str
    status: str
    started_at: datetime
    expires_at: Optional[datetime]
    cancelled_at: Optional[datetime]
    payment_method: Optional[str]
    payment_reference: Optional[str]
    amount: Optional[Decimal]
    currency: str
    paystack_fee_waived: bool
    max_projects: Optional[int]
    max_clients: Optional[int]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SubscriptionCancel(BaseModel):
    reason: Optional[str] = None


class SubscriptionFeatures(BaseModel):
    """Current subscription features for the user"""

    plan: str
    paystack_fee_waived: bool
    manual_payment_enabled: bool
    max_projects: Optional[int]
    max_clients: Optional[int]
    is_active: bool
