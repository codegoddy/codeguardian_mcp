from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class TriggerType(str, Enum):
    CONTRACT_SIGNED = "contract_signed"
    PERCENTAGE_COMPLETE = "percentage_complete"
    MILESTONE_COMPLETE = "milestone_complete"
    DATE = "date"
    MANUAL = "manual"


class PaymentMilestoneStatus(str, Enum):
    PENDING = "pending"
    TRIGGERED = "triggered"
    INVOICED = "invoiced"
    AWAITING_CONFIRMATION = "awaiting_confirmation"
    PAID = "paid"


class PaymentScheduleStatus(str, Enum):
    NOT_CONFIGURED = "not_configured"
    CONFIGURED = "configured"
    ACTIVE = "active"


# Request schemas
class PaymentMilestoneCreate(BaseModel):
    name: str = Field(..., max_length=100)
    percentage: Decimal = Field(..., ge=0, le=100)
    trigger_type: TriggerType
    trigger_value: Optional[str] = None
    order: int = 0


class PaymentMilestoneUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    percentage: Optional[Decimal] = Field(None, ge=0, le=100)
    trigger_type: Optional[TriggerType] = None
    trigger_value: Optional[str] = None
    order: Optional[int] = None


class PaymentScheduleSetup(BaseModel):
    """Setup payment schedule from parsed contract or manual input"""

    milestones: List[PaymentMilestoneCreate]


# Response schemas
class PaymentMilestoneResponse(BaseModel):
    id: UUID
    project_id: UUID
    name: str
    percentage: Decimal
    amount: Decimal
    trigger_type: str
    trigger_value: Optional[str]
    status: str
    invoice_id: Optional[UUID]
    triggered_at: Optional[datetime]
    invoiced_at: Optional[datetime]
    paid_at: Optional[datetime]
    order: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PaymentScheduleResponse(BaseModel):
    """Response for project payment schedule"""

    project_id: UUID
    status: str  # not_configured, configured, active
    total_budget: Decimal
    milestones: List[PaymentMilestoneResponse]
    total_paid: Decimal
    total_pending: Decimal
    next_payment: Optional[PaymentMilestoneResponse]


class ParsedPaymentTerm(BaseModel):
    """Result from AI parsing of contract payment terms"""

    name: str
    percentage: Decimal
    trigger_type: TriggerType
    trigger_value: Optional[str] = None


class PaymentTermsParseResult(BaseModel):
    """Result from parsing contract for payment terms"""

    found: bool
    terms: List[ParsedPaymentTerm]
    raw_text: Optional[str] = None  # Extracted text that was parsed
