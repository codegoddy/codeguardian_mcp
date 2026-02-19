from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class ChangeRequestBase(BaseModel):
    title: str
    description: str
    estimated_hours: Decimal


class ChangeRequestCreate(ChangeRequestBase):
    project_id: UUID


class ChangeRequestUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    estimated_hours: Optional[Decimal] = None
    status: Optional[str] = None


class ChangeRequestResponse(ChangeRequestBase):
    id: UUID
    project_id: UUID
    status: str
    hourly_rate: Decimal
    total_cost: Decimal
    payment_required: bool
    payment_received: bool
    payment_transaction_id: Optional[str]
    revision_count: int
    max_revisions: int
    approved_at: Optional[datetime]
    completed_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ChangeRequestApprove(BaseModel):
    pass


class ChangeRequestReject(BaseModel):
    pass


class ChangeRequestComplete(BaseModel):
    pass
