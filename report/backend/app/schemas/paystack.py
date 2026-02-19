from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class PaystackBankResponse(BaseModel):
    """Response model for Paystack bank list"""

    id: int
    name: str
    slug: str
    code: str
    longcode: str
    gateway: Optional[str] = None
    pay_with_bank: bool
    active: bool
    is_deleted: bool
    country: str
    currency: str
    type: str


class SubaccountCreate(BaseModel):
    """Request model for creating a Paystack subaccount"""

    business_name: str = Field(..., min_length=1, max_length=255)
    settlement_bank: str = Field(..., description="Bank code from Paystack banks list")
    account_number: str = Field(..., min_length=10, max_length=10, description="10-digit account number")
    percentage_charge: Optional[Decimal] = Field(default=Decimal("1.50"), ge=0, le=100)


class SubaccountUpdate(BaseModel):
    """Request model for updating a Paystack subaccount"""

    business_name: Optional[str] = Field(None, min_length=1, max_length=255)
    settlement_bank: Optional[str] = None
    account_number: Optional[str] = Field(None, min_length=10, max_length=10)
    percentage_charge: Optional[Decimal] = Field(None, ge=0, le=100)
    is_active: Optional[bool] = None


class SubaccountResponse(BaseModel):
    """Response model for Paystack subaccount"""

    id: UUID
    user_id: UUID
    subaccount_code: str
    business_name: str
    settlement_bank: str
    account_number: str
    percentage_charge: Decimal
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PaymentInitializeRequest(BaseModel):
    """Request model for initializing a payment"""

    invoice_id: UUID
    callback_url: Optional[str] = None


class PaymentInitializeResponse(BaseModel):
    """Response model for payment initialization"""

    authorization_url: str
    access_code: str
    reference: str


class PaystackWebhookEvent(BaseModel):
    """Model for Paystack webhook event"""

    event: str
    data: dict
