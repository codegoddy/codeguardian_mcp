from datetime import datetime
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from app.common.validators import (
    StringValidatorsMixin,
    validate_max_length,
    validate_non_negative_number,
    validate_project_status,
    validate_repository_url,
    validate_time_tracker_provider,
)


class ScopeGuardrailConfig(BaseModel):
    project_budget: Decimal = Field(..., ge=0, decimal_places=2, description="Total project budget")
    auto_replenish: bool = Field(default=False, description="Auto-replenish budget when low")
    auto_pause_threshold: Decimal = Field(
        default=Decimal("10.00"),
        ge=0,
        decimal_places=2,
        description="Budget threshold to auto-pause project",
    )
    max_revisions: int = Field(default=3, ge=0, le=100, description="Maximum number of revisions")
    allowed_repositories: List[str] = Field(default_factory=list, description="List of allowed repository URLs")

    @field_validator("auto_pause_threshold")
    @classmethod
    def validate_auto_pause_threshold(cls, v, info):
        project_budget = info.data.get("project_budget")
        if project_budget and v >= project_budget:
            raise ValueError("auto_pause_threshold must be less than project_budget")
        return v

    @field_validator("allowed_repositories")
    @classmethod
    def validate_repositories(cls, v):
        for repo in v:
            validate_repository_url(repo)
        return v


class ProjectCreate(BaseModel):
    client_id: UUID = Field(..., description="Client ID")
    name: str = Field(..., min_length=1, max_length=200, description="Project name")
    description: Optional[str] = Field(default=None, max_length=2000, description="Project description")
    start_date: Optional[datetime] = Field(default=None, description="Project start date")
    due_date: Optional[datetime] = Field(default=None, description="Project due date")
    project_budget: Decimal = Field(..., ge=0, decimal_places=2, description="Total project budget")
    contract_template_id: Optional[UUID] = Field(default=None, description="Contract template ID")

    @model_validator(mode="after")
    def validate_dates(self):
        if self.start_date and self.due_date and self.due_date < self.start_date:
            raise ValueError("due_date must be after start_date")
        return self

    @field_validator("description")
    @classmethod
    def sanitize_description(cls, v):
        if v:
            v = StringValidatorsMixin.sanitize_html(v)
            v = validate_max_length(v, 2000, "description")
        return v


class ProjectCreateWithScopeGuardrail(BaseModel):
    client_id: UUID = Field(..., description="Client ID")
    name: str = Field(..., min_length=1, max_length=200, description="Project name")
    description: Optional[str] = Field(default=None, max_length=2000, description="Project description")
    start_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    project_budget: Decimal = Field(..., ge=0, decimal_places=2, description="Total project budget")
    auto_replenish: bool = Field(default=False)
    auto_pause_threshold: Decimal = Field(default=Decimal("10.00"), ge=0, decimal_places=2)
    max_revisions: int = Field(default=3, ge=0, le=100)
    allowed_repositories: List[str] = Field(default_factory=list)
    contract_template_id: Optional[UUID] = None

    @model_validator(mode="after")
    def validate_dates(self):
        if self.start_date and self.due_date and self.due_date < self.start_date:
            raise ValueError("due_date must be after start_date")
        return self


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200, description="Project name")
    description: Optional[str] = Field(default=None, max_length=2000, description="Project description")
    start_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    status: Optional[str] = Field(default=None, description="Project status")

    @field_validator("status")
    @classmethod
    def validate_status(cls, v):
        if v:
            return validate_project_status(v)
        return v

    @field_validator("description")
    @classmethod
    def sanitize_description(cls, v):
        if v:
            v = StringValidatorsMixin.sanitize_html(v)
            v = validate_max_length(v, 2000, "description")
        return v

    @model_validator(mode="after")
    def validate_dates(self):
        if self.start_date and self.due_date and self.due_date < self.start_date:
            raise ValueError("due_date must be after start_date")
        return self


class ProjectResponse(BaseModel):
    id: UUID
    user_id: UUID
    client_id: UUID
    client_name: Optional[str] = None
    name: str
    description: Optional[str]
    start_date: Optional[datetime]
    due_date: Optional[datetime]
    status: str
    project_budget: Decimal
    current_budget_remaining: Decimal
    auto_replenish: bool
    auto_pause_threshold: Decimal
    max_revisions: int
    current_revision_count: int
    allowed_repositories: Optional[List[str]]
    time_tracker_provider: Optional[str]
    time_tracker_project_name: Optional[str]
    contract_type: Optional[str]
    contract_file_url: Optional[str]
    contract_pdf_url: Optional[str]
    contract_signed: bool
    contract_signed_at: Optional[datetime]
    total_hours_tracked: Decimal
    total_revenue: Decimal
    scope_deviation_percentage: Decimal
    change_request_value_added: Decimal
    applied_template_id: Optional[UUID] = None
    applied_template_name: Optional[str] = None
    applied_template_type: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    total_entries: Optional[int] = 0
    has_active_portal: Optional[bool] = False
    portal_magic_link: Optional[str] = None
    portal_expires_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ProjectMetrics(BaseModel):
    total_hours_tracked: Decimal
    total_revenue: Decimal
    budget_remaining: Decimal
    budget_used_percentage: Decimal
    scope_deviation_percentage: Decimal
    change_request_value_added: Decimal
    deliverables_completed: int
    deliverables_total: int
    change_requests_approved: int
    change_requests_total: int
