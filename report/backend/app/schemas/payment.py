from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr


class InvoiceLineItem(BaseModel):
    description: str
    quantity: Decimal
    unit_price: Decimal
    total: Decimal


class InvoiceBase(BaseModel):
    project_id: UUID
    notes: Optional[str] = None


class InvoiceCreate(InvoiceBase):
    deliverable_ids: Optional[List[UUID]] = None
    change_request_ids: Optional[List[UUID]] = None
    due_date: Optional[datetime] = None


class InvoiceUpdate(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None
    due_date: Optional[datetime] = None


class InvoiceResponse(InvoiceBase):
    id: UUID
    client_id: UUID
    user_id: UUID
    invoice_number: str
    status: str
    subtotal: Decimal
    platform_fee: Decimal
    tax_amount: Decimal
    total_amount: Decimal
    payment_method: Optional[str]
    payment_gateway_name: Optional[str]
    payment_transaction_id: Optional[str]
    payment_reference: Optional[str]
    payment_received_at: Optional[datetime]
    client_marked_paid: bool
    client_marked_paid_at: Optional[datetime]
    developer_verified: bool
    developer_verified_at: Optional[datetime]
    invoice_pdf_url: Optional[str]
    due_date: Optional[datetime]
    sent_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class InvoiceSend(BaseModel):
    invoice_id: UUID


class InvoiceMarkPaid(BaseModel):
    """Client marks manual payment as paid"""

    invoice_id: UUID


class InvoiceVerifyPayment(BaseModel):
    """Developer verifies manual payment"""

    invoice_id: UUID


# Paystack Integration Schemas
class PaystackSubaccountCreate(BaseModel):
    business_name: str
    settlement_bank: str
    account_number: str


class PaystackSubaccountUpdate(BaseModel):
    business_name: Optional[str] = None
    settlement_bank: Optional[str] = None
    account_number: Optional[str] = None


class PaystackSubaccountResponse(BaseModel):
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


class PaystackBank(BaseModel):
    name: str
    code: str
    country: str


class PaymentInitialize(BaseModel):
    invoice_id: UUID
    email: EmailStr
    callback_url: Optional[str] = None


class PaymentInitializeResponse(BaseModel):
    authorization_url: str
    access_code: str
    reference: str


class PaystackWebhook(BaseModel):
    event: str
    data: Dict[str, Any]


class PaystackWebhookData(BaseModel):
    reference: str
    amount: int  # In kobo (smallest currency unit)
    status: str
    paid_at: Optional[str] = None
    customer: Dict[str, Any]
    metadata: Optional[Dict[str, Any]] = None
