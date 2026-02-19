"""Activity service for creating and retrieving activities."""

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging_config import get_logger
from app.models.activity import Activity
from app.schemas.activity import ActivityCreate, ActivityResponse
from app.utils.nats_client import publish_event

logger = get_logger(__name__)


async def create_activity(
    db: AsyncSession,
    user_id: UUID,
    entity_type: str,
    entity_id: UUID,
    action: str,
    title: str,
    description: Optional[str] = None,
    activity_type: str = "default",
    extra_data: Optional[Dict[str, Any]] = None,
    publish_to_nats: bool = True,
) -> Activity:
    """Create a new activity and optionally publish to NATS for real-time updates."""
    activity = Activity(
        user_id=user_id,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        title=title,
        description=description,
        activity_type=activity_type,
        extra_data=extra_data or {},
    )

    db.add(activity)
    await db.commit()
    await db.refresh(activity)

    if publish_to_nats:
        try:
            await publish_event(
                "activity.created",
                {
                    "event_type": "activity_created",
                    "user_id": str(user_id),
                    "activity": {
                        "id": str(activity.id),
                        "entity_type": entity_type,
                        "entity_id": str(entity_id),
                        "action": action,
                        "title": title,
                        "description": description,
                        "activity_type": activity_type,
                        "created_at": activity.created_at.isoformat(),
                    },
                    "timestamp": datetime.utcnow().isoformat(),
                },
                background=True,
            )
        except Exception as e:
            logger.error("Failed to publish activity to NATS", exc_info=True)

    return activity


async def get_user_activities(
    db: AsyncSession,
    user_id: UUID,
    entity_type: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[List[Activity], int]:
    """Get activities for a user with optional filtering and pagination."""
    # Build base query
    base_query = select(Activity).where(Activity.user_id == user_id)

    if entity_type:
        base_query = base_query.where(Activity.entity_type == entity_type)

    # Get total count
    count_result = await db.execute(select(func.count()).select_from(base_query.subquery()))
    total = count_result.scalar() or 0

    # Get paginated results
    offset = (page - 1) * page_size
    result = await db.execute(base_query.order_by(desc(Activity.created_at)).offset(offset).limit(page_size))
    activities = list(result.scalars().all())

    return activities, total


async def get_recent_activities(db: AsyncSession, user_id: UUID, limit: int = 10) -> List[Activity]:
    """Get the most recent activities for a user (for sidebar display)."""
    result = await db.execute(
        select(Activity).where(Activity.user_id == user_id).order_by(desc(Activity.created_at)).limit(limit)
    )
    return list(result.scalars().all())


# Convenience functions for creating specific activity types


async def log_project_activity(
    db: AsyncSession,
    user_id: UUID,
    project_id: UUID,
    action: str,
    title: str,
    description: Optional[str] = None,
    extra_data: Optional[Dict[str, Any]] = None,
) -> Activity:
    """Log a project-related activity."""
    return await create_activity(
        db=db,
        user_id=user_id,
        entity_type="project",
        entity_id=project_id,
        action=action,
        title=title,
        description=description,
        activity_type="project",
        extra_data=extra_data,
    )


async def log_deliverable_activity(
    db: AsyncSession,
    user_id: UUID,
    deliverable_id: UUID,
    action: str,
    title: str,
    description: Optional[str] = None,
    extra_data: Optional[Dict[str, Any]] = None,
) -> Activity:
    """Log a deliverable-related activity."""
    return await create_activity(
        db=db,
        user_id=user_id,
        entity_type="deliverable",
        entity_id=deliverable_id,
        action=action,
        title=title,
        description=description,
        activity_type="deliverable",
        extra_data=extra_data,
    )


async def log_contract_activity(
    db: AsyncSession,
    user_id: UUID,
    contract_id: UUID,
    action: str,
    title: str,
    description: Optional[str] = None,
    extra_data: Optional[Dict[str, Any]] = None,
) -> Activity:
    """Log a contract-related activity."""
    return await create_activity(
        db=db,
        user_id=user_id,
        entity_type="contract",
        entity_id=contract_id,
        action=action,
        title=title,
        description=description,
        activity_type="contract",
        extra_data=extra_data,
    )


async def log_invoice_activity(
    db: AsyncSession,
    user_id: UUID,
    invoice_id: UUID,
    action: str,
    title: str,
    description: Optional[str] = None,
    extra_data: Optional[Dict[str, Any]] = None,
) -> Activity:
    """Log an invoice-related activity."""
    return await create_activity(
        db=db,
        user_id=user_id,
        entity_type="invoice",
        entity_id=invoice_id,
        action=action,
        title=title,
        description=description,
        activity_type="invoice",
        extra_data=extra_data,
    )


async def log_commit_activity(
    db: AsyncSession,
    user_id: UUID,
    commit_id: UUID,
    title: str,
    description: Optional[str] = None,
    extra_data: Optional[Dict[str, Any]] = None,
) -> Activity:
    """Log a commit-related activity."""
    return await create_activity(
        db=db,
        user_id=user_id,
        entity_type="time_entry",
        entity_id=commit_id,
        action="created",
        title=title,
        description=description,
        activity_type="commit",
        extra_data=extra_data,
    )
