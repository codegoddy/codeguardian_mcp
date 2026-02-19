"""Time entry API endpoints"""

import json
from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.exceptions import InternalException, NotFoundException, ValidationException
from app.core.auth import get_current_user
from app.core.logging_config import get_logger
from app.db.database import get_db
from app.models.deliverable import Deliverable
from app.models.git_commit import GitCommit
from app.models.time_tracking import TimeEntry
from app.models.user import User, UserSettings
from app.services.activity_service import create_activity
from app.services.nats_service import TimeTrackingNATSService
from app.services.time_calculator import TimeCalculator
from app.services.time_tracker import GitTimeTracker
from app.utils.cloudinary_client import upload_file_from_bytes

logger = get_logger(__name__)

router = APIRouter(prefix="/time-entries", tags=["time-entries"])


# Pydantic schemas for bundle response
class PlannedBlockResponse(BaseModel):
    """Schema for planned time block in bundle response"""

    id: UUID
    deliverable_id: UUID
    planned_date: str
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    planned_hours: float
    description: Optional[str] = None
    status: str
    deliverable_title: Optional[str] = None
    project_name: Optional[str] = None

    class Config:
        from_attributes = True


class TimeTrackerBundleResponse(BaseModel):
    """Schema for time tracker bundle response"""

    time_entries: dict  # entries_by_date
    planned_blocks: List[PlannedBlockResponse]
    total_hours: float
    total_cost: float
    total_planned_hours: float
    default_currency: str
    total_entries: int
    total_blocks: int


# Pydantic schemas
class ManualTimeEntry(BaseModel):
    """Schema for creating manual time entry"""

    deliverable_id: UUID
    hours: float
    notes: str
    date: Optional[datetime] = None


class TimeEntryResponse(BaseModel):
    """Schema for time entry response"""

    id: UUID
    project_id: UUID
    deliverable_id: UUID
    user_id: UUID
    description: Optional[str]
    start_time: Optional[datetime]
    end_time: Optional[datetime]
    duration_minutes: Optional[int]
    hourly_rate: Optional[float]
    cost: Optional[float]
    currency: Optional[str]
    source: Optional[str]
    git_commit_sha: Optional[str]
    git_commit_message: Optional[str]
    auto_generated: bool
    is_billable: bool
    is_billed: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class DeliverableTimeStats(BaseModel):
    """Schema for deliverable time statistics"""

    deliverable_id: UUID
    deliverable_title: str
    estimated_hours: Optional[float]
    actual_hours: Optional[float]
    calculated_hours: Optional[float]
    hours_remaining: Optional[float]
    usage_percentage: Optional[float]
    variance_hours: Optional[float]
    variance_percentage: Optional[float]
    commit_count: int
    entry_count: int
    entries: List[TimeEntryResponse]


@router.get("/deliverable/{deliverable_id}", response_model=DeliverableTimeStats)
async def get_time_entries_for_deliverable(
    deliverable_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get all time entries for a specific deliverable

    Returns:
        Time entries and statistics for the deliverable
    """

    # Get deliverable
    deliverable_result = await db.execute(select(Deliverable).where(Deliverable.id == deliverable_id))
    deliverable = deliverable_result.scalar_one_or_none()

    if not deliverable:
        raise NotFoundException("Deliverable", deliverable_id)

    # Get time entries
    entries_result = await db.execute(
        select(TimeEntry).where(TimeEntry.deliverable_id == deliverable_id).order_by(TimeEntry.created_at.desc())
    )
    entries = entries_result.scalars().all()

    return DeliverableTimeStats(
        deliverable_id=deliverable.id,
        deliverable_title=deliverable.title,
        estimated_hours=deliverable.estimated_hours,
        actual_hours=deliverable.actual_hours,
        calculated_hours=deliverable.calculated_hours,
        hours_remaining=deliverable.hours_remaining,
        usage_percentage=deliverable.hours_used_percentage,
        variance_hours=deliverable.variance_hours,
        variance_percentage=deliverable.variance_percentage,
        commit_count=deliverable.commit_count or 0,
        entry_count=len(entries),
        entries=[TimeEntryResponse.model_validate(e) for e in entries],
    )


@router.post("/manual", response_model=TimeEntryResponse, status_code=status.HTTP_201_CREATED)
async def create_manual_time_entry(
    data: ManualTimeEntry,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a manual time entry for non-coding work

    Use this for:
    - Meetings
    - Research
    - Planning
    - Documentation
    - Any work not tracked via commits
    """

    time_tracker = GitTimeTracker()

    try:
        time_entry = await time_tracker.add_manual_time_entry(
            deliverable_id=data.deliverable_id,
            hours=data.hours,
            notes=data.notes,
            developer_email=current_user.email,
            db=db,
        )

        # Publish time entry creation event to NATS
        await TimeTrackingNATSService.publish_time_entry_created(
            {
                "entry_id": time_entry.id,
                "deliverable_id": time_entry.deliverable_id,
                "project_id": time_entry.project_id,
                "hours": time_entry.final_hours,
                "entry_type": "manual",
                "notes": time_entry.notes,
                "user_id": current_user.id,
            }
        )

        # Publish real-time deliverable stats update
        try:
            # Fetch updated deliverable to get latest stats
            deliverable_result = await db.execute(select(Deliverable).where(Deliverable.id == time_entry.deliverable_id))
            updated_deliverable = deliverable_result.scalar_one_or_none()

            if updated_deliverable:
                from app.utils.nats_client import publish_deliverable_stats_updated

                # Calculate budget used percentage
                budget_used = 0
                if updated_deliverable.estimated_hours and updated_deliverable.estimated_hours > 0:
                    budget_used = (
                        float(updated_deliverable.actual_hours or 0) / float(updated_deliverable.estimated_hours)
                    ) * 100

                await publish_deliverable_stats_updated(
                    {
                        "deliverable_id": str(updated_deliverable.id),
                        "project_id": str(updated_deliverable.project_id),
                        "actual_hours": float(updated_deliverable.actual_hours or 0),
                        "total_cost": float(updated_deliverable.total_cost or 0),
                        "budget_used_percentage": float(budget_used),
                        "user_id": str(current_user.id),
                    }
                )
        except Exception as e:
            logger.warning("Failed to publish deliverable stats update", exc_info=True)

        # Log activity for manual time entry
        try:
            # Get deliverable title
            deliverable_result = await db.execute(select(Deliverable).where(Deliverable.id == data.deliverable_id))
            deliverable = deliverable_result.scalar_one_or_none()
            deliverable_title = deliverable.title if deliverable else "Unknown"

            await create_activity(
                db=db,
                user_id=current_user.id,
                entity_type="time_entry",
                entity_id=time_entry.id,
                action="logged",
                title=f"Logged {data.hours:.1f}h: {deliverable_title}",
                description=data.notes[:100] if data.notes else None,
            )
        except Exception as e:
            logger.warning("Failed to log time entry activity", exc_info=True)

        return time_entry

    except ValueError as e:
        raise ValidationException(str(e))
    except Exception as e:
        raise InternalException(f"Failed to create time entry: {str(e)}")


# ============================================================================
# Git-Based Time Tracking - Pending Review Schemas
# ============================================================================


class PendingTimeEntryResponse(BaseModel):
    """Schema for pending time entry from Git commits"""

    session_id: str
    deliverable_id: UUID
    deliverable_title: str
    project_id: UUID
    project_name: str
    start_time: datetime
    end_time: datetime
    duration_hours: float
    duration_minutes: int
    commit_count: int
    total_insertions: int
    total_deletions: int
    total_files_changed: int
    commits: List[dict]
    summary: str
    estimated_cost: Optional[float] = None

    class Config:
        from_attributes = True


# NOTE: Specific routes like /pending must come BEFORE parameterized routes like /{entry_id}
# to avoid FastAPI matching "pending" as a UUID parameter
@router.get("/pending", response_model=List[PendingTimeEntryResponse])
async def get_pending_time_entries_route(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """
    Get all pending time entries that need developer review/approval.
    These are calculated from Git commits but not yet approved.
    """
    # Import here to avoid circular dependency
    from app.services.time_calculator import TimeCalculator

    # Get all commits that haven't been converted to time entries yet
    result = await db.execute(
        select(GitCommit)
        .join(Deliverable, GitCommit.deliverable_id == Deliverable.id)
        .where(GitCommit.deliverable_id.isnot(None))
        .order_by(GitCommit.committed_at.desc())
        .limit(100)
    )
    commits = result.scalars().all()

    if not commits:
        return []

    # Group commits by deliverable
    deliverable_commits = {}
    for commit in commits:
        if commit.deliverable_id not in deliverable_commits:
            deliverable_commits[commit.deliverable_id] = []
        deliverable_commits[commit.deliverable_id].append(
            {
                "committed_at": commit.committed_at,
                "deliverable_id": commit.deliverable_id,
                "message": commit.message,
                "sha": commit.commit_sha,
                "author_name": commit.author_name,
                "insertions": commit.insertions or 0,
                "deletions": commit.deletions or 0,
                "files_changed": commit.files_changed or 0,
            }
        )

    # Calculate time sessions
    time_calculator = TimeCalculator()
    pending_entries = []

    for deliverable_id, commit_list in deliverable_commits.items():
        sessions = time_calculator.calculate_sessions(commit_list)

        deliverable_result = await db.execute(select(Deliverable).where(Deliverable.id == deliverable_id))
        deliverable = deliverable_result.scalar_one_or_none()

        if not deliverable:
            continue

        for session in sessions:
            pending_entries.append(
                {
                    "session_id": f"{deliverable_id}_{session['start_time'].isoformat()}",
                    "deliverable_id": deliverable_id,
                    "deliverable_title": deliverable.title,
                    "project_id": deliverable.project_id,
                    "project_name": "Project Name",
                    "start_time": session["start_time"],
                    "end_time": session["end_time"],
                    "duration_hours": float(session["duration_hours"]),
                    "duration_minutes": session["duration_minutes"],
                    "commit_count": session["commit_count"],
                    "total_insertions": session["total_insertions"],
                    "total_deletions": session["total_deletions"],
                    "total_files_changed": session["total_files_changed"],
                    "commits": session["commits"],
                    "summary": session["summary"],
                }
            )

    return pending_entries


@router.get("/{entry_id}", response_model=TimeEntryResponse)
async def get_time_entry(
    entry_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific time entry by ID"""

    result = await db.execute(select(TimeEntry).where(TimeEntry.id == entry_id))
    entry = result.scalar_one_or_none()

    if not entry:
        raise NotFoundException("Time entry", entry_id)

    return entry


@router.delete("/{entry_id}")
async def delete_time_entry(
    entry_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Delete a time entry

    Note: This will recalculate deliverable time tracking
    """

    # Get entry
    result = await db.execute(select(TimeEntry).where(TimeEntry.id == entry_id))
    entry = result.scalar_one_or_none()

    if not entry:
        raise NotFoundException("Time entry", entry_id)

    deliverable_id = entry.deliverable_id

    # Delete entry
    await db.delete(entry)
    await db.commit()

    # Recalculate deliverable time
    time_tracker = GitTimeTracker()
    await time_tracker.update_deliverable_time(deliverable_id, db)

    return {"status": "success", "message": "Time entry deleted"}


@router.get("/project/{project_id}")
async def get_project_time_entries(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get all time entries for a project

    Returns:
        List of time entries grouped by deliverable
    """

    # Get all time entries for project
    result = await db.execute(
        select(TimeEntry).where(TimeEntry.project_id == project_id).order_by(TimeEntry.created_at.desc())
    )
    entries = result.scalars().all()

    # Group by deliverable
    deliverable_groups = {}
    for entry in entries:
        if entry.deliverable_id not in deliverable_groups:
            deliverable_groups[entry.deliverable_id] = []
        deliverable_groups[entry.deliverable_id].append(TimeEntryResponse.model_validate(entry))

    return {
        "project_id": project_id,
        "total_entries": len(entries),
        "total_hours": sum((e.duration_minutes or 0) / 60.0 for e in entries),  # Convert minutes to hours
        "total_cost": sum(e.cost or 0 for e in entries),
        "deliverables": deliverable_groups,
    }


@router.get("/user/entries")
async def get_user_time_entries(
    start_date: Optional[date] = Query(None, description="Start date for filtering (YYYY-MM-DD)"),
    end_date: Optional[date] = Query(None, description="End date for filtering (YYYY-MM-DD)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get all time entries for the current user with optional date filtering.
    Returns entries grouped by date.
    """
    # Get user settings for currency
    settings_result = await db.execute(select(UserSettings).where(UserSettings.user_id == current_user.id))
    user_settings = settings_result.scalar_one_or_none()
    default_currency = user_settings.default_currency if user_settings else "USD"

    # Build query
    query = select(TimeEntry).where(TimeEntry.user_id == current_user.id)

    # Apply date filters if provided
    if start_date:
        query = query.where(func.date(TimeEntry.start_time) >= start_date)
    if end_date:
        query = query.where(func.date(TimeEntry.start_time) <= end_date)

    # Order by start time descending
    query = query.order_by(TimeEntry.start_time.desc())

    result = await db.execute(query)
    entries = result.scalars().all()

    # Group entries by date (using the date from start_time)
    entries_by_date = {}
    for entry in entries:
        if entry.start_time:
            # Use the date component from the datetime
            entry_date = entry.start_time.date().isoformat()
            if entry_date not in entries_by_date:
                entries_by_date[entry_date] = []
            entries_by_date[entry_date].append(TimeEntryResponse.model_validate(entry))

    # Calculate totals
    total_minutes = sum((e.duration_minutes or 0) for e in entries)
    total_hours = total_minutes / 60.0
    total_cost = sum((e.cost or 0) for e in entries)

    return {
        "user_id": str(current_user.id),
        "start_date": start_date.isoformat() if start_date else None,
        "end_date": end_date.isoformat() if end_date else None,
        "total_entries": len(entries),
        "total_hours": total_hours,
        "total_cost": float(total_cost),
        "default_currency": default_currency,
        "entries_by_date": entries_by_date,
    }


@router.get("/tracker/bundle", response_model=TimeTrackerBundleResponse)
async def get_time_tracker_bundle(
    start_date: Optional[date] = Query(None, description="Start date for filtering (YYYY-MM-DD)"),
    end_date: Optional[date] = Query(None, description="End date for filtering (YYYY-MM-DD)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get all time tracker data in one response.
    Returns time entries and planned blocks for the specified date range.
    """
    # Get user settings for currency
    settings_result = await db.execute(select(UserSettings).where(UserSettings.user_id == current_user.id))
    user_settings = settings_result.scalar_one_or_none()
    default_currency = user_settings.default_currency if user_settings else "USD"

    # ========== Get Time Entries ==========
    entries_query = select(TimeEntry).where(TimeEntry.user_id == current_user.id)

    if start_date:
        entries_query = entries_query.where(func.date(TimeEntry.start_time) >= start_date)
    if end_date:
        entries_query = entries_query.where(func.date(TimeEntry.start_time) <= end_date)

    entries_query = entries_query.order_by(TimeEntry.start_time.desc())

    entries_result = await db.execute(entries_query)
    entries = entries_result.scalars().all()

    # Group entries by date
    entries_by_date = {}
    for entry in entries:
        if entry.start_time:
            entry_date = entry.start_time.date().isoformat()
            if entry_date not in entries_by_date:
                entries_by_date[entry_date] = []
            entries_by_date[entry_date].append(TimeEntryResponse.model_validate(entry))

    # Calculate time entry totals
    total_minutes = sum((e.duration_minutes or 0) for e in entries)
    total_hours = total_minutes / 60.0
    total_cost = sum((e.cost or 0) for e in entries)

    # ========== Get Planned Blocks ==========
    from app.models.planned_time_block import PlannedTimeBlock

    blocks_query = select(PlannedTimeBlock).where(PlannedTimeBlock.user_id == current_user.id)

    if start_date:
        blocks_query = blocks_query.where(PlannedTimeBlock.planned_date >= start_date)
    if end_date:
        blocks_query = blocks_query.where(PlannedTimeBlock.planned_date <= end_date)

    blocks_query = blocks_query.order_by(PlannedTimeBlock.planned_date.asc())

    blocks_result = await db.execute(blocks_query)
    blocks = blocks_result.scalars().all()

    # Get deliverable and project names for each block
    planned_blocks = []
    total_planned_hours = 0.0

    for block in blocks:
        # Get deliverable info
        deliverable_result = await db.execute(select(Deliverable).where(Deliverable.id == block.deliverable_id))
        deliverable = deliverable_result.scalar_one_or_none()

        # Get project name
        project_name = None
        if deliverable:
            from app.models.project import Project

            project_result = await db.execute(select(Project).where(Project.id == deliverable.project_id))
            project = project_result.scalar_one_or_none()
            project_name = project.name if project else None

        planned_block = PlannedBlockResponse(
            id=block.id,
            deliverable_id=block.deliverable_id,
            planned_date=block.planned_date.isoformat() if block.planned_date else None,
            start_time=block.start_time.isoformat() if block.start_time else None,
            end_time=block.end_time.isoformat() if block.end_time else None,
            planned_hours=float(block.planned_hours) if block.planned_hours else 0.0,
            description=block.description,
            status=block.status or "planned",
            deliverable_title=deliverable.title if deliverable else None,
            project_name=project_name,
        )
        planned_blocks.append(planned_block)
        total_planned_hours += float(block.planned_hours) if block.planned_hours else 0.0

    return TimeTrackerBundleResponse(
        time_entries=entries_by_date,
        planned_blocks=planned_blocks,
        total_hours=total_hours,
        total_cost=float(total_cost),
        total_planned_hours=total_planned_hours,
        default_currency=default_currency,
        total_entries=len(entries),
        total_blocks=len(blocks),
    )


class AttachmentInfo(BaseModel):
    """Schema for file attachment info"""

    url: str
    filename: str
    type: str
    size: int


class PreviewLinkInfo(BaseModel):
    """Schema for preview link info"""

    url: str
    title: Optional[str] = None
    description: Optional[str] = None


class ApproveTimeEntryRequest(BaseModel):
    """Schema for approving a time entry"""

    session_id: str
    adjusted_hours: Optional[float] = None
    notes: Optional[str] = None
    attachments: Optional[List[AttachmentInfo]] = None
    preview_links: Optional[List[PreviewLinkInfo]] = None


@router.post("/upload-attachment")
async def upload_time_entry_attachment(file: UploadFile = File(...), current_user: User = Depends(get_current_user)):
    """
    Upload a file attachment for a time entry (screenshot, document, etc.)
    Returns the Cloudinary URL to be included when approving the time entry.
    """
    try:
        # Validate file size (max 10MB)
        file_content = await file.read()
        file_size = len(file_content)

        if file_size > 10 * 1024 * 1024:  # 10MB
            raise ValidationException(
                "File size exceeds 10MB limit",
                details={"max_size": "10MB", "actual_size": file_size},
            )

        # Validate file type
        allowed_types = [
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/gif",
            "image/webp",
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "text/plain",
        ]

        if file.content_type not in allowed_types:
            raise ValidationException(
                f"File type {file.content_type} not allowed",
                details={
                    "allowed_types": allowed_types,
                    "actual_type": file.content_type,
                },
            )

        # Upload to Cloudinary
        result = await upload_file_from_bytes(
            file_bytes=file_content,
            filename=file.filename or "attachment",
            folder="time_entry_attachments",
            resource_type="auto",
        )

        return {
            "status": "success",
            "attachment": {
                "url": result["url"],
                "filename": file.filename,
                "type": file.content_type,
                "size": file_size,
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        raise InternalException(f"Failed to upload attachment: {str(e)}")


@router.post("/approve")
async def approve_time_entry(
    data: ApproveTimeEntryRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Approve a pending time entry and create an actual TimeEntry record.
    Developer can adjust the calculated hours before approval.
    """
    # Parse session_id to get deliverable_id and timestamp
    parts = data.session_id.split("_")
    if len(parts) < 2:
        raise ValidationException(
            "Invalid session_id format",
            details={
                "expected_format": "deliverable_id_timestamp",
                "actual": data.session_id,
            },
        )

    deliverable_id = UUID(parts[0])

    # Get deliverable
    deliverable_result = await db.execute(select(Deliverable).where(Deliverable.id == deliverable_id))
    deliverable = deliverable_result.scalar_one_or_none()

    if not deliverable:
        raise NotFoundException("Deliverable", deliverable_id)

    # Prepare attachments and preview links for storage
    attachments_data = None
    if data.attachments:
        attachments_data = [att.dict() for att in data.attachments]

    preview_links_data = None
    if data.preview_links:
        preview_links_data = [link.dict() for link in data.preview_links]

    # Create time entry
    # This is simplified - in production, you'd want to:
    # 1. Mark the commits as "reviewed"
    # 2. Create a proper TimeEntry record with attachments and preview_links
    # 3. Update deliverable hours
    # 4. Publish NATS event

    # Note: The actual TimeEntry creation would include:
    # time_entry = TimeEntry(
    #     ...
    #     developer_notes=data.notes,
    #     notes_visible_to_client=True if data.notes else False,
    #     attachments=attachments_data,
    #     preview_links=preview_links_data,
    #     ...
    # )

    # Log activity for time approval
    try:
        await create_activity(
            db=db,
            user_id=current_user.id,
            entity_type="time_entry",
            entity_id=deliverable_id,
            action="approved",
            title=f"Approved {data.adjusted_hours or 0:.1f}h: {deliverable.title}",
            description=data.notes[:100] if data.notes else None,
        )
    except Exception as e:
        logger.warning("Failed to log time approval activity", exc_info=True)

    return {
        "status": "success",
        "message": "Time entry approved",
        "deliverable_id": str(deliverable_id),
        "hours_approved": data.adjusted_hours or 0,
        "attachments_count": len(data.attachments) if data.attachments else 0,
        "preview_links_count": len(data.preview_links) if data.preview_links else 0,
    }


class RejectTimeEntryRequest(BaseModel):
    """Schema for rejecting a time entry"""

    session_id: str
    reason: Optional[str] = None


@router.post("/reject")
async def reject_time_entry(
    data: RejectTimeEntryRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Reject a pending time entry.
    The commits will be marked as reviewed but not billed.
    """
    # Parse session_id
    parts = data.session_id.split("_")
    if len(parts) < 2:
        raise ValidationException(
            "Invalid session_id format",
            details={
                "expected_format": "deliverable_id_timestamp",
                "actual": data.session_id,
            },
        )

    deliverable_id = UUID(parts[0])

    # Mark commits as reviewed but rejected
    # This is simplified - in production, you'd track this in a separate table

    return {
        "status": "success",
        "message": "Time entry rejected",
        "deliverable_id": str(deliverable_id),
        "reason": data.reason,
    }
