"""API endpoints for notifications."""

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.db.database import get_db
from app.models.user import User
from app.schemas.notification import NotificationListResponse, NotificationResponse, UnreadCountResponse
from app.services import notification_service

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("", response_model=NotificationListResponse)
async def get_notifications(
    unread_only: bool = Query(False, description="Only return unread notifications"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get notifications for the current user with optional filtering and pagination."""
    notifications, total = await notification_service.get_user_notifications(
        db=db,
        user_id=current_user.id,
        unread_only=unread_only,
        page=page,
        page_size=page_size,
    )

    return NotificationListResponse(
        items=[NotificationResponse.model_validate(n) for n in notifications],
        total=total,
        page=page,
        page_size=page_size,
        has_more=(page * page_size) < total,
    )


@router.get("/unread", response_model=UnreadCountResponse)
async def get_unread_count(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get the count of unread notifications for the current user."""
    count = await notification_service.get_unread_count(db=db, user_id=current_user.id)

    return UnreadCountResponse(count=count)


@router.post("/{notification_id}/read")
async def mark_notification_as_read(
    notification_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark a notification as read."""
    success = await notification_service.mark_as_read(db=db, notification_id=notification_id, user_id=current_user.id)

    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")

    return {"message": "Notification marked as read"}


@router.post("/read-all")
async def mark_all_notifications_as_read(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Mark all notifications as read for the current user."""
    count = await notification_service.mark_all_as_read(db=db, user_id=current_user.id)

    return {"message": f"Marked {count} notifications as read", "count": count}


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a notification."""
    success = await notification_service.delete_notification(db=db, notification_id=notification_id, user_id=current_user.id)

    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")

    return {"message": "Notification deleted"}
