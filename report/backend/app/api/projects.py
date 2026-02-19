import random
import string
from decimal import Decimal
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.contracts import generate_and_send_contract, generate_contract, send_contract
from app.common.errors import ErrorCodes
from app.common.responses import error_response, success_response
from app.core.auth import get_current_user
from app.core.logging_config import get_logger
from app.db.database import get_db
from app.models.client import Client
from app.models.deliverable import Deliverable
from app.models.milestone import Milestone
from app.models.project import Project
from app.models.user import User, UserSettings
from app.schemas.milestone import MilestoneCreate, MilestoneResponse, MilestoneUpdate

# Note: ChangeRequest model will be created in later phases
# from app.models.change_request import ChangeRequest
from app.schemas.project import (
    ProjectCreateWithScopeGuardrail,
    ProjectMetrics,
    ProjectResponse,
    ProjectUpdate,
    ScopeGuardrailConfig,
)
from app.services.activity_service import log_project_activity
from app.utils.currency import format_currency

logger = get_logger(__name__)
router = APIRouter(prefix="/projects", tags=["projects"])


async def log_request_body(request: Request):
    """Dependency to log raw request body for debugging"""
    body = await request.body()
    logger.debug("Raw request body: %s", body)
    logger.debug("Content-Type: %s", request.headers.get("content-type"))
    return body


@router.post("/with-scope-guardrail", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_project_with_scope_guardrail(
    request: Request,
    project_data: ProjectCreateWithScopeGuardrail,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create a new project with scope guardrail configuration and generate contract immediately.
    This streamlined endpoint creates project, configures scope guardrail, and generates a contract in one step.
    """
    logger.debug("Received project data: %s", project_data)
    logger.debug("Project data dict: %s", project_data.model_dump())
    # Verify client exists and belongs to user
    result = await db.execute(
        select(Client).where(
            Client.id == project_data.client_id,
            Client.user_id == current_user.id,
            Client.is_active == True,
        )
    )
    client = result.scalar_one_or_none()

    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found or does not belong to you",
        )

    # Validate budget
    if project_data.project_budget <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Project budget must be greater than 0",
        )

    # Validate auto-pause threshold
    if project_data.auto_pause_threshold < 0 or project_data.auto_pause_threshold > 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Auto-pause threshold must be between 0 and 100",
        )

    # Validate max revisions
    if project_data.max_revisions < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Max revisions must be 0 or greater",
        )

    # Validate repositories (allow empty for no-code projects)
    # Empty array is acceptable for no-code projects that use time trackers instead
    # if not project_data.allowed_repositories or len(project_data.allowed_repositories) == 0:
    #     return error_response(
    #         ErrorCodes.INVALID_INPUT,
    #         "At least one Git repository must be provided",
    #         status_code=status.HTTP_400_BAD_REQUEST
    #     )

    # Generate project prefix (e.g., WEB-123)
    # Take first 3 letters of name, uppercase
    prefix_base = "".join([c for c in project_data.name if c.isalpha()])[:3].upper()
    if len(prefix_base) < 3:
        prefix_base = (prefix_base + "PRJ")[:3]

    # Add 3 random digits to ensure uniqueness
    random_suffix = "".join(random.choices(string.digits, k=3))
    project_prefix = f"{prefix_base}-{random_suffix}"

    # Create project with scope guardrail configuration
    new_project = Project(
        user_id=current_user.id,
        client_id=project_data.client_id,
        name=project_data.name,
        description=project_data.description,
        start_date=project_data.start_date,
        due_date=project_data.due_date,
        status="contract_sent",  # Skip awaiting_contract status since we have all needed data
        project_budget=project_data.project_budget,
        current_budget_remaining=project_data.project_budget,
        auto_replenish=project_data.auto_replenish,
        auto_pause_threshold=project_data.auto_pause_threshold,
        max_revisions=project_data.max_revisions,
        allowed_repositories=project_data.allowed_repositories,
        project_prefix=project_prefix,
    )

    db.add(new_project)
    await db.commit()
    await db.refresh(new_project)

    # Get user's currency setting for activity log
    settings_result = await db.execute(select(UserSettings).where(UserSettings.user_id == current_user.id))
    user_settings = settings_result.scalar_one_or_none()
    currency_code = user_settings.default_currency if user_settings else "USD"
    formatted_budget = format_currency(float(new_project.project_budget), currency_code)

    # Log activity for project creation
    await log_project_activity(
        db=db,
        user_id=current_user.id,
        project_id=new_project.id,
        action="created",
        title=f"Created project: {new_project.name}",
        description=f"Budget: {formatted_budget}",
    )

    # Note: Contract will be generated after template is applied (if template is selected)
    # The frontend should call the template application endpoint, which will trigger contract generation
    return success_response(
        data=ProjectResponse.model_validate(new_project),
        message="Project created successfully. Apply a template to generate the contract.",
    )


@router.get("", response_model=dict)
async def list_projects(
    status_filter: Optional[str] = Query(None, description="Filter by status"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List all projects for the authenticated user with optional status filtering.
    """
    query = (
        select(Project, Client.name.label("client_name"))
        .join(Client, Project.client_id == Client.id)
        .where(Project.user_id == current_user.id)
    )

    if status_filter:
        query = query.where(Project.status == status_filter)

    query = query.order_by(Project.created_at.desc())

    result = await db.execute(query)
    projects_data = result.all()

    if not projects_data:
        return success_response(data=[], message="Retrieved 0 project(s)")

    # Build response data with client_name and optimization fields
    from datetime import datetime, timezone

    from app.models.client_portal_session import ClientPortalSession
    from app.models.time_tracking import TimeEntry

    # Extract all project IDs and client IDs for batch queries
    project_ids = [project.id for project, _ in projects_data]
    client_ids = list(set([project.client_id for project, _ in projects_data]))

    # Batch query: Get time entry counts for all projects at once
    time_entry_counts_result = await db.execute(
        select(TimeEntry.project_id, func.count(TimeEntry.id).label("count"))
        .where(TimeEntry.project_id.in_(project_ids))
        .group_by(TimeEntry.project_id)
    )
    time_entry_counts = {row.project_id: row.count for row in time_entry_counts_result}

    # Batch query: Get active portal sessions for all clients at once
    now_utc = datetime.now(timezone.utc)
    portal_sessions_result = await db.execute(
        select(ClientPortalSession)
        .where(
            ClientPortalSession.client_id.in_(client_ids),
            ClientPortalSession.expires_at > now_utc,
            ClientPortalSession.is_revoked == False,
        )
        .order_by(ClientPortalSession.client_id, ClientPortalSession.created_at.desc())
    )

    # Group portal sessions by client_id (take the most recent one per client)
    portal_sessions_by_client = {}
    for session in portal_sessions_result.scalars():
        if session.client_id not in portal_sessions_by_client:
            portal_sessions_by_client[session.client_id] = session

    # Build response using the batch query results
    from app.core.config import settings

    projects_response = []
    for project, client_name in projects_data:
        project_dict = ProjectResponse.model_validate(project).model_dump()
        project_dict["client_name"] = client_name

        # Use batch query results
        project_dict["total_entries"] = time_entry_counts.get(project.id, 0)

        portal_session = portal_sessions_by_client.get(project.client_id)
        if portal_session:
            project_dict["has_active_portal"] = True
            project_dict["portal_magic_link"] = f"{settings.frontend_url}/client-portal/{portal_session.magic_token}"
            project_dict["portal_expires_at"] = portal_session.expires_at
        else:
            project_dict["has_active_portal"] = False
            project_dict["portal_magic_link"] = None
            project_dict["portal_expires_at"] = None

        projects_response.append(project_dict)

    return success_response(data=projects_response, message=f"Retrieved {len(projects_response)} project(s)")


@router.get("/{project_id}", response_model=dict)
async def get_project(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get project details with metrics.
    """
    result = await db.execute(select(Project).where(Project.id == project_id, Project.user_id == current_user.id))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    return success_response(
        data=ProjectResponse.model_validate(project),
        message="Project retrieved successfully",
    )


@router.put("/{project_id}", response_model=dict)
async def update_project(
    project_id: UUID,
    project_data: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update project details.
    """
    result = await db.execute(select(Project).where(Project.id == project_id, Project.user_id == current_user.id))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    # Update only provided fields
    update_data = project_data.model_dump(exclude_unset=True)
    old_status = project.status
    for field, value in update_data.items():
        setattr(project, field, value)

    await db.commit()
    await db.refresh(project)

    # Log activity for project update
    if "status" in update_data and update_data["status"] != old_status:
        await log_project_activity(
            db=db,
            user_id=current_user.id,
            project_id=project.id,
            action="status_changed",
            title=f"Project status changed: {old_status} → {project.status}",
            description=f"Project: {project.name}",
        )
    else:
        await log_project_activity(
            db=db,
            user_id=current_user.id,
            project_id=project.id,
            action="updated",
            title=f"Updated project: {project.name}",
        )

    return success_response(
        data=ProjectResponse.model_validate(project),
        message="Project updated successfully",
    )


@router.post("/{project_id}/scope-guardrail", response_model=dict)
async def configure_scope_guardrail(
    project_id: UUID,
    config: ScopeGuardrailConfig,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Configure scope guardrail settings (financial and technical limits).
    This endpoint can only be called after the contract is signed.
    Activates the project after configuration.
    """
    result = await db.execute(select(Project).where(Project.id == project_id, Project.user_id == current_user.id))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    # Check if contract is signed
    if not project.contract_signed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot configure scope guardrail until contract is signed by client",
        )

    # Validate budget
    if config.project_budget <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Project budget must be greater than 0",
        )

    # Validate auto-pause threshold
    if config.auto_pause_threshold < 0 or config.auto_pause_threshold > 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Auto-pause threshold must be between 0 and 100",
        )

    # Validate max revisions
    if config.max_revisions < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Max revisions must be 0 or greater",
        )

    # Validate repositories
    if not config.allowed_repositories or len(config.allowed_repositories) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one Git repository must be linked",
        )

    # TODO: Validate Git repository access via provider APIs
    # This will be implemented in Phase 5: Git Integration

    # Update project with scope guardrail configuration
    project.project_budget = config.project_budget
    project.current_budget_remaining = config.project_budget
    project.auto_replenish = config.auto_replenish
    project.auto_pause_threshold = config.auto_pause_threshold
    project.max_revisions = config.max_revisions
    project.allowed_repositories = config.allowed_repositories
    project.status = "active"

    await db.commit()
    await db.refresh(project)

    # Get user's currency setting for activity log
    settings_result = await db.execute(select(UserSettings).where(UserSettings.user_id == current_user.id))
    user_settings = settings_result.scalar_one_or_none()
    currency_code = user_settings.default_currency if user_settings else "USD"
    formatted_budget = format_currency(float(project.project_budget), currency_code)

    # Log activity for scope guardrail configuration and project activation
    await log_project_activity(
        db=db,
        user_id=current_user.id,
        project_id=project.id,
        action="activated",
        title=f"Project activated: {project.name}",
        description=f"Scope guardrail configured. Budget: {formatted_budget}",
    )

    # TODO: Publish project.scope_configured event to NATS
    # TODO: Set up Git webhooks for repositories

    return success_response(
        data=ProjectResponse.model_validate(project),
        message="Scope guardrail configured successfully. Project is now active.",
    )


@router.get("/{project_id}/metrics", response_model=dict)
async def get_project_metrics(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get detailed project metrics and analytics.
    """
    result = await db.execute(select(Project).where(Project.id == project_id, Project.user_id == current_user.id))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    # Get deliverables count (will be implemented in Phase 7)
    # For now, return 0 for deliverables and change requests
    deliverables_completed = 0
    deliverables_total = 0
    change_requests_approved = 0
    change_requests_total = 0

    # TODO: Implement when Deliverable and ChangeRequest models are created
    # deliverables_result = await db.execute(
    #     select(
    #         func.count(Deliverable.id).label("total"),
    #         func.count(Deliverable.id).filter(
    #             Deliverable.status.in_(["completed", "verified", "billed"])
    #         ).label("completed")
    #     ).where(Deliverable.project_id == project_id)
    # )
    # deliverables_stats = deliverables_result.one()

    # change_requests_result = await db.execute(
    #     select(
    #         func.count(ChangeRequest.id).label("total"),
    #         func.count(ChangeRequest.id).filter(
    #             ChangeRequest.status == "approved"
    #         ).label("approved")
    #     ).where(ChangeRequest.project_id == project_id)
    # )
    # change_requests_stats = change_requests_result.one()

    # Calculate budget used percentage
    budget_used_percentage = Decimal("0")
    if project.project_budget > 0:
        budget_used = project.project_budget - project.current_budget_remaining
        budget_used_percentage = (budget_used / project.project_budget) * Decimal("100")

    metrics = ProjectMetrics(
        total_hours_tracked=project.total_hours_tracked,
        total_revenue=project.total_revenue,
        budget_remaining=project.current_budget_remaining,
        budget_used_percentage=budget_used_percentage,
        scope_deviation_percentage=project.scope_deviation_percentage,
        change_request_value_added=project.change_request_value_added,
        deliverables_completed=deliverables_completed,
        deliverables_total=deliverables_total,
        change_requests_approved=change_requests_approved,
        change_requests_total=change_requests_total,
    )

    return success_response(data=metrics, message="Project metrics retrieved successfully")


# Bundle endpoint for project detail page - returns all project data in one response
class ProjectBundleResponse(BaseModel):
    """Schema for project bundle response"""

    project: Dict[str, Any]
    metrics: Dict[str, Any]
    deliverables: List[Dict[str, Any]]
    change_requests: List[Dict[str, Any]]


@router.get("/{project_id}/bundle", response_model=ProjectBundleResponse)
async def get_project_bundle(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get all project data in one response.
    Returns project details, metrics, deliverables, and change requests.
    """
    # Get project
    result = await db.execute(select(Project).where(Project.id == project_id, Project.user_id == current_user.id))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    # Get client name
    client_name = "Unknown Client"
    if project.client_id:
        client_result = await db.execute(select(Client).where(Client.id == project.client_id))
        client = client_result.scalar_one_or_none()
        client_name = client.name if client else "Unknown Client"

    # Build project response
    project_data = ProjectResponse.model_validate(project).model_dump()
    project_data["client_name"] = client_name

    # Calculate metrics
    budget_used_percentage = Decimal("0")
    if project.project_budget > 0:
        budget_used = project.project_budget - project.current_budget_remaining
        budget_used_percentage = (budget_used / project.project_budget) * Decimal("100")

    metrics_data = {
        "total_hours_tracked": project.total_hours_tracked,
        "total_revenue": project.total_revenue,
        "budget_remaining": project.current_budget_remaining,
        "budget_used_percentage": float(budget_used_percentage),
        "scope_deviation_percentage": project.scope_deviation_percentage,
        "change_request_value_added": project.change_request_value_added,
        "deliverables_completed": 0,
        "deliverables_total": 0,
        "change_requests_approved": 0,
        "change_requests_total": 0,
    }

    # Get deliverables
    deliverables_result = await db.execute(
        select(Deliverable).where(Deliverable.project_id == project_id).order_by(Deliverable.created_at.desc())
    )
    deliverables = deliverables_result.scalars().all()

    deliverables_data = []
    for d in deliverables:
        deliverables_data.append(
            {
                "id": str(d.id),
                "title": d.title,
                "description": d.description,
                "status": d.status,
                "estimated_hours": d.estimated_hours,
                "actual_hours": d.actual_hours,
                "hours_used_percentage": d.hours_used_percentage,
                "created_at": d.created_at.isoformat() if d.created_at else None,
                "updated_at": d.updated_at.isoformat() if d.updated_at else None,
            }
        )

    # Get change requests (placeholder - model may not exist)
    change_requests_data = []
    try:
        from app.models.change_request import ChangeRequest

        cr_result = await db.execute(
            select(ChangeRequest).where(ChangeRequest.project_id == project_id).order_by(ChangeRequest.created_at.desc())
        )
        change_requests = cr_result.scalars().all()

        for cr in change_requests:
            change_requests_data.append(
                {
                    "id": str(cr.id),
                    "title": cr.title,
                    "description": cr.description,
                    "status": cr.status,
                    "amount": float(cr.amount) if cr.amount else 0,
                    "created_at": cr.created_at.isoformat() if cr.created_at else None,
                }
            )
    except Exception as e:
        logger.debug("ChangeRequest model not available: %s", e)

    return ProjectBundleResponse(
        project=project_data,
        metrics=metrics_data,
        deliverables=deliverables_data,
        change_requests=change_requests_data,
    )


# ============================================================================
# MILESTONE ENDPOINTS
# ============================================================================


@router.post("/{project_id}/milestones", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_milestone(
    project_id: UUID,
    milestone_data: MilestoneCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create a new milestone for a project.

    Requirements: 9.1
    """
    # Verify project exists and belongs to user
    result = await db.execute(select(Project).where(Project.id == project_id, Project.user_id == current_user.id))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    # Create milestone
    new_milestone = Milestone(
        project_id=project_id,
        name=milestone_data.name,
        description=milestone_data.description,
        order=milestone_data.order,
        target_date=milestone_data.target_date,
        status="pending",
    )

    db.add(new_milestone)
    await db.commit()
    await db.refresh(new_milestone)

    return success_response(
        data=MilestoneResponse.model_validate(new_milestone),
        message="Milestone created successfully",
    )


@router.get("/{project_id}/milestones", response_model=dict)
async def list_milestones(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List all milestones for a project, ordered by order field.

    Requirements: 9.1
    """
    # Verify project exists and belongs to user
    result = await db.execute(select(Project).where(Project.id == project_id, Project.user_id == current_user.id))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    # Get all milestones for the project
    query = select(Milestone).where(Milestone.project_id == project_id).order_by(Milestone.order, Milestone.created_at)

    result = await db.execute(query)
    milestones = result.scalars().all()

    return success_response(
        data=[MilestoneResponse.model_validate(m) for m in milestones],
        message=f"Retrieved {len(milestones)} milestone(s)",
    )


@router.get("/{project_id}/milestones/{milestone_id}", response_model=dict)
async def get_milestone(
    project_id: UUID,
    milestone_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get milestone details with deliverable information.

    Requirements: 9.1
    """
    # Verify project exists and belongs to user
    result = await db.execute(select(Project).where(Project.id == project_id, Project.user_id == current_user.id))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    # Get milestone
    result = await db.execute(select(Milestone).where(Milestone.id == milestone_id, Milestone.project_id == project_id))
    milestone = result.scalar_one_or_none()

    if not milestone:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Milestone not found")

    return success_response(
        data=MilestoneResponse.model_validate(milestone),
        message="Milestone retrieved successfully",
    )


@router.put("/{project_id}/milestones/{milestone_id}", response_model=dict)
async def update_milestone(
    project_id: UUID,
    milestone_id: UUID,
    milestone_data: MilestoneUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update milestone details.

    Requirements: 9.1
    """
    # Verify project exists and belongs to user
    result = await db.execute(select(Project).where(Project.id == project_id, Project.user_id == current_user.id))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    # Get milestone
    result = await db.execute(select(Milestone).where(Milestone.id == milestone_id, Milestone.project_id == project_id))
    milestone = result.scalar_one_or_none()

    if not milestone:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Milestone not found")

    # Update only provided fields
    update_data = milestone_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(milestone, field, value)

    await db.commit()
    await db.refresh(milestone)

    return success_response(
        data=MilestoneResponse.model_validate(milestone),
        message="Milestone updated successfully",
    )


@router.delete("/{project_id}", response_model=dict)
async def delete_project(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Delete a project and all its related data.
    """
    # Verify project exists and belongs to user
    result = await db.execute(select(Project).where(Project.id == project_id, Project.user_id == current_user.id))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found or does not belong to you",
        )

    project_name = project.name
    project_id_str = str(project.id)

    # Delete the project (cascade should handle related records)
    await db.delete(project)
    await db.commit()

    # Log activity for project deletion
    await log_project_activity(
        db=db,
        user_id=current_user.id,
        project_id=project_id,
        action="deleted",
        title=f"Deleted project: {project_name}",
    )

    return success_response(data={"id": project_id}, message="Project deleted successfully")


@router.delete("/{project_id}/milestones/{milestone_id}", response_model=dict)
async def delete_milestone(
    project_id: UUID,
    milestone_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Delete a milestone. Deliverables linked to this milestone will have their milestone_id set to NULL.

    Requirements: 9.1
    """
    # Verify project exists and belongs to user
    result = await db.execute(select(Project).where(Project.id == project_id, Project.user_id == current_user.id))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    # Get milestone
    result = await db.execute(select(Milestone).where(Milestone.id == milestone_id, Milestone.project_id == project_id))
    milestone = result.scalar_one_or_none()

    if not milestone:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Milestone not found")

    # Delete milestone (deliverables will have milestone_id set to NULL due to ON DELETE SET NULL)
    await db.delete(milestone)
    await db.commit()

    return success_response(data={"id": milestone_id}, message="Milestone deleted successfully")


# Documentation Endpoints


@router.get("/{project_id}/documentation", response_model=dict)
async def get_project_documentation(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get comprehensive project documentation for closeout.

    Includes:
    - All milestones and deliverables
    - Project metrics and summary
    - Financial summary

    Requirements: 13.7
    """
    # Verify project exists and belongs to user
    result = await db.execute(select(Project).where(Project.id == project_id, Project.user_id == current_user.id))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    try:
        from app.services.documentation import DocumentationService

        doc_service = DocumentationService(db)
        documentation = await doc_service.generate_project_closeout_documentation(project_id)

        return success_response(
            data={
                "project_id": project_id,
                "documentation": documentation,
                "format": "markdown",
            },
            message="Project documentation generated successfully",
        )
    except Exception as e:
        return error_response(
            ErrorCodes.INTERNAL_ERROR,
            f"Failed to generate project documentation: {str(e)}",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@router.get("/{project_id}/documentation/milestone/{milestone_id}", response_model=dict)
async def get_milestone_documentation(
    project_id: UUID,
    milestone_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get documentation for a specific milestone.

    Compiles all deliverable documentation within the milestone.

    Requirements: 13.3
    """
    # Verify project exists and belongs to user
    result = await db.execute(select(Project).where(Project.id == project_id, Project.user_id == current_user.id))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    # Verify milestone exists and belongs to project
    result = await db.execute(select(Milestone).where(Milestone.id == milestone_id, Milestone.project_id == project_id))
    milestone = result.scalar_one_or_none()

    if not milestone:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Milestone not found")

    try:
        from app.services.documentation import DocumentationService

        doc_service = DocumentationService(db)
        documentation = await doc_service.compile_milestone_documentation(project_id, milestone_id)

        return success_response(
            data={
                "project_id": project_id,
                "milestone_id": milestone_id,
                "milestone_name": milestone.name,
                "documentation": documentation,
                "format": "markdown",
            },
            message="Milestone documentation generated successfully",
        )
    except Exception as e:
        return error_response(
            ErrorCodes.INTERNAL_ERROR,
            f"Failed to generate milestone documentation: {str(e)}",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@router.get("/{project_id}/client-portal-status")
async def get_client_portal_status(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get client portal status for a project including existing portal link if available.
    Returns contract status and active portal session info.
    """
    from datetime import datetime, timezone

    from app.core.config import settings
    from app.models.client_portal_session import ClientPortalSession
    from app.models.contract_signature import ContractSignature

    try:
        # Get project
        result = await db.execute(select(Project).where(Project.id == project_id, Project.user_id == current_user.id))
        project = result.scalar_one_or_none()

        if not project:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

        # Get client
        result = await db.execute(select(Client).where(Client.id == project.client_id))
        client = result.scalar_one_or_none()

        if not client:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Client not found for this project",
            )

        # Check if contract has been signed
        result = await db.execute(
            select(ContractSignature).where(
                ContractSignature.project_id == project_id,
                ContractSignature.signed == True,
            )
        )
        contract_signature = result.scalar_one_or_none()

        if not contract_signature:
            return success_response(
                data={
                    "has_signed_contract": False,
                    "has_active_portal": False,
                    "magic_link": None,
                    "expires_at": None,
                    "client_email": client.email,
                    "client_name": client.name,
                }
            )

        # Check for active portal session (not expired) - get most recent
        now_utc = datetime.now(timezone.utc)
        result = await db.execute(
            select(ClientPortalSession)
            .where(
                ClientPortalSession.client_id == client.id,
                ClientPortalSession.expires_at > now_utc,
                ClientPortalSession.is_revoked == False,
            )
            .order_by(ClientPortalSession.created_at.desc())
            .limit(1)
        )
        portal_session = result.scalar_one_or_none()

        if portal_session:
            magic_link = f"{settings.frontend_url}/client-portal/{portal_session.magic_token}"
            return success_response(
                data={
                    "has_signed_contract": True,
                    "has_active_portal": True,
                    "magic_link": magic_link,
                    "expires_at": portal_session.expires_at.isoformat(),
                    "client_email": client.email,
                    "client_name": client.name,
                }
            )
        else:
            return success_response(
                data={
                    "has_signed_contract": True,
                    "has_active_portal": False,
                    "magic_link": None,
                    "expires_at": None,
                    "client_email": client.email,
                    "client_name": client.name,
                }
            )

    except Exception as e:
        logger.error("Failed to get client portal status: %s", e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get client portal status: {str(e)}",
        )


@router.post("/{project_id}/send-client-portal-link")
async def send_client_portal_link(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generate and send client portal access link to the client.
    Creates a new magic link session and emails it to the client.
    """
    from datetime import datetime, timedelta, timezone

    from app.core.config import settings
    from app.models.client_portal_session import ClientPortalSession
    from app.models.contract_signature import ContractSignature
    from app.utils.nats_client import publish_event

    try:
        # Get project
        result = await db.execute(select(Project).where(Project.id == project_id, Project.user_id == current_user.id))
        project = result.scalar_one_or_none()

        if not project:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

        # Get client
        result = await db.execute(select(Client).where(Client.id == project.client_id))
        client = result.scalar_one_or_none()

        if not client:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Client not found for this project",
            )

        # Check if contract has been signed
        result = await db.execute(
            select(ContractSignature).where(
                ContractSignature.project_id == project_id,
                ContractSignature.signed == True,
            )
        )
        contract_signature = result.scalar_one_or_none()

        if not contract_signature:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot generate portal link. Client has not signed the contract yet.",
            )

        # Check for active portal session (not expired)
        now_utc = datetime.now(timezone.utc)
        result = await db.execute(
            select(ClientPortalSession)
            .where(
                ClientPortalSession.client_id == client.id,
                ClientPortalSession.expires_at > now_utc,
                ClientPortalSession.is_revoked == False,
            )
            .order_by(ClientPortalSession.created_at.desc())
            .limit(1)
        )
        existing_session = result.scalar_one_or_none()

        if existing_session:
            logger.debug("Reusing existing active portal session for client %s", client.id)
            magic_token = existing_session.magic_token
            expires_at = existing_session.expires_at
            # Update last accessed or similar if needed? No, just reuse.
        else:
            # Invalidate all previous active sessions for this client (cleanup)
            await db.execute(
                update(ClientPortalSession)
                .where(
                    ClientPortalSession.client_id == client.id,
                    ClientPortalSession.is_revoked == False,
                )
                .values(is_revoked=True)
            )

            # Generate magic token (30-day expiry)
            magic_token = ClientPortalSession.generate_magic_token()
            expires_at = datetime.now(timezone.utc) + timedelta(days=30)

            # Create session
            portal_session = ClientPortalSession(
                client_id=client.id,
                magic_token=magic_token,
                ip_address="generated_by_developer",
                user_agent="DevHQ_System",
                expires_at=expires_at,
            )
            db.add(portal_session)
            await db.commit()
            await db.refresh(portal_session)

        # Generate magic link
        magic_link = f"{settings.frontend_url}/client-portal/{magic_token}"

        # Publish event to NATS for email sending
        logger.info("Publishing client portal access link email to NATS")
        try:
            await publish_event(
                "email.client_portal_access_link",
                {
                    "to_email": client.email,
                    "client_name": client.name,
                    "developer_name": current_user.full_name,
                    "project_name": project.name,
                    "magic_link": magic_link,
                },
                background=True,
            )
            logger.info("Client portal access link email event published successfully")
        except Exception as e:
            logger.error(
                "Failed to publish client portal access link email: %s",
                e,
                exc_info=True,
            )
            # Continue even if email fails

        return success_response(
            data={
                "magic_link": magic_link,
                "expires_at": expires_at.isoformat(),
                "client_email": client.email,
            },
            message="Client portal access link generated and sent successfully",
        )

    except Exception as e:
        logger.error("Failed to generate client portal link: %s", e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate client portal link: {str(e)}",
        )
