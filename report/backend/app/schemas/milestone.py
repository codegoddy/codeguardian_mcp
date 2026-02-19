from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class MilestoneBase(BaseModel):
    name: str
    description: Optional[str] = None
    order: int = 0
    target_date: Optional[datetime] = None


class MilestoneCreate(MilestoneBase):
    pass


class MilestoneUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    order: Optional[int] = None
    status: Optional[str] = None
    target_date: Optional[datetime] = None


class MilestoneResponse(MilestoneBase):
    id: UUID
    project_id: UUID
    status: str
    total_deliverables: int
    completed_deliverables: int
    ready_to_bill_deliverables: int
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
