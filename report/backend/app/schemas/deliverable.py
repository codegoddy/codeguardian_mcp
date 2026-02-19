from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class DeliverableBase(BaseModel):
    project_id: UUID
    milestone_id: Optional[UUID] = None
    task_reference: Optional[str] = None  # e.g., "DEVHQ-101"
    title: str
    description: Optional[str] = None
    acceptance_criteria: Optional[str] = None
    is_in_scope: bool = True


class DeliverableCreate(DeliverableBase):
    estimated_hours: Optional[Decimal] = None


class DeliverableUpdate(BaseModel):
    milestone_id: Optional[UUID] = None
    task_reference: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    acceptance_criteria: Optional[str] = None
    status: Optional[str] = None
    is_in_scope: Optional[bool] = None
    is_approved: Optional[bool] = None
    git_pr_url: Optional[str] = None
    git_pr_number: Optional[int] = None
    git_branch_name: Optional[str] = None
    preview_url: Optional[str] = None
    estimated_hours: Optional[Decimal] = None


class DeliverableResponse(DeliverableBase):
    id: UUID
    milestone_id: Optional[UUID] = None
    tracking_code: Optional[str] = None
    git_branch_pattern: Optional[str] = None
    status: str
    is_approved: bool
    git_pr_url: Optional[str]
    git_pr_number: Optional[int]
    git_commit_hash: Optional[str]
    git_merge_status: Optional[str]
    git_branch_name: Optional[str]
    preview_url: Optional[str]
    verified_at: Optional[datetime]
    auto_verified: bool
    documentation_markdown: Optional[str]
    documentation_generated_at: Optional[datetime]
    estimated_hours: Optional[Decimal]
    actual_hours: Decimal
    total_cost: Decimal
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DeliverableVerification(BaseModel):
    pr_url: str
    manual_override: bool = False
    justification: Optional[str] = None
