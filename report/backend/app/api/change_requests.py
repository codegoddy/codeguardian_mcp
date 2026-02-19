from datetime import datetime
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import decode_access_token, get_current_user
from app.core.cookies import get_tokens_from_request
from app.core.logging_config import get_logger
from app.db.database import get_db
from app.models.change_request import ChangeRequest
from app.models.client import Client
from app.models.project import Project
from app.models.user import User
from app.schemas.change_request import ChangeRequestCreate, ChangeRequestResponse, ChangeRequestUpdate
from app.utils.crud import get_user_by_email
from app.utils.nats_client import publish_event

logger = get_logger(__name__)
router = APIRouter()


async def get_current_user_id(request: Request, db: AsyncSession = Depends(get_db)) -> int:
    """Extract user ID from JWT token (supports cookies and Authorization header)"""
    # Try cookies first (preferred method)
    access_token, _ = get_tokens_from_request(request)

    # Fallback to Authorization header
    if not access_token:
        auth_header = request.headers.get("authorization")
        if auth_header and auth_header.startswith("Bearer "):
            access_token = auth_header.split(" ")[1]

    if not access_token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        payload = decode_access_token(access_token)
        email = payload.get("sub")
        if not email:
            raise HTTPException(status_code=401, detail="Invalid token")

        # Get user from database
        user = await get_user_by_email(db, email)
        if not user:
            raise HTTPException(status_code=401, detail="User not found")

        return user.id
    except Exception as e:
        logger.error(f"Token validation failed: {e}")
        raise HTTPException(status_code=401, detail="Invalid token")


@router.post(
    "/change-requests",
    response_model=ChangeRequestResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_change_request(cr_data: ChangeRequestCreate, request: Request, db: AsyncSession = Depends(get_db)):
    """
    Create a new change request
    Requirements: 7.1, 7.2
    """
    user_id = await get_current_user_id(request, db)

    # Verify project exists and belongs to user
    result = await db.execute(select(Project).filter(Project.id == cr_data.project_id, Project.user_id == user_id))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get client to retrieve change request rate
    result = await db.execute(select(Client).filter(Client.id == project.client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found for this project")

    # Calculate cost using change request rate (Requirement 7.2)
    hourly_rate = client.change_request_rate
    total_cost = cr_data.estimated_hours * hourly_rate

    # Create change request
    db_cr = ChangeRequest(
        project_id=cr_data.project_id,
        title=cr_data.title,
        description=cr_data.description,
        estimated_hours=cr_data.estimated_hours,
        hourly_rate=hourly_rate,
        total_cost=total_cost,
        status="pending",
        payment_required=True,
        payment_received=False,
        revision_count=0,
        max_revisions=3,
    )

    db.add(db_cr)
    await db.commit()
    await db.refresh(db_cr)

    # Publish change_request.created event (Requirement 7.3)
    try:
        await publish_event(
            "change_request.created",
            {
                "change_request_id": db_cr.id,
                "project_id": project.id,
                "client_id": client.id,
                "title": db_cr.title,
                "total_cost": float(db_cr.total_cost),
                "estimated_hours": float(db_cr.estimated_hours),
            },
        )
    except Exception as e:
        logger.error("Failed to publish change_request.created event: %s", e)

    return db_cr


@router.get("/change-requests", response_model=List[ChangeRequestResponse])
async def list_change_requests(
    request: Request,
    project_id: Optional[UUID] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """
    List change requests with optional filtering
    Requirements: 7.1
    """
    user_id = await get_current_user_id(request, db)

    # Build query
    stmt = select(ChangeRequest).join(Project).filter(Project.user_id == user_id)

    # Apply filters
    if project_id:
        stmt = stmt.filter(ChangeRequest.project_id == project_id)

    if status:
        stmt = stmt.filter(ChangeRequest.status == status)

    # Order by created_at descending
    stmt = stmt.order_by(ChangeRequest.created_at.desc())

    result = await db.execute(stmt)
    change_requests = result.scalars().all()
    return change_requests


@router.get("/change-requests/{cr_id}", response_model=ChangeRequestResponse)
async def get_change_request(cr_id: UUID, request: Request, db: AsyncSession = Depends(get_db)):
    """
    Get change request details
    Requirements: 7.1
    """
    user_id = await get_current_user_id(request, db)

    # Get change request and verify ownership
    result = await db.execute(
        select(ChangeRequest).join(Project).filter(ChangeRequest.id == cr_id, Project.user_id == user_id)
    )
    cr = result.scalar_one_or_none()

    if not cr:
        raise HTTPException(status_code=404, detail="Change request not found")

    return cr


@router.put("/change-requests/{cr_id}", response_model=ChangeRequestResponse)
async def update_change_request(
    cr_id: UUID,
    cr_update: ChangeRequestUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Update change request
    Requirements: 7.2
    """
    user_id = await get_current_user_id(request, db)

    # Get change request and verify ownership
    result = await db.execute(
        select(ChangeRequest).join(Project).filter(ChangeRequest.id == cr_id, Project.user_id == user_id)
    )
    cr = result.scalar_one_or_none()

    if not cr:
        raise HTTPException(status_code=404, detail="Change request not found")

    # Don't allow updates if already approved or completed
    if cr.status in ["approved", "completed", "billed"]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot update change request with status '{cr.status}'",
        )

    # Update fields
    if cr_update.title is not None:
        cr.title = cr_update.title

    if cr_update.description is not None:
        cr.description = cr_update.description

    if cr_update.estimated_hours is not None:
        # Recalculate total cost if estimated hours changed
        cr.estimated_hours = cr_update.estimated_hours
        cr.total_cost = cr.estimated_hours * cr.hourly_rate

    if cr_update.status is not None:
        cr.status = cr_update.status

    cr.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(cr)

    return cr


@router.post("/change-requests/{cr_id}/approve", response_model=ChangeRequestResponse)
async def approve_change_request(cr_id: UUID, request: Request, db: AsyncSession = Depends(get_db)):
    """
    Approve change request (client action)
    Requirements: 7.4

    Note: This endpoint is typically called from the client portal.
    For now, we allow developers to approve for testing purposes.
    """
    user_id = await get_current_user_id(request, db)

    # Get change request and verify ownership
    result = await db.execute(
        select(ChangeRequest).join(Project).filter(ChangeRequest.id == cr_id, Project.user_id == user_id)
    )
    cr = result.scalar_one_or_none()

    if not cr:
        raise HTTPException(status_code=404, detail="Change request not found")

    if cr.status != "pending":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot approve change request with status '{cr.status}'",
        )

    # Requirement 7.4: Pre-payment required before approval
    if cr.payment_required and not cr.payment_received:
        raise HTTPException(
            status_code=400,
            detail="Payment must be received before change request can be approved",
        )

    # Approve the change request
    cr.status = "approved"
    cr.approved_at = datetime.utcnow()
    cr.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(cr)

    # Get project and client for event
    result = await db.execute(select(Project).filter(Project.id == cr.project_id))
    project = result.scalar_one_or_none()

    # Publish change_request.approved event (Requirement 7.4)
    try:
        await publish_event(
            "change_request.approved",
            {
                "change_request_id": cr.id,
                "project_id": cr.project_id,
                "client_id": project.client_id if project else None,
                "title": cr.title,
                "total_cost": float(cr.total_cost),
            },
        )
    except Exception as e:
        logger.error("Failed to publish change_request.approved event: %s", e)

    return cr


@router.post("/change-requests/{cr_id}/reject", response_model=ChangeRequestResponse)
async def reject_change_request(cr_id: UUID, request: Request, db: AsyncSession = Depends(get_db)):
    """
    Reject change request (client action)
    Requirements: 7.4

    Note: This endpoint is typically called from the client portal.
    For now, we allow developers to reject for testing purposes.
    """
    user_id = await get_current_user_id(request, db)

    # Get change request and verify ownership
    result = await db.execute(
        select(ChangeRequest).join(Project).filter(ChangeRequest.id == cr_id, Project.user_id == user_id)
    )
    cr = result.scalar_one_or_none()

    if not cr:
        raise HTTPException(status_code=404, detail="Change request not found")

    if cr.status != "pending":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot reject change request with status '{cr.status}'",
        )

    # Reject the change request
    cr.status = "rejected"
    cr.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(cr)

    # Get project for event
    result = await db.execute(select(Project).filter(Project.id == cr.project_id))
    project = result.scalar_one_or_none()

    # Publish change_request.rejected event
    try:
        await publish_event(
            "change_request.rejected",
            {
                "change_request_id": cr.id,
                "project_id": cr.project_id,
                "client_id": project.client_id if project else None,
                "title": cr.title,
            },
        )
    except Exception as e:
        logger.error("Failed to publish change_request.rejected event: %s", e)

    return cr


@router.post("/change-requests/{cr_id}/complete", response_model=ChangeRequestResponse)
async def complete_change_request(cr_id: UUID, request: Request, db: AsyncSession = Depends(get_db)):
    """
    Mark change request as completed
    Requirements: 7.1
    """
    user_id = await get_current_user_id(request, db)

    # Get change request and verify ownership
    result = await db.execute(
        select(ChangeRequest).join(Project).filter(ChangeRequest.id == cr_id, Project.user_id == user_id)
    )
    cr = result.scalar_one_or_none()

    if not cr:
        raise HTTPException(status_code=404, detail="Change request not found")

    if cr.status != "approved":
        raise HTTPException(
            status_code=400,
            detail="Only approved change requests can be marked as completed",
        )

    # Mark as completed
    cr.status = "completed"
    cr.completed_at = datetime.utcnow()
    cr.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(cr)

    # Get project for event
    result = await db.execute(select(Project).filter(Project.id == cr.project_id))
    project = result.scalar_one_or_none()

    # Publish change_request.completed event
    try:
        await publish_event(
            "change_request.completed",
            {
                "change_request_id": cr.id,
                "project_id": cr.project_id,
                "client_id": project.client_id if project else None,
                "title": cr.title,
                "total_cost": float(cr.total_cost),
            },
        )
    except Exception as e:
        logger.error("Failed to publish change_request.completed event: %s", e)

    return cr
