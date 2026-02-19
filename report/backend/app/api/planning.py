"""Planning and time block scheduling API endpoints."""

import logging
from datetime import date
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.db.database import get_db
from app.models.user import User
from app.services import planning_service
from app.services.ai_scheduler import AIScheduler
from app.services.google_calendar_service import GoogleCalendarService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/planning", tags=["planning"])


# Request/Response Models
class CreatePlannedBlockRequest(BaseModel):
    deliverable_id: str
    planned_date: str
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    planned_hours: float
    description: Optional[str] = None
    sync_to_calendar: bool = False


class UpdatePlannedBlockRequest(BaseModel):
    planned_date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    planned_hours: Optional[float] = None
    description: Optional[str] = None
    status: Optional[str] = None


class AutoScheduleRequest(BaseModel):
    deliverable_ids: List[str]
    start_date: str
    end_date: str
    hours_per_day: float = 8.0


class AIAutoScheduleRequest(BaseModel):
    deliverable_ids: List[str]
    start_date: str
    end_date: str
    preferences: Dict[str, Any] = {
        "max_daily_hours": 8.0,
        "work_pattern": "balanced",
        "include_buffer": True,
    }


@router.get("/active-deliverables")
async def get_active_deliverables(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get all active deliverables for planning."""
    try:
        result = await planning_service.get_active_deliverables(user_id=current_user.id, db=db)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch active deliverables: {str(e)}",
        )


@router.post("/schedule")
async def create_planned_block(
    request: CreatePlannedBlockRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new planned time block."""
    try:
        block = await planning_service.create_planned_block(block_data=request.dict(), user_id=current_user.id, db=db)

        # Sync to Google Calendar if requested
        if request.sync_to_calendar:
            try:
                from sqlalchemy import select

                from app.models.google_calendar_integration import GoogleCalendarIntegration

                integration_result = await db.execute(
                    select(GoogleCalendarIntegration).where(GoogleCalendarIntegration.user_id == current_user.id)
                )
                integration = integration_result.scalar_one_or_none()

                if integration and integration.sync_enabled:
                    event_id = await GoogleCalendarService.create_event(integration=integration, planned_block=block, db=db)
                    block.google_calendar_event_id = event_id
                    await db.commit()
                    await db.refresh(block)
            except Exception as e:
                logger.error("Failed to sync to Google Calendar: %s", e)

        return {
            "id": str(block.id),
            "deliverable_id": str(block.deliverable_id),
            "planned_date": block.planned_date.isoformat(),
            "start_time": block.start_time.isoformat() if block.start_time else None,
            "end_time": block.end_time.isoformat() if block.end_time else None,
            "planned_hours": float(block.planned_hours),
            "description": block.description,
            "google_calendar_event_id": block.google_calendar_event_id,
            "status": block.status,
        }
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create planned block: {str(e)}",
        )


@router.get("/schedule")
async def get_planned_blocks(
    start_date: str = Query(..., description="Start date in YYYY-MM-DD format"),
    end_date: str = Query(..., description="End date in YYYY-MM-DD format"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get planned time blocks for a date range."""
    try:
        from datetime import datetime

        start = datetime.fromisoformat(start_date).date()
        end = datetime.fromisoformat(end_date).date()

        result = await planning_service.get_planned_blocks(user_id=current_user.id, start_date=start, end_date=end, db=db)
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid date format: {str(e)}",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch planned blocks: {str(e)}",
        )


@router.put("/schedule/{block_id}")
async def update_planned_block(
    block_id: UUID,
    request: UpdatePlannedBlockRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a planned time block."""
    try:
        block = await planning_service.update_planned_block(
            block_id=block_id,
            update_data=request.dict(exclude_unset=True),
            user_id=current_user.id,
            db=db,
        )

        # Update Google Calendar event if it exists
        if block.google_calendar_event_id:
            try:
                from sqlalchemy import select

                from app.models.google_calendar_integration import GoogleCalendarIntegration

                integration_result = await db.execute(
                    select(GoogleCalendarIntegration).where(GoogleCalendarIntegration.user_id == current_user.id)
                )
                integration = integration_result.scalar_one_or_none()

                if integration and integration.sync_enabled:
                    await GoogleCalendarService.update_event(integration=integration, planned_block=block, db=db)
            except Exception as e:
                logger.error("Failed to update Google Calendar event: %s", e)

        return {
            "id": str(block.id),
            "deliverable_id": str(block.deliverable_id),
            "planned_date": block.planned_date.isoformat(),
            "start_time": block.start_time.isoformat() if block.start_time else None,
            "end_time": block.end_time.isoformat() if block.end_time else None,
            "planned_hours": float(block.planned_hours),
            "description": block.description,
            "google_calendar_event_id": block.google_calendar_event_id,
            "status": block.status,
        }
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update planned block: {str(e)}",
        )


@router.delete("/schedule/{block_id}")
async def delete_planned_block(
    block_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a planned time block."""
    try:
        # Get the block first to check for calendar event
        from sqlalchemy import select

        from app.models.google_calendar_integration import GoogleCalendarIntegration
        from app.models.planned_time_block import PlannedTimeBlock

        block_result = await db.execute(select(PlannedTimeBlock).where(PlannedTimeBlock.id == block_id))
        block = block_result.scalar_one_or_none()

        if block and block.google_calendar_event_id:
            try:
                integration_result = await db.execute(
                    select(GoogleCalendarIntegration).where(GoogleCalendarIntegration.user_id == current_user.id)
                )
                integration = integration_result.scalar_one_or_none()

                if integration:
                    await GoogleCalendarService.delete_event(
                        integration=integration,
                        event_id=block.google_calendar_event_id,
                        db=db,
                    )
            except Exception as e:
                logger.error("Failed to delete Google Calendar event: %s", e)

        success = await planning_service.delete_planned_block(block_id=block_id, user_id=current_user.id, db=db)

        return {"success": success}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete planned block: {str(e)}",
        )


@router.post("/auto-schedule")
async def auto_schedule(
    request: AutoScheduleRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Auto-schedule deliverables across a date range (basic algorithm)."""
    try:
        deliverable_uuids = [UUID(id) for id in request.deliverable_ids]

        result = await planning_service.auto_schedule_deliverables(
            deliverable_ids=deliverable_uuids,
            config={
                "start_date": request.start_date,
                "end_date": request.end_date,
                "hours_per_day": request.hours_per_day,
            },
            user_id=current_user.id,
            db=db,
        )

        return result
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to auto-schedule: {str(e)}",
        )


@router.post("/ai-auto-schedule")
async def ai_auto_schedule(
    request: AIAutoScheduleRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    AI-powered auto-schedule deliverables with intelligent optimization.

    This endpoint uses AI to create an optimized work schedule considering:
    - Task complexity and cognitive load
    - User's historical completion velocity
    - Optimal work block sizing
    - Priority and deadline constraints
    - Buffer time for unknowns
    - Realistic daily capacity

    **Free Tier:** Uses OpenRouter with free models (Grok 4.1 Fast)
    **Fallback:** Falls back to smart rule-based algorithm if AI fails
    """
    try:
        from datetime import datetime

        logger.info(f"AI auto-schedule request from user {current_user.id}")

        deliverable_uuids = [UUID(id) for id in request.deliverable_ids]
        start_date = datetime.fromisoformat(request.start_date).date()
        end_date = datetime.fromisoformat(request.end_date).date()

        # Initialize AI scheduler
        scheduler = AIScheduler()

        # Generate AI-optimized schedule
        result = await scheduler.generate_smart_schedule(
            deliverable_ids=deliverable_uuids,
            start_date=start_date,
            end_date=end_date,
            preferences=request.preferences,
            user_id=current_user.id,
            db=db,
        )

        logger.info(
            f"AI schedule generated: {len(result['schedule'])} blocks, " f"feasibility: {result['analysis']['feasibility']}"
        )

        # Format response
        return {
            "scheduled_blocks": result["schedule"],
            "analysis": result["analysis"],
            "schedule_summary": {
                "total_blocks": len(result["schedule"]),
                "total_hours": result["analysis"]["total_scheduled_hours"],
                "feasibility": result["analysis"]["feasibility"],
                "confidence": result["analysis"]["confidence"],
            },
        }

    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"AI auto-schedule failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate AI schedule: {str(e)}",
        )
