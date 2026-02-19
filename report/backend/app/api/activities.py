"""API endpoints for activities."""

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.db.database import get_db
from app.models.user import User
from app.schemas.activity import ActivityListResponse, ActivityResponse
from app.services import activity_service

router = APIRouter(prefix="/activities", tags=["Activities"])


@router.get("", response_model=ActivityListResponse)
async def get_activities(
    entity_type: Optional[str] = Query(None, description="Filter by entity type"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get activities for the current user with optional filtering and pagination."""
    activities, total = await activity_service.get_user_activities(
        db=db,
        user_id=current_user.id,
        entity_type=entity_type,
        page=page,
        page_size=page_size,
    )

    return ActivityListResponse(
        items=[ActivityResponse.model_validate(a) for a in activities],
        total=total,
        page=page,
        page_size=page_size,
        has_more=(page * page_size) < total,
    )


@router.get("/recent", response_model=List[ActivityResponse])
async def get_recent_activities(
    limit: int = Query(10, ge=1, le=50, description="Number of activities to return"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get recent activities for the current user (for sidebar display)."""
    activities = await activity_service.get_recent_activities(db=db, user_id=current_user.id, limit=limit)

    return [ActivityResponse.model_validate(a) for a in activities]
