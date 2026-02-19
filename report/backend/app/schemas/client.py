from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.common.validators import (
    StringValidatorsMixin,
    validate_max_length,
    validate_payment_method,
    validate_paystack_customer_code,
    validate_paystack_subaccount_code,
)


class ClientBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200, description="Client name")
    email: EmailStr = Field(..., description="Client email address")
    company: Optional[str] = Field(default=None, max_length=200, description="Client company name")
    default_hourly_rate: Decimal = Field(..., ge=0, description="Default hourly rate for this client")
    change_request_rate: Decimal = Field(..., ge=0, description="Hourly rate for change requests")
    payment_method: str = Field(..., description="Payment method: 'paystack' or 'manual'")

    @field_validator("payment_method")
    @classmethod
    def validate_payment_method(cls, v):
        return validate_payment_method(v)


class ClientCreate(ClientBase):
    payment_gateway_name: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Payment gateway name for manual payments",
    )
    payment_instructions: Optional[str] = Field(
        default=None,
        max_length=1000,
        description="Payment instructions for manual payments",
    )
    paystack_subaccount_code: Optional[str] = Field(default=None, description="Paystack subaccount code")
    paystack_customer_code: Optional[str] = Field(default=None, description="Paystack customer code")

    @field_validator("paystack_subaccount_code")
    @classmethod
    def validate_subaccount_code(cls, v):
        return validate_paystack_subaccount_code(v)

    @field_validator("paystack_customer_code")
    @classmethod
    def validate_customer_code(cls, v):
        return validate_paystack_customer_code(v)

    @field_validator("payment_gateway_name")
    @classmethod
    def validate_gateway_name(cls, v):
        if v:
            v = validate_max_length(v, 100, "payment_gateway_name")
        return v

    @field_validator("payment_instructions")
    @classmethod
    def validate_instructions(cls, v):
        if v:
            v = StringValidatorsMixin.sanitize_html(v)
            v = validate_max_length(v, 1000, "payment_instructions")
        return v


class ClientUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200, description="Client name")
    email: Optional[EmailStr] = None
    company: Optional[str] = Field(default=None, max_length=200, description="Client company name")
    default_hourly_rate: Optional[Decimal] = Field(default=None, ge=0, description="Default hourly rate")
    change_request_rate: Optional[Decimal] = Field(default=None, ge=0, description="Hourly rate for change requests")
    payment_method: Optional[str] = Field(default=None, description="Payment method: 'paystack' or 'manual'")
    payment_gateway_name: Optional[str] = Field(default=None, max_length=100, description="Payment gateway name")
    payment_instructions: Optional[str] = Field(default=None, max_length=1000, description="Payment instructions")
    paystack_subaccount_code: Optional[str] = None
    paystack_customer_code: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("payment_method")
    @classmethod
    def validate_payment_method(cls, v):
        if v:
            return validate_payment_method(v)
        return v

    @field_validator("paystack_subaccount_code")
    @classmethod
    def validate_subaccount_code(cls, v):
        return validate_paystack_subaccount_code(v)

    @field_validator("paystack_customer_code")
    @classmethod
    def validate_customer_code(cls, v):
        return validate_paystack_customer_code(v)


class ClientResponse(ClientBase):
    id: UUID
    user_id: UUID
    payment_gateway_name: Optional[str]
    payment_instructions: Optional[str]
    paystack_subaccount_code: Optional[str]
    paystack_customer_code: Optional[str]
    portal_access_token: Optional[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
