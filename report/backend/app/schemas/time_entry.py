from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from app.common.validators import StringValidatorsMixin, validate_max_length, validate_non_negative_number


class TimeEntryBase(BaseModel):
    project_id: UUID = Field(..., description="Project ID")
    deliverable_id: Optional[UUID] = Field(default=None, description="Deliverable ID")
    description: Optional[str] = Field(default=None, max_length=1000, description="Time entry description")
    hourly_rate: Decimal = Field(..., ge=0, decimal_places=2, description="Hourly rate")


class TimeEntryCreate(TimeEntryBase):
    start_time: datetime = Field(..., description="Entry start time")
    end_time: Optional[datetime] = Field(default=None, description="Entry end time")
    duration_minutes: Optional[int] = Field(default=None, ge=0, le=1440, description="Duration in minutes (max 24 hours)")

    @model_validator(mode="after")
    def validate_times(self):
        if self.end_time and self.end_time < self.start_time:
            raise ValueError("end_time must be after start_time")

        if self.end_time and self.duration_minutes:
            expected_duration = (self.end_time - self.start_time).total_seconds() / 60
            if abs(expected_duration - self.duration_minutes) > 1:  # Allow 1 min tolerance
                raise ValueError("duration_minutes doesn't match end_time - start_time")

        return self

    @field_validator("description")
    @classmethod
    def sanitize_description(cls, v):
        if v:
            v = StringValidatorsMixin.sanitize_html(v)
            v = validate_max_length(v, 1000, "description")
        return v


class TimeEntryUpdate(BaseModel):
    description: Optional[str] = Field(default=None, max_length=1000, description="Time entry description")
    end_time: Optional[datetime] = None
    duration_minutes: Optional[int] = Field(default=None, ge=0, le=1440, description="Duration in minutes")
    is_billable: Optional[bool] = None

    @field_validator("description")
    @classmethod
    def sanitize_description(cls, v):
        if v:
            v = StringValidatorsMixin.sanitize_html(v)
            v = validate_max_length(v, 1000, "description")
        return v


class TimeEntryResponse(TimeEntryBase):
    id: UUID
    user_id: UUID
    start_time: datetime
    end_time: Optional[datetime]
    duration_minutes: Optional[int]
    cost: Optional[Decimal]
    source: str  # 'manual', 'git_commit', 'git_pr'
    git_commit_sha: Optional[str]
    git_commit_message: Optional[str]
    auto_generated: bool
    is_billable: bool
    is_billed: bool
    invoice_id: Optional[UUID]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TimeEntrySummary(BaseModel):
    total_hours: Decimal = Field(..., description="Total hours logged")
    total_cost: Decimal = Field(..., description="Total cost")
    billable_hours: Decimal = Field(..., description="Billable hours")
    billable_cost: Decimal = Field(..., description="Billable cost")
    unbilled_hours: Decimal = Field(..., description="Unbilled hours")
    unbilled_cost: Decimal = Field(..., description="Unbilled cost")
    entries_count: int = Field(..., description="Number of entries")
