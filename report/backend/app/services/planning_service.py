"""
Planning Service

Handles planned time blocks for deliverables, including scheduling, auto-scheduling,
and integration with Google Calendar.
"""

from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.deliverable import Deliverable
from app.models.planned_time_block import PlannedTimeBlock
from app.models.project import Project
from app.models.user import User


async def get_active_deliverables(user_id: UUID, db: AsyncSession) -> Dict[str, Any]:
    """
    Get all active deliverables for planning.
    Returns projects and their deliverables that have remaining hours.
    Includes contract status to warn users about unsigned contracts.
    """
    # Get all active projects (both signed and unsigned contracts)
    result = await db.execute(
        select(Project)
        .where(
            and_(
                Project.user_id == user_id,
                Project.status.in_(["active", "in_progress"]),
            )
        )
        .order_by(Project.created_at.desc())
    )
    projects = result.scalars().all()

    projects_data = []
    for project in projects:
        # Get deliverables for this project (with or without tracking codes)
        deliverables_result = await db.execute(
            select(Deliverable)
            .where(
                and_(
                    Deliverable.project_id == project.id,
                    Deliverable.status.in_(["pending", "in_progress", "ready_to_bill"]),
                )
            )
            .order_by(Deliverable.created_at.asc())
        )
        deliverables = deliverables_result.scalars().all()

        # Filter deliverables with remaining hours
        active_deliverables = []
        for deliverable in deliverables:
            hours_tracked = float(deliverable.actual_hours or 0)
            estimated_hours = float(deliverable.estimated_hours or 0)
            hours_remaining = max(0, estimated_hours - hours_tracked)

            if hours_remaining > 0:
                active_deliverables.append(
                    {
                        "id": str(deliverable.id),
                        "name": deliverable.title,
                        "tracking_code": deliverable.tracking_code,
                        "has_tracking_code": deliverable.tracking_code is not None,
                        "estimated_hours": estimated_hours,
                        "hours_tracked": hours_tracked,
                        "hours_remaining": hours_remaining,
                        "deadline": (deliverable.deadline.isoformat() if deliverable.deadline else None),
                        "priority": deliverable.priority or "medium",
                        "status": deliverable.status,
                    }
                )

        if active_deliverables:
            projects_data.append(
                {
                    "id": str(project.id),
                    "name": project.name,
                    "contract_signed": project.contract_signed or False,
                    "contract_signed_at": (project.contract_signed_at.isoformat() if project.contract_signed_at else None),
                    "start_date": (project.start_date.isoformat() if project.start_date else None),
                    "end_date": (project.due_date.isoformat() if project.due_date else None),
                    "deliverables": active_deliverables,
                }
            )

    return {"projects": projects_data}


async def create_planned_block(block_data: Dict[str, Any], user_id: UUID, db: AsyncSession) -> PlannedTimeBlock:
    """
    Create a new planned time block.
    """
    # Verify deliverable belongs to user
    deliverable_result = await db.execute(
        select(Deliverable)
        .join(Project)
        .where(
            and_(
                Deliverable.id == UUID(block_data["deliverable_id"]),
                Project.user_id == user_id,
            )
        )
    )
    deliverable = deliverable_result.scalar_one_or_none()
    if not deliverable:
        raise ValueError("Deliverable not found or access denied")

    # Create planned block
    planned_block = PlannedTimeBlock(
        user_id=user_id,
        project_id=deliverable.project_id,
        deliverable_id=deliverable.id,
        planned_date=datetime.fromisoformat(block_data["planned_date"]).date(),
        start_time=(datetime.fromisoformat(block_data["start_time"]).time() if block_data.get("start_time") else None),
        end_time=(datetime.fromisoformat(block_data["end_time"]).time() if block_data.get("end_time") else None),
        planned_hours=block_data["planned_hours"],
        description=block_data.get("description"),
        status="planned",
    )

    db.add(planned_block)
    await db.commit()
    await db.refresh(planned_block)

    return planned_block


async def get_planned_blocks(user_id: UUID, start_date: date, end_date: date, db: AsyncSession) -> Dict[str, Any]:
    """
    Get planned time blocks for a date range.
    """
    result = await db.execute(
        select(PlannedTimeBlock)
        .where(
            and_(
                PlannedTimeBlock.user_id == user_id,
                PlannedTimeBlock.planned_date >= start_date,
                PlannedTimeBlock.planned_date <= end_date,
            )
        )
        .order_by(PlannedTimeBlock.planned_date.asc(), PlannedTimeBlock.start_time.asc())
    )
    blocks = result.scalars().all()

    # Enrich with project and deliverable data
    enriched_blocks = []
    total_hours = 0

    for block in blocks:
        # Get deliverable and project
        deliverable_result = await db.execute(select(Deliverable).where(Deliverable.id == block.deliverable_id))
        deliverable = deliverable_result.scalar_one_or_none()

        project_result = await db.execute(select(Project).where(Project.id == block.project_id))
        project = project_result.scalar_one_or_none()

        if deliverable and project:
            enriched_blocks.append(
                {
                    "id": str(block.id),
                    "user_id": str(block.user_id),
                    "project_id": str(block.project_id),
                    "project_name": project.name,
                    "deliverable_id": str(block.deliverable_id),
                    "deliverable_name": deliverable.title,
                    "tracking_code": deliverable.tracking_code,
                    "planned_date": block.planned_date.isoformat(),
                    "start_time": (block.start_time.isoformat() if block.start_time else None),
                    "end_time": block.end_time.isoformat() if block.end_time else None,
                    "planned_hours": float(block.planned_hours),
                    "description": block.description,
                    "google_calendar_event_id": block.google_calendar_event_id,
                    "status": block.status,
                    "created_at": block.created_at.isoformat(),
                    "updated_at": block.updated_at.isoformat(),
                }
            )
            total_hours += float(block.planned_hours)

    return {"planned_blocks": enriched_blocks, "total_planned_hours": total_hours}


async def update_planned_block(
    block_id: UUID, update_data: Dict[str, Any], user_id: UUID, db: AsyncSession
) -> PlannedTimeBlock:
    """
    Update a planned time block.
    """
    result = await db.execute(
        select(PlannedTimeBlock).where(and_(PlannedTimeBlock.id == block_id, PlannedTimeBlock.user_id == user_id))
    )
    block = result.scalar_one_or_none()
    if not block:
        raise ValueError("Planned block not found or access denied")

    # Update fields
    if "planned_date" in update_data:
        block.planned_date = datetime.fromisoformat(update_data["planned_date"]).date()
    if "start_time" in update_data:
        block.start_time = datetime.fromisoformat(update_data["start_time"]).time() if update_data["start_time"] else None
    if "end_time" in update_data:
        block.end_time = datetime.fromisoformat(update_data["end_time"]).time() if update_data["end_time"] else None
    if "planned_hours" in update_data:
        block.planned_hours = update_data["planned_hours"]
    if "description" in update_data:
        block.description = update_data["description"]
    if "status" in update_data:
        block.status = update_data["status"]

    block.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(block)

    return block


async def delete_planned_block(block_id: UUID, user_id: UUID, db: AsyncSession) -> bool:
    """
    Delete a planned time block.
    """
    result = await db.execute(
        select(PlannedTimeBlock).where(and_(PlannedTimeBlock.id == block_id, PlannedTimeBlock.user_id == user_id))
    )
    block = result.scalar_one_or_none()
    if not block:
        raise ValueError("Planned block not found or access denied")

    await db.delete(block)
    await db.commit()

    return True


async def auto_schedule_deliverables(
    deliverable_ids: List[UUID], config: Dict[str, Any], user_id: UUID, db: AsyncSession
) -> Dict[str, Any]:
    """
    Auto-schedule deliverables across a date range.

    Algorithm:
    1. Get all deliverables and their remaining hours
    2. Sort by priority and deadline
    3. Distribute hours across available days
    4. Create planned blocks
    """
    start_date = datetime.fromisoformat(config["start_date"]).date()
    end_date = datetime.fromisoformat(config["end_date"]).date()
    hours_per_day = config.get("hours_per_day", 8)

    # Get deliverables
    deliverables_result = await db.execute(
        select(Deliverable).join(Project).where(and_(Deliverable.id.in_(deliverable_ids), Project.user_id == user_id))
    )
    deliverables = deliverables_result.scalars().all()

    if not deliverables:
        raise ValueError("No valid deliverables found")

    # Calculate remaining hours for each deliverable
    deliverable_data = []
    for deliverable in deliverables:
        hours_tracked = float(deliverable.actual_hours or 0)
        estimated_hours = float(deliverable.estimated_hours or 0)
        hours_remaining = max(0, estimated_hours - hours_tracked)

        if hours_remaining > 0:
            priority_order = {"high": 1, "medium": 2, "low": 3}
            deliverable_data.append(
                {
                    "deliverable": deliverable,
                    "hours_remaining": hours_remaining,
                    "priority": priority_order.get(deliverable.priority or "medium", 2),
                    "deadline": deliverable.deadline or datetime.max,
                }
            )

    # Sort by priority (high first) then deadline (earliest first)
    deliverable_data.sort(key=lambda x: (x["priority"], x["deadline"]))

    # Generate schedule
    planned_blocks = []
    current_date = start_date

    for item in deliverable_data:
        deliverable = item["deliverable"]
        remaining_hours = item["hours_remaining"]

        while remaining_hours > 0 and current_date <= end_date:
            # Skip weekends (optional - can be configured)
            if current_date.weekday() >= 5:  # Saturday = 5, Sunday = 6
                current_date += timedelta(days=1)
                continue

            # Allocate hours for this day
            hours_to_allocate = min(remaining_hours, hours_per_day)

            # Create planned block
            block = PlannedTimeBlock(
                user_id=user_id,
                project_id=deliverable.project_id,
                deliverable_id=deliverable.id,
                planned_date=current_date,
                start_time=time(9, 0),  # Default 9 AM start
                end_time=time(9 + int(hours_to_allocate), int((hours_to_allocate % 1) * 60)),
                planned_hours=hours_to_allocate,
                description=f"Auto-scheduled work on {deliverable.title}",
                status="planned",
            )

            db.add(block)
            planned_blocks.append(block)

            remaining_hours -= hours_to_allocate
            current_date += timedelta(days=1)

    await db.commit()

    # Refresh all blocks
    for block in planned_blocks:
        await db.refresh(block)

    # Calculate summary
    total_hours = sum(float(block.planned_hours) for block in planned_blocks)
    days_scheduled = len(set(block.planned_date for block in planned_blocks))

    return {
        "planned_blocks": [
            {
                "id": str(block.id),
                "deliverable_id": str(block.deliverable_id),
                "planned_date": block.planned_date.isoformat(),
                "planned_hours": float(block.planned_hours),
            }
            for block in planned_blocks
        ],
        "schedule_summary": {
            "total_deliverables": len(deliverable_data),
            "total_hours_planned": total_hours,
            "days_scheduled": days_scheduled,
        },
    }


async def check_missed_blocks(user_id: UUID, db: AsyncSession) -> int:
    """
    Check for planned blocks that have passed without being completed.
    Mark them as 'missed'.
    """
    today = date.today()

    result = await db.execute(
        select(PlannedTimeBlock).where(
            and_(
                PlannedTimeBlock.user_id == user_id,
                PlannedTimeBlock.planned_date < today,
                PlannedTimeBlock.status == "planned",
            )
        )
    )
    blocks = result.scalars().all()

    count = 0
    for block in blocks:
        block.status = "missed"
        block.updated_at = datetime.now(timezone.utc)
        count += 1

    if count > 0:
        await db.commit()

    return count
