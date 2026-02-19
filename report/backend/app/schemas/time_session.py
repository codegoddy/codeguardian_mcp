"""Pydantic schemas for time tracking sessions."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class SessionStartRequest(BaseModel):
    """Request to start a time tracking session."""

    tracking_code: str = Field(..., description="Deliverable tracking code (e.g., WEB-123)")
    client_session_id: str = Field(..., description="Unique ID from CLI for idempotency")
    work_type: Optional[str] = Field(None, description="Type of work (feature, bugfix, etc.)")
    repo_url: Optional[str] = Field(None, description="Git remote URL")


class SessionStopRequest(BaseModel):
    """Request to stop a time tracking session."""

    session_id: UUID = Field(..., description="ID of the session to stop")
    commit_message: Optional[str] = Field(None, description="Git commit message")
    commit_sha: Optional[str] = Field(None, description="Git commit SHA")
    deliverable_status_after: Optional[str] = Field(None, description="Status to set on deliverable")
    developer_notes: Optional[str] = Field(None, description="Developer notes for the session")
    accumulated_seconds: Optional[int] = Field(None, description="Total accumulated seconds from CLI (for verification)")


class SessionHeartbeatRequest(BaseModel):
    """Heartbeat from CLI to keep session alive."""

    session_id: UUID
    activity_type: Optional[str] = Field(None, description="Type of activity: git, file, manual")
    activity_data: Optional[dict] = Field(None, description="Additional activity metadata")


class TimeSessionResponse(BaseModel):
    """Response with session information."""

    id: UUID
    tracking_code: str
    project_id: UUID
    deliverable_id: UUID
    project_name: str
    deliverable_title: str
    status: str
    start_time: datetime
    end_time: Optional[datetime] = None
    accumulated_minutes: int
    pause_duration_minutes: int
    auto_paused: bool = False
    auto_stopped: bool = False
    created_at: datetime

    class Config:
        from_attributes = True


class TimeSessionCreate(BaseModel):
    """Internal schema for creating sessions."""

    user_id: UUID
    project_id: UUID
    deliverable_id: UUID
    tracking_code: str
    client_session_id: str
    start_time: datetime
    status: str = "active"


class TimeSessionUpdate(BaseModel):
    """Internal schema for updating sessions."""

    status: Optional[str] = None
    end_time: Optional[datetime] = None
    accumulated_minutes: Optional[int] = None
    pause_duration_minutes: Optional[int] = None
    last_heartbeat: Optional[datetime] = None
    auto_paused: Optional[bool] = None
    auto_stopped: Optional[bool] = None
    stop_reason: Optional[str] = None
    commit_message: Optional[str] = None
    commit_sha: Optional[str] = None
    deliverable_status_after: Optional[str] = None
