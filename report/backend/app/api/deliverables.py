from datetime import datetime
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.errors import ErrorCodes
from app.common.responses import error_response, success_response
from app.core.auth import get_current_user
from app.db.database import get_db
from app.models.deliverable import Deliverable
from app.models.git_commit import GitCommit
from app.models.project import Project
from app.models.time_tracking import TimeEntry
from app.models.user import User
from app.schemas.client_portal import ActivityMetrics, DeliverableActivityResponse, TimelineEvent, TimelineValidationResponse
from app.schemas.deliverable import DeliverableCreate, DeliverableResponse, DeliverableUpdate, DeliverableVerification
from app.services.activity_metrics import ActivityMetricsService
from app.services.activity_service import log_deliverable_activity
from app.services.deliverable_linker import DeliverableLinker
from app.services.milestone_service import check_milestone_completion
from app.services.notification_service import create_notification
from app.services.timeline_validator import TimelineValidator
from app.utils.git_providers.bitbucket import BitbucketClient
from app.utils.git_providers.github import GitHubClient
from app.utils.git_providers.gitlab import GitLabClient

router = APIRouter(prefix="/deliverables", tags=["deliverables"])


def get_git_client(provider: str, access_token: str):
    """Get the appropriate Git provider client."""
    if provider == "github":
        return GitHubClient(access_token)
    elif provider == "gitlab":
        return GitLabClient(access_token)
    elif provider == "bitbucket":
        return BitbucketClient(access_token)
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported provider: {provider}")


def detect_provider_from_url(pr_url: str) -> str:
    """Detect Git provider from PR URL."""
    if "github.com" in pr_url:
        return "github"
    elif "gitlab.com" in pr_url:
        return "gitlab"
    elif "bitbucket.org" in pr_url:
        return "bitbucket"
    else:
        raise HTTPException(status_code=400, detail="Unable to detect Git provider from URL")


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_deliverable(
    deliverable_data: DeliverableCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create a new deliverable with task reference.
    """
    # Verify project exists and belongs to user
    result = await db.execute(
        select(Project).where(
            Project.id == deliverable_data.project_id,
            Project.user_id == current_user.id,
        )
    )
    project = result.scalar_one_or_none()

    if not project:
        return error_response(
            ErrorCodes.NOT_FOUND,
            "Project not found or does not belong to you",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    # Check if project is active
    if project.status not in ["active", "paused"]:
        return error_response(
            ErrorCodes.INVALID_INPUT,
            f"Cannot create deliverables for project with status '{project.status}'",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    # Generate tracking code if project has a prefix
    tracking_code = None
    git_branch_pattern = None

    if project.project_prefix:
        linker = DeliverableLinker()
        sequence_number = linker.get_next_sequence_number(db, project.id)
        tracking_code = linker.generate_tracking_code(project.project_prefix, sequence_number)
        git_branch_pattern = f"deliverable/{tracking_code}-*"

    # Create deliverable
    new_deliverable = Deliverable(
        project_id=deliverable_data.project_id,
        milestone_id=deliverable_data.milestone_id,
        task_reference=deliverable_data.task_reference,
        title=deliverable_data.title,
        description=deliverable_data.description,
        acceptance_criteria=deliverable_data.acceptance_criteria,
        is_in_scope=deliverable_data.is_in_scope,
        estimated_hours=deliverable_data.estimated_hours,
        tracking_code=tracking_code,
        git_branch_pattern=git_branch_pattern,
        status="pending",
    )

    db.add(new_deliverable)
    await db.commit()
    await db.refresh(new_deliverable)

    # Update milestone counts if deliverable is linked to a milestone
    if new_deliverable.milestone_id:
        from app.services.milestone_service import update_milestone_completion_status

        await update_milestone_completion_status(db, new_deliverable.milestone_id)

    # Log activity for deliverable creation
    await log_deliverable_activity(
        db=db,
        user_id=current_user.id,
        deliverable_id=new_deliverable.id,
        action="created",
        title=f"Added deliverable: {new_deliverable.title}",
        description=f"Estimated hours: {new_deliverable.estimated_hours or 'TBD'}",
    )

    return success_response(
        data=DeliverableResponse.model_validate(new_deliverable),
        message="Deliverable created successfully",
    )


@router.get("", response_model=dict)
async def list_deliverables(
    project_id: Optional[UUID] = Query(None, description="Filter by project ID"),
    status_filter: Optional[str] = Query(None, description="Filter by status"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List deliverables with optional filtering by project and status.
    """
    # Build query - only show deliverables from user's projects
    query = select(Deliverable).join(Project, Deliverable.project_id == Project.id).where(Project.user_id == current_user.id)

    if project_id:
        query = query.where(Deliverable.project_id == project_id)

    if status_filter:
        query = query.where(Deliverable.status == status_filter)

    query = query.order_by(Deliverable.created_at.desc())

    result = await db.execute(query)
    deliverables = result.scalars().all()

    return success_response(
        data=[DeliverableResponse.model_validate(d) for d in deliverables],
        message=f"Retrieved {len(deliverables)} deliverable(s)",
    )


@router.get("/{deliverable_id}", response_model=dict)
async def get_deliverable(
    deliverable_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get deliverable details.
    """
    # Get deliverable and verify ownership through project
    result = await db.execute(
        select(Deliverable)
        .join(Project, Deliverable.project_id == Project.id)
        .where(Deliverable.id == deliverable_id, Project.user_id == current_user.id)
    )
    deliverable = result.scalar_one_or_none()

    if not deliverable:
        return error_response(
            ErrorCodes.NOT_FOUND,
            "Deliverable not found",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    return success_response(
        data=DeliverableResponse.model_validate(deliverable),
        message="Deliverable retrieved successfully",
    )


@router.put("/{deliverable_id}", response_model=dict)
async def update_deliverable(
    deliverable_id: UUID,
    deliverable_data: DeliverableUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update deliverable details.
    """
    # Get deliverable and verify ownership through project
    result = await db.execute(
        select(Deliverable)
        .join(Project, Deliverable.project_id == Project.id)
        .where(Deliverable.id == deliverable_id, Project.user_id == current_user.id)
    )
    deliverable = result.scalar_one_or_none()

    if not deliverable:
        return error_response(
            ErrorCodes.NOT_FOUND,
            "Deliverable not found",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    # Track if milestone changed or status changed
    old_milestone_id = deliverable.milestone_id
    old_status = deliverable.status
    status_changed = "status" in deliverable_data.model_dump(exclude_unset=True)

    # Update only provided fields
    update_data = deliverable_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(deliverable, field, value)

    await db.commit()
    await db.refresh(deliverable)

    # Check if status changed to a "completed" state
    completed_statuses = ["completed", "verified", "ready_to_bill", "billed"]
    status_became_completed = (
        status_changed and deliverable.status in completed_statuses and old_status not in completed_statuses
    )

    # Update milestone counts if milestone changed or status changed
    if old_milestone_id and old_milestone_id != deliverable.milestone_id:
        # Update old milestone
        from app.services.milestone_service import update_milestone_completion_status

        await update_milestone_completion_status(db, old_milestone_id)

    milestone_message = None
    if deliverable.milestone_id and (status_changed or deliverable.milestone_id != old_milestone_id):
        # Update new/current milestone
        completed_milestone = await check_milestone_completion(db, deliverable_id)
        if completed_milestone:
            milestone_message = f"Milestone '{completed_milestone.name}' is now complete and ready for invoicing!"

    # Check and auto-trigger payment milestones when deliverable reaches completed status
    payment_message = None
    if status_became_completed:
        from app.services.payment_milestone_service import check_and_trigger_payment_milestones

        triggered_payments = await check_and_trigger_payment_milestones(db, deliverable.project_id)
        if triggered_payments:
            names = [p.name for p in triggered_payments]
            payment_message = f"Payment milestone(s) triggered: {', '.join(names)}"

    # Build response message
    message = "Deliverable updated successfully"
    if milestone_message:
        message += f". {milestone_message}"
    if payment_message:
        message += f". {payment_message}"

    # Log activity for deliverable update
    if status_changed and deliverable.status != old_status:
        await log_deliverable_activity(
            db=db,
            user_id=current_user.id,
            deliverable_id=deliverable.id,
            action="status_changed",
            title=f"Deliverable status: {old_status} → {deliverable.status}",
            description=f"{deliverable.title}",
        )
    else:
        await log_deliverable_activity(
            db=db,
            user_id=current_user.id,
            deliverable_id=deliverable.id,
            action="updated",
            title=f"Updated deliverable: {deliverable.title}",
        )

    return success_response(data=DeliverableResponse.model_validate(deliverable), message=message)


@router.delete("/{deliverable_id}", response_model=dict)
async def delete_deliverable(
    deliverable_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Delete a deliverable.
    """
    # Get deliverable and verify ownership through project
    result = await db.execute(
        select(Deliverable)
        .join(Project, Deliverable.project_id == Project.id)
        .where(Deliverable.id == deliverable_id, Project.user_id == current_user.id)
    )
    deliverable = result.scalar_one_or_none()

    if not deliverable:
        return error_response(
            ErrorCodes.NOT_FOUND,
            "Deliverable not found",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    # Check if deliverable is already billed
    if deliverable.status == "billed":
        return error_response(
            ErrorCodes.INVALID_INPUT,
            "Cannot delete a billed deliverable",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    # Store data before deletion
    milestone_id = deliverable.milestone_id
    deliverable_title = deliverable.title
    project_id = deliverable.project_id

    await db.delete(deliverable)
    await db.commit()

    # Update milestone counts if deliverable was linked to a milestone
    if milestone_id:
        from app.services.milestone_service import update_milestone_completion_status

        await update_milestone_completion_status(db, milestone_id)

    # Log activity for deliverable deletion
    await log_deliverable_activity(
        db=db,
        user_id=current_user.id,
        deliverable_id=deliverable_id,
        action="deleted",
        title=f"Deleted deliverable: {deliverable_title}",
    )

    return success_response(data={"id": deliverable_id}, message="Deliverable deleted successfully")


@router.post("/{deliverable_id}/verify", response_model=dict)
async def verify_deliverable(
    deliverable_id: UUID,
    verification_data: DeliverableVerification,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Manually verify a deliverable with PR URL.
    Fetches PR status from Git provider API and verifies merge status.
    Auto-marks as "Ready to Bill" when verified.
    Allows manual override with justification.

    Requirements: 8.2, 8.6, 8.7
    """
    # Get deliverable and verify ownership through project
    result = await db.execute(
        select(Deliverable)
        .join(Project, Deliverable.project_id == Project.id)
        .where(Deliverable.id == deliverable_id, Project.user_id == current_user.id)
    )
    deliverable = result.scalar_one_or_none()

    if not deliverable:
        return error_response(
            ErrorCodes.NOT_FOUND,
            "Deliverable not found",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    # Get project for provider token
    project_result = await db.execute(select(Project).where(Project.id == deliverable.project_id))
    project = project_result.scalar_one_or_none()

    if verification_data.manual_override:
        # Manual override - mark as verified without PR check
        if not verification_data.justification:
            return error_response(
                ErrorCodes.INVALID_INPUT,
                "Justification is required for manual override",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        deliverable.status = "verified"
        deliverable.verified_at = datetime.utcnow()
        deliverable.auto_verified = False
        deliverable.git_pr_url = verification_data.pr_url if verification_data.pr_url else None

        await db.commit()
        await db.refresh(deliverable)

        return success_response(
            data=DeliverableResponse.model_validate(deliverable),
            message=f"Deliverable manually verified. Justification: {verification_data.justification}",
        )

    # Automatic verification via Git provider API
    try:
        # Detect provider from PR URL
        provider = detect_provider_from_url(verification_data.pr_url)

        # Get user's OAuth token for the provider
        access_token = getattr(current_user, f"{provider}_access_token", None)

        if not access_token:
            return error_response(
                ErrorCodes.INVALID_INPUT,
                f"No {provider} access token found. Please connect your {provider} account or use manual override.",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        # Fetch PR status from Git provider
        client = get_git_client(provider, access_token)
        pr_status = await client.get_pr_status(verification_data.pr_url)

        if pr_status.get("error"):
            return error_response(
                ErrorCodes.INVALID_INPUT,
                f"Failed to fetch PR status: {pr_status['error']}",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        # Update deliverable with PR information
        deliverable.git_pr_url = verification_data.pr_url
        deliverable.git_pr_number = pr_status.get("pr_number")
        deliverable.git_commit_hash = pr_status.get("commit_sha")
        deliverable.git_merge_status = "merged" if pr_status.get("merged") else pr_status.get("state")

        # Check if PR is merged
        if pr_status.get("merged"):
            deliverable.status = "verified"
            deliverable.verified_at = pr_status.get("merged_at") or datetime.utcnow()
            deliverable.auto_verified = True

            await db.commit()
            await db.refresh(deliverable)

            # Log activity for deliverable verification
            await log_deliverable_activity(
                db=db,
                user_id=current_user.id,
                deliverable_id=deliverable.id,
                action="verified",
                title=f"Deliverable verified: {deliverable.title}",
                description="PR merged and auto-verified",
            )

            return success_response(
                data=DeliverableResponse.model_validate(deliverable),
                message="Deliverable verified successfully. PR is merged.",
            )
        else:
            # PR is not merged yet
            deliverable.status = "in_progress"

            await db.commit()
            await db.refresh(deliverable)

            return success_response(
                data=DeliverableResponse.model_validate(deliverable),
                message=f"PR is not merged yet. Current status: {pr_status.get('state')}",
            )

    except HTTPException:
        raise
    except Exception as e:
        return error_response(
            ErrorCodes.INVALID_INPUT,
            f"Error verifying deliverable: {str(e)}",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@router.post("/{deliverable_id}/mark-ready-to-bill", response_model=dict)
async def mark_ready_to_bill(
    deliverable_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Mark a verified deliverable as "Ready to Bill".
    This is typically done after all deliverables in a milestone are completed.

    Requirements: 8.6
    """
    # Get deliverable and verify ownership through project
    result = await db.execute(
        select(Deliverable)
        .join(Project, Deliverable.project_id == Project.id)
        .where(Deliverable.id == deliverable_id, Project.user_id == current_user.id)
    )
    deliverable = result.scalar_one_or_none()

    if not deliverable:
        return error_response(
            ErrorCodes.NOT_FOUND,
            "Deliverable not found",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    # Check if deliverable is verified
    if deliverable.status not in ["verified", "completed"]:
        return error_response(
            ErrorCodes.INVALID_INPUT,
            f"Cannot mark deliverable as ready to bill. Current status: {deliverable.status}. Deliverable must be verified or completed first.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    # Mark as ready to bill
    deliverable.status = "ready_to_bill"

    await db.commit()
    await db.refresh(deliverable)

    # Check if milestone is now complete
    completed_milestone = await check_milestone_completion(db, deliverable_id)

    # Log activity for ready to bill
    await log_deliverable_activity(
        db=db,
        user_id=current_user.id,
        deliverable_id=deliverable.id,
        action="ready_to_bill",
        title=f"Ready to bill: {deliverable.title}",
    )

    # TODO: Publish deliverable.ready_to_bill event to NATS

    if completed_milestone:
        # Create notification for milestone completion
        from app.models.project import Project as ProjectModel

        project_result = await db.execute(select(ProjectModel).where(ProjectModel.id == deliverable.project_id))
        project = project_result.scalar_one_or_none()

        await create_notification(
            db=db,
            user_id=current_user.id,
            notification_type="update",
            title="Milestone complete!",
            message=f"Milestone '{completed_milestone.name}' is ready for invoicing",
            action_url="/invoices",
            entity_type="milestone",
            entity_id=completed_milestone.id,
        )

        # TODO: Publish milestone.completed event to NATS
        # TODO: Trigger automated invoice generation
        return success_response(
            data=DeliverableResponse.model_validate(deliverable),
            message=f"Deliverable marked as ready to bill. Milestone '{completed_milestone.name}' is now complete and ready for invoicing!",
        )

    return success_response(
        data=DeliverableResponse.model_validate(deliverable),
        message="Deliverable marked as ready to bill",
    )


# Documentation Endpoints


@router.get("/{deliverable_id}/documentation", response_model=dict)
async def get_deliverable_documentation(
    deliverable_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get auto-generated documentation for a deliverable.

    Extracts:
    - Acceptance criteria
    - Solution summary from PR description
    - Commit messages
    - Technical notes

    Requirements: 13.1, 13.2, 13.4
    """
    # Get deliverable
    result = await db.execute(select(Deliverable).where(Deliverable.id == deliverable_id))
    deliverable = result.scalar_one_or_none()

    if not deliverable:
        return error_response(
            ErrorCodes.NOT_FOUND,
            "Deliverable not found",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    # Verify project belongs to user
    result = await db.execute(select(Project).where(Project.id == deliverable.project_id, Project.user_id == current_user.id))
    project = result.scalar_one_or_none()

    if not project:
        return error_response(
            ErrorCodes.NOT_FOUND,
            "Project not found or access denied",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    # Return existing documentation if available
    if deliverable.documentation_markdown:
        return success_response(
            data={
                "deliverable_id": deliverable_id,
                "documentation": deliverable.documentation_markdown,
                "generated_at": (
                    deliverable.documentation_generated_at.isoformat() if deliverable.documentation_generated_at else None
                ),
                "format": "markdown",
            },
            message="Deliverable documentation retrieved successfully",
        )

    # Generate documentation if not available
    try:
        from app.services.documentation import DocumentationService

        doc_service = DocumentationService(db)
        documentation = await doc_service.generate_deliverable_documentation(deliverable_id)

        return success_response(
            data={
                "deliverable_id": deliverable_id,
                "documentation": documentation,
                "generated_at": datetime.utcnow().isoformat(),
                "format": "markdown",
            },
            message="Deliverable documentation generated successfully",
        )
    except Exception as e:
        return error_response(
            ErrorCodes.INTERNAL_ERROR,
            f"Failed to generate deliverable documentation: {str(e)}",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@router.post("/{deliverable_id}/regenerate-documentation", response_model=dict)
async def regenerate_deliverable_documentation(
    deliverable_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Regenerate documentation for a deliverable.

    Useful when:
    - PR description has been updated
    - Additional commits have been made
    - Developer wants to refresh the documentation

    Requirements: 13.5
    """
    # Get deliverable
    result = await db.execute(select(Deliverable).where(Deliverable.id == deliverable_id))
    deliverable = result.scalar_one_or_none()

    if not deliverable:
        return error_response(
            ErrorCodes.NOT_FOUND,
            "Deliverable not found",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    # Verify project belongs to user
    result = await db.execute(select(Project).where(Project.id == deliverable.project_id, Project.user_id == current_user.id))
    project = result.scalar_one_or_none()

    if not project:
        return error_response(
            ErrorCodes.NOT_FOUND,
            "Project not found or access denied",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    try:
        from app.services.documentation import DocumentationService

        doc_service = DocumentationService(db)
        documentation = await doc_service.generate_deliverable_documentation(deliverable_id)

        return success_response(
            data={
                "deliverable_id": deliverable_id,
                "documentation": documentation,
                "generated_at": datetime.utcnow().isoformat(),
                "format": "markdown",
            },
            message="Deliverable documentation regenerated successfully",
        )
    except Exception as e:
        return error_response(
            ErrorCodes.INTERNAL_ERROR,
            f"Failed to regenerate deliverable documentation: {str(e)}",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@router.get("/{deliverable_id}/activity", response_model=dict)
async def get_deliverable_activity(
    deliverable_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get detailed activity preview for a deliverable (Developer View).
    Allows developers to see exactly what the client will see.

    Requirements: Phase 7
    """
    # Get deliverable and verify ownership through project
    result = await db.execute(
        select(Deliverable)
        .join(Project, Deliverable.project_id == Project.id)
        .where(Deliverable.id == deliverable_id, Project.user_id == current_user.id)
    )
    deliverable = result.scalar_one_or_none()

    if not deliverable:
        return error_response(
            ErrorCodes.NOT_FOUND,
            "Deliverable not found",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    # Get time entries
    time_stmt = select(TimeEntry).where(TimeEntry.deliverable_id == deliverable.id).order_by(TimeEntry.start_time)
    time_result = await db.execute(time_stmt)
    time_entries = time_result.scalars().all()

    # Get commits
    commit_stmt = select(GitCommit).where(GitCommit.deliverable_id == deliverable.id).order_by(GitCommit.committed_at)
    commit_result = await db.execute(commit_stmt)
    commits = commit_result.scalars().all()

    # Calculate metrics - pass commits directly to avoid lazy loading
    activity_score = ActivityMetricsService.calculate_activity_score(deliverable, commits=commits)
    fraud_risk = ActivityMetricsService.classify_fraud_risk(activity_score, float(deliverable.actual_hours or 0), len(commits))

    # Build timeline
    timeline = []

    for entry in time_entries:
        # Ensure timezone-naive timestamp
        timestamp = entry.start_time
        if timestamp and timestamp.tzinfo is not None:
            timestamp = timestamp.replace(tzinfo=None)

        timeline.append(
            TimelineEvent(
                type="time_entry",
                timestamp=timestamp,
                description=entry.description or "Time tracked",
                duration_hours=(float(entry.duration_minutes / 60) if entry.duration_minutes else 0),
            )
        )

    for commit in commits:
        # Ensure timezone-naive timestamp
        timestamp = commit.committed_at
        if timestamp and timestamp.tzinfo is not None:
            timestamp = timestamp.replace(tzinfo=None)

        timeline.append(
            TimelineEvent(
                type="commit",
                timestamp=timestamp,
                description=commit.message,
                files_changed=commit.files_changed,
                commit_sha=commit.commit_sha,
            )
        )

    # Sort timeline
    timeline.sort(key=lambda x: x.timestamp)

    # Calculate totals
    total_files = sum(c.files_changed or 0 for c in commits)
    total_insertions = sum(c.insertions or 0 for c in commits)
    total_deletions = sum(c.deletions or 0 for c in commits)
    hours = float(deliverable.actual_hours or 0)
    commit_density = len(commits) / hours if hours > 0 else 0

    metrics = ActivityMetrics(
        total_commits=len(commits),
        total_files_changed=total_files,
        total_insertions=total_insertions,
        total_deletions=total_deletions,
        commit_density=commit_density,
        activity_score=activity_score,
        fraud_risk=fraud_risk,
    )

    # Validate timeline - pass time_entries and commits directly to avoid lazy loading
    validation_results = TimelineValidator.validate_time_commit_correlation(
        deliverable, time_entries=time_entries, commits=commits
    )

    timeline_validation = TimelineValidationResponse(
        commits_outside=validation_results["commits_outside"],
        commits_in_grace_period=validation_results["commits_in_grace_period"],
        outside_percentage=validation_results["outside_percentage"],
        is_suspicious=validation_results["is_suspicious"],
        needs_review=validation_results["needs_review"],
        summary=validation_results["summary"],
    )

    # Format response
    response_data = DeliverableActivityResponse(
        deliverable={
            "id": deliverable.id,
            "title": deliverable.title,
            "status": deliverable.status,
            "work_type": deliverable.work_type,
            "actual_hours": float(deliverable.actual_hours or 0),
            "total_cost": float(deliverable.total_cost or 0),
        },
        time_entries=[
            {
                "id": t.id,
                "start_time": t.start_time,
                "end_time": t.end_time,
                "duration_hours": (float(t.duration_minutes / 60) if t.duration_minutes else 0),
                "description": t.description,
                "developer_notes": t.developer_notes,  # Developer sees all notes
                "notes_visible_to_client": t.notes_visible_to_client,
            }
            for t in time_entries
        ],
        commits=[
            {
                "sha": c.commit_sha,
                "message": c.message,
                "author": c.author_email,
                "committed_at": c.committed_at,
                "files_changed": c.files_changed,
                "insertions": c.insertions,
                "deletions": c.deletions,
            }
            for c in commits
        ],
        activity_metrics=metrics,
        timeline=timeline,
        timeline_validation=timeline_validation,
    )

    return success_response(
        data=response_data,
        message="Deliverable activity preview retrieved successfully",
    )
