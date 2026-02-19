"""Pydantic schemas for Notification model."""

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel


class NotificationBase(BaseModel):
    """Base schema for Notification data."""

    notification_type: str = "notification"  # 'notification', 'alert', 'update', 'reminder'
    title: str
    message: str
    action_url: Optional[str] = None
    entity_type: Optional[str] = None  # 'project', 'invoice', 'deliverable', 'contract', 'change_request'
    entity_id: Optional[UUID] = None
    extra_data: Optional[Dict[str, Any]] = None


class NotificationCreate(NotificationBase):
    """Schema for creating a new Notification."""

    user_id: UUID


class NotificationResponse(BaseModel):
    """Schema for Notification response."""

    id: UUID
    user_id: UUID
    notification_type: str
    title: str
    message: str
    is_read: bool
    action_url: Optional[str] = None
    entity_type: Optional[str] = None
    entity_id: Optional[UUID] = None
    extra_data: Optional[Dict[str, Any]] = None
    created_at: datetime

    class Config:
        from_attributes = True


class NotificationListResponse(BaseModel):
    """Schema for paginated Notification list response."""

    items: List[NotificationResponse]
    total: int
    page: int
    page_size: int
    has_more: bool


class UnreadCountResponse(BaseModel):
    """Schema for unread count response."""

    count: int
