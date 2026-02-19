"""Notification service for creating and managing notifications."""

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy import desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging_config import get_logger
from app.models.notification import Notification
from app.schemas.notification import NotificationCreate
from app.utils.nats_client import publish_event

logger = get_logger(__name__)


async def create_notification(
    db: AsyncSession,
    user_id: UUID,
    notification_type: str,
    title: str,
    message: str,
    action_url: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[UUID] = None,
    extra_data: Optional[Dict[str, Any]] = None,
    publish_to_nats: bool = True,
) -> Notification:
    """Create a new notification and optionally publish to NATS for real-time updates."""
    notification = Notification(
        user_id=user_id,
        notification_type=notification_type,
        title=title,
        message=message,
        action_url=action_url,
        entity_type=entity_type,
        entity_id=entity_id,
        extra_data=extra_data or {},
    )

    db.add(notification)
    await db.commit()
    await db.refresh(notification)

    if publish_to_nats:
        try:
            await publish_event(
                "notification.created",
                {
                    "event_type": "notification_created",
                    "user_id": str(user_id),
                    "notification": {
                        "id": str(notification.id),
                        "notification_type": notification_type,
                        "title": title,
                        "message": message,
                        "action_url": action_url,
                        "created_at": notification.created_at.isoformat(),
                    },
                    "timestamp": datetime.utcnow().isoformat(),
                },
                background=True,
            )
        except Exception as e:
            logger.error("Failed to publish notification to NATS", exc_info=True)

    return notification


async def get_user_notifications(
    db: AsyncSession,
    user_id: UUID,
    unread_only: bool = False,
    page: int = 1,
    page_size: int = 20,
) -> tuple[List[Notification], int]:
    """Get notifications for a user with optional filtering and pagination."""
    base_query = select(Notification).where(Notification.user_id == user_id)

    if unread_only:
        base_query = base_query.where(Notification.is_read == False)

    # Get total count
    count_result = await db.execute(select(func.count()).select_from(base_query.subquery()))
    total = count_result.scalar() or 0

    # Get paginated results
    offset = (page - 1) * page_size
    result = await db.execute(base_query.order_by(desc(Notification.created_at)).offset(offset).limit(page_size))
    notifications = list(result.scalars().all())

    return notifications, total


async def get_unread_count(db: AsyncSession, user_id: UUID) -> int:
    """Get the count of unread notifications for a user."""
    result = await db.execute(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == user_id)
        .where(Notification.is_read == False)
    )
    return result.scalar() or 0


async def mark_as_read(db: AsyncSession, notification_id: UUID, user_id: UUID) -> bool:
    """Mark a notification as read."""
    result = await db.execute(
        select(Notification).where(Notification.id == notification_id).where(Notification.user_id == user_id)
    )
    notification = result.scalar_one_or_none()

    if notification:
        notification.is_read = True
        await db.commit()
        return True
    return False


async def mark_all_as_read(db: AsyncSession, user_id: UUID) -> int:
    """Mark all notifications as read for a user."""
    result = await db.execute(
        update(Notification).where(Notification.user_id == user_id).where(Notification.is_read == False).values(is_read=True)
    )
    await db.commit()
    return result.rowcount


async def delete_notification(db: AsyncSession, notification_id: UUID, user_id: UUID) -> bool:
    """Delete a notification."""
    result = await db.execute(
        select(Notification).where(Notification.id == notification_id).where(Notification.user_id == user_id)
    )
    notification = result.scalar_one_or_none()

    if notification:
        await db.delete(notification)
        await db.commit()
        return True
    return False


# Convenience functions for creating specific notification types


async def create_payment_reminder(
    db: AsyncSession,
    user_id: UUID,
    invoice_id: UUID,
    invoice_number: str,
    days_until_due: int,
    amount: str,
) -> Notification:
    """Create a payment reminder notification."""
    return await create_notification(
        db=db,
        user_id=user_id,
        notification_type="reminder",
        title="Payment reminder",
        message=f"Invoice #{invoice_number} ({amount}) is due in {days_until_due} days",
        action_url="/invoices",
        entity_type="invoice",
        entity_id=invoice_id,
        extra_data={"invoice_number": invoice_number, "days_until_due": days_until_due},
    )


async def create_budget_alert(
    db: AsyncSession,
    user_id: UUID,
    deliverable_id: UUID,
    deliverable_name: str,
    usage_percentage: float,
    alert_level: str,
) -> Notification:
    """Create a budget alert notification."""
    return await create_notification(
        db=db,
        user_id=user_id,
        notification_type="alert",
        title=f"Budget {alert_level}",
        message=f"{deliverable_name} has reached {usage_percentage:.0f}% of budget",
        action_url="/time-tracker",
        entity_type="deliverable",
        entity_id=deliverable_id,
        extra_data={"usage_percentage": usage_percentage, "alert_level": alert_level},
    )


async def create_review_pending_notification(db: AsyncSession, user_id: UUID, pending_count: int) -> Notification:
    """Create a pending review notification."""
    return await create_notification(
        db=db,
        user_id=user_id,
        notification_type="notification",
        title="Reviews pending",
        message=f"You have {pending_count} commit review{'s' if pending_count > 1 else ''} pending",
        action_url="/time-tracker",
        entity_type=None,
        entity_id=None,
        extra_data={"pending_count": pending_count},
    )


async def create_contract_pending_notification(
    db: AsyncSession,
    user_id: UUID,
    contract_id: UUID,
    project_name: str,
    client_name: str,
) -> Notification:
    """Create a contract pending notification."""
    return await create_notification(
        db=db,
        user_id=user_id,
        notification_type="update",
        title="Contract pending",
        message=f"Contract for {project_name} is awaiting signature from {client_name}",
        action_url="/projects?tab=contract",
        entity_type="contract",
        entity_id=contract_id,
        extra_data={"project_name": project_name, "client_name": client_name},
    )
