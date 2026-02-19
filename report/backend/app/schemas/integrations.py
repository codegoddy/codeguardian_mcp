"""
Time Tracker Integration Schemas
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class TimeTrackerIntegrationCreate(BaseModel):
    """Schema for creating a time tracker integration"""

    provider: str = Field(..., description="Provider name: 'toggl' or 'harvest'")
    api_token: str = Field(..., description="API token from the provider")
    account_id: Optional[str] = Field(None, description="Account ID (required for Harvest)")


class TimeTrackerIntegrationUpdate(BaseModel):
    """Schema for updating a time tracker integration"""

    api_token: Optional[str] = Field(None, description="New API token")
    account_id: Optional[str] = Field(None, description="New Account ID")
    is_active: Optional[bool] = Field(None, description="Active status")


class TimeTrackerIntegrationResponse(BaseModel):
    """Schema for time tracker integration response"""

    id: UUID
    user_id: UUID
    provider: str
    provider_user_id: Optional[str]
    provider_username: Optional[str]
    account_id: Optional[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TimeTrackerProjectResponse(BaseModel):
    """Schema for time tracker project from external API"""

    id: str = Field(..., description="Project ID from the provider")
    name: str = Field(..., description="Project name")
    client_name: Optional[str] = Field(None, description="Client name if available")
    is_active: bool = Field(True, description="Whether the project is active")


class ProjectTimeTrackerMapping(BaseModel):
    """Schema for mapping a DevHQ project to a time tracker project"""

    project_id: UUID = Field(..., description="DevHQ project ID")
    time_tracker_provider: str = Field(..., description="'toggl' or 'harvest'")
    time_tracker_project_id: str = Field(..., description="Project ID from the time tracker")
    time_tracker_project_name: str = Field(..., description="Project name from the time tracker")
