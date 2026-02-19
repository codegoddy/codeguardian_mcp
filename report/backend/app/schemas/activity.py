"""Pydantic schemas for Activity model."""

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel


class ActivityBase(BaseModel):
    """Base schema for Activity data."""

    entity_type: str  # 'project', 'deliverable', 'contract', 'invoice', 'time_entry', 'change_request', 'client'
    entity_id: UUID
    action: str  # 'created', 'updated', 'completed', 'signed', 'generated', 'deleted', 'status_changed'
    title: str
    description: Optional[str] = None
    activity_type: str = "default"  # 'commit', 'invoice', 'deliverable', 'contract', 'project', 'time_entry', 'default'
    extra_data: Optional[Dict[str, Any]] = None


class ActivityCreate(ActivityBase):
    """Schema for creating a new Activity."""

    user_id: UUID


class ActivityResponse(BaseModel):
    """Schema for Activity response."""

    id: UUID
    user_id: UUID
    entity_type: str
    entity_id: UUID
    action: str
    title: str
    description: Optional[str] = None
    activity_type: str
    extra_data: Optional[Dict[str, Any]] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ActivityListResponse(BaseModel):
    """Schema for paginated Activity list response."""

    items: List[ActivityResponse]
    total: int
    page: int
    page_size: int
    has_more: bool
