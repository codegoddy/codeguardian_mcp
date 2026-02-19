"""
Milestone Service

Handles milestone completion detection, automated invoice generation, and documentation compilation.
Requirements: 9.1, 13.3
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging_config import get_logger
from app.models.deliverable import Deliverable
from app.models.milestone import Milestone
from app.services.documentation import DocumentationService

logger = get_logger(__name__)


async def update_milestone_completion_status(db: AsyncSession, milestone_id: UUID) -> Optional[Milestone]:
    """
    Update milestone completion status based on deliverable statuses.

    This function:
    1. Counts total deliverables in the milestone
    2. Counts completed deliverables (status: completed, verified, ready_to_bill, billed)
    3. Counts ready_to_bill deliverables
    4. Updates milestone status accordingly
    5. Returns the milestone if it's newly completed

    Requirements: 9.1
    """
    # Get milestone
    result = await db.execute(select(Milestone).where(Milestone.id == milestone_id))
    milestone = result.scalar_one_or_none()

    if not milestone:
        return None

    # Count deliverables by status
    deliverable_stats = await db.execute(
        select(
            func.count(Deliverable.id).label("total"),
            func.count(Deliverable.id)
            .filter(Deliverable.status.in_(["completed", "verified", "ready_to_bill", "billed"]))
            .label("completed"),
            func.count(Deliverable.id).filter(Deliverable.status == "ready_to_bill").label("ready_to_bill"),
        ).where(Deliverable.milestone_id == milestone_id)
    )
    stats = deliverable_stats.one()

    # Update milestone counts
    milestone.total_deliverables = stats.total
    milestone.completed_deliverables = stats.completed
    milestone.ready_to_bill_deliverables = stats.ready_to_bill

    # Determine milestone status
    was_completed = milestone.status == "completed"

    if stats.total == 0:
        # No deliverables yet
        milestone.status = "pending"
    elif stats.completed == 0:
        # No completed deliverables
        milestone.status = "pending"
    elif stats.completed < stats.total:
        # Some deliverables completed but not all
        milestone.status = "in_progress"
    elif stats.completed == stats.total and stats.ready_to_bill == stats.total:
        # All deliverables are ready to bill
        if not was_completed:
            milestone.status = "completed"
            milestone.completed_at = datetime.utcnow()

            # Generate milestone documentation
            try:
                doc_service = DocumentationService(db)
                await doc_service.compile_milestone_documentation(milestone.project_id, milestone.id)
            except Exception as e:
                logger.error("Error generating milestone documentation: %s", e)

            await db.commit()
            await db.refresh(milestone)
            return milestone  # Return milestone to trigger invoice generation
    elif stats.completed == stats.total:
        # All deliverables completed but not all ready to bill
        milestone.status = "in_progress"

    await db.commit()
    await db.refresh(milestone)

    return None  # Not newly completed


async def check_milestone_completion(db: AsyncSession, deliverable_id: UUID) -> Optional[Milestone]:
    """
    Check if a deliverable's milestone is now complete after the deliverable status changed.

    This is called when:
    - A deliverable is marked as ready_to_bill
    - A deliverable status changes

    Returns the milestone if it's newly completed (triggers invoice generation).

    Requirements: 9.1
    """
    # Get deliverable with milestone
    result = await db.execute(select(Deliverable).where(Deliverable.id == deliverable_id))
    deliverable = result.scalar_one_or_none()

    if not deliverable or not deliverable.milestone_id:
        return None

    # Update milestone completion status
    return await update_milestone_completion_status(db, deliverable.milestone_id)
