"""Session manager service for CLI time tracking."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy import and_, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.logging_config import get_logger
from app.models.client import Client
from app.models.deliverable import Deliverable
from app.models.project import Project
from app.models.time_session import TimeSession
from app.models.time_tracking import TimeEntry
from app.models.user import UserSettings
from app.schemas.time_session import (
    TimeSessionCreate,
    TimeSessionResponse,
    TimeSessionUpdate,
)
from app.utils.nats_publishers import publish_session_stopped

logger = get_logger(__name__)


class SessionManager:
    """Manages CLI time tracking sessions."""

    @staticmethod
    async def start_session(
        db: AsyncSession,
        user_id: UUID,
        tracking_code: str,
        client_session_id: str,
        work_type: Optional[str] = None,
        repo_url: Optional[str] = None,
    ) -> TimeSessionResponse:
        """Start a new time tracking session."""

        # Find deliverable by tracking code
        result = await db.execute(
            select(Deliverable, Project)
            .join(Project, Deliverable.project_id == Project.id)
            .where(
                and_(
                    Deliverable.tracking_code == tracking_code,
                    Project.user_id == user_id,
                )
            )
        )
        row = result.first()

        if not row:
            raise ValueError(f"Deliverable with tracking code '{tracking_code}' not found")

        deliverable, project = row

        # Ensure webhook is set up if repo_url is provided
        if repo_url:
            await SessionManager._ensure_webhook_setup(db, user_id, project.id, repo_url)

        # Check for existing active session for this deliverable
        existing = await db.execute(
            select(TimeSession).where(
                and_(
                    TimeSession.user_id == user_id,
                    TimeSession.deliverable_id == deliverable.id,
                    TimeSession.status == "active",
                )
            )
        )
        if existing.scalar_one_or_none():
            raise ValueError(f"Active session already exists for {tracking_code}")

        # Check for duplicate client_session_id (idempotency)
        existing_client = await db.execute(select(TimeSession).where(TimeSession.client_session_id == client_session_id))
        existing_session = existing_client.scalar_one_or_none()
        if existing_session:
            # Return existing session (idempotent)
            return await SessionManager._to_response(db, existing_session)

        # Auto-transition deliverable from pending to in_progress
        if deliverable.status == "pending":
            deliverable.status = "in_progress"

        # Update deliverable work_type if provided and not set
        if work_type and not deliverable.work_type:
            deliverable.work_type = work_type

        await db.commit()

        # Create new session
        session = TimeSession(
            user_id=user_id,
            project_id=project.id,
            deliverable_id=deliverable.id,
            tracking_code=tracking_code,
            client_session_id=client_session_id,
            work_type=work_type,
            status="active",
            start_time=datetime.now(timezone.utc),
            accumulated_minutes=0,
            pause_duration_minutes=0,
        )

        db.add(session)
        await db.commit()
        await db.refresh(session)

        return await SessionManager._to_response(db, session)

    @staticmethod
    async def stop_session(
        db: AsyncSession,
        session_id: UUID,
        user_id: UUID,
        commit_message: Optional[str] = None,
        commit_sha: Optional[str] = None,
        deliverable_status_after: Optional[str] = None,
        developer_notes: Optional[str] = None,
        accumulated_seconds: Optional[int] = None,
    ) -> TimeSessionResponse:
        """Stop a time tracking session and create time entry."""

        # Get session
        result = await db.execute(
            select(TimeSession).where(and_(TimeSession.id == session_id, TimeSession.user_id == user_id))
        )
        session = result.scalar_one_or_none()

        if not session:
            raise ValueError("Session not found")

        if session.status not in ["active", "paused"]:
            raise ValueError(f"Cannot stop session with status: {session.status}")

        # Calculate total duration
        now = datetime.now(timezone.utc)

        # Use CLI accumulated seconds if provided (CLI tracks time accurately even when offline)
        if accumulated_seconds is not None and accumulated_seconds > 0:
            # Convert seconds to minutes for storage
            session.accumulated_minutes = int(accumulated_seconds / 60)
            logger.info(
                "Session %s: Using CLI accumulated time: %s seconds = %s minutes",
                session.id,
                accumulated_seconds,
                session.accumulated_minutes,
            )
        elif session.status == "active":
            # Fallback to server-side calculation if CLI doesn't provide accumulated time
            duration = now - session.start_time
            minutes_to_add = int(duration.total_seconds() / 60)
            logger.debug(
                "Session %s: Duration = %s seconds",
                session.id,
                duration.total_seconds(),
            )
            logger.debug(
                "Session %s: Adding %s minutes to accumulated %s",
                session.id,
                minutes_to_add,
                session.accumulated_minutes,
            )
            session.accumulated_minutes += minutes_to_add
            logger.debug(
                "Session %s: Total accumulated_minutes = %s",
                session.id,
                session.accumulated_minutes,
            )

        # Update session
        session.status = "completed"
        session.end_time = now
        session.commit_message = commit_message
        session.commit_sha = commit_sha
        session.deliverable_status_after = deliverable_status_after
        session.developer_notes = developer_notes

        # Create TimeEntry from session
        time_entry = TimeEntry(
            project_id=session.project_id,
            user_id=session.user_id,
            deliverable_id=session.deliverable_id,
            description=commit_message or f"CLI tracked: {session.tracking_code}",
            start_time=session.start_time,
            end_time=now,
            duration_minutes=session.accumulated_minutes,
            source="cli",
            git_commit_sha=commit_sha,
            git_commit_message=commit_message,
            auto_generated=False,
            is_billable=True,
            is_billed=False,
            developer_notes=developer_notes,
            notes_visible_to_client=True,
        )

        # Get project, client, and user settings in optimized queries
        try:
            # Get project
            project_result = await db.execute(select(Project).where(Project.id == session.project_id))
            project = project_result.scalar_one_or_none()

            if not project:
                raise ValueError(f"Project not found for session {session.id}")

            # Get client's hourly rate
            client_result = await db.execute(select(Client).where(Client.id == project.client_id))
            client = client_result.scalar_one_or_none()

            if not client:
                raise ValueError(f"Client not found for project {project.id}")

            # Get user's currency settings
            settings_result = await db.execute(select(UserSettings).where(UserSettings.user_id == session.user_id))
            user_settings = settings_result.scalar_one_or_none()

            time_entry.hourly_rate = client.default_hourly_rate
            # Calculate cost using Decimal
            hours_decimal = Decimal(str(session.accumulated_minutes)) / Decimal("60")
            time_entry.final_hours = float(hours_decimal)  # Set final_hours for CLI tracking
            time_entry.cost = hours_decimal * time_entry.hourly_rate
            time_entry.currency = user_settings.default_currency if user_settings else "USD"
        except Exception as e:
            # Log error but don't fail the entire operation
            logger.warning("Error fetching billing info: %s", e)
            # Use fallback values
            time_entry.hourly_rate = Decimal("100.00")
            hours_decimal = Decimal(str(session.accumulated_minutes)) / Decimal("60")
            time_entry.final_hours = float(hours_decimal)  # Set final_hours for CLI tracking
            time_entry.cost = hours_decimal * time_entry.hourly_rate
            time_entry.currency = "USD"

        db.add(time_entry)

        # Update deliverable metrics and status
        deliverable_result = await db.execute(select(Deliverable).where(Deliverable.id == session.deliverable_id))
        deliverable = deliverable_result.scalar_one()

        # Update actual hours and total cost
        # Recalculate from all TimeEntry records to ensure accuracy
        from sqlalchemy import func

        time_entries_result = await db.execute(
            select(func.sum(TimeEntry.final_hours)).where(TimeEntry.deliverable_id == deliverable.id)
        )
        total_hours = time_entries_result.scalar() or Decimal("0")

        # Get total cost from all time entries
        cost_result = await db.execute(select(func.sum(TimeEntry.cost)).where(TimeEntry.deliverable_id == deliverable.id))
        total_cost = cost_result.scalar() or Decimal("0")

        logger.debug(
            "Deliverable %s: Recalculated actual_hours = %s from TimeEntry records",
            deliverable.tracking_code,
            total_hours,
        )
        deliverable.actual_hours = total_hours
        deliverable.total_cost = total_cost

        # Recalculate project total_hours_tracked from all time entries for accuracy
        project_hours_result = await db.execute(
            select(func.sum(TimeEntry.final_hours)).where(TimeEntry.project_id == project.id)
        )
        project_total_hours = project_hours_result.scalar() or Decimal("0")
        project.total_hours_tracked = project_total_hours

        # Recalculate project budget remaining
        project_cost_result = await db.execute(select(func.sum(TimeEntry.cost)).where(TimeEntry.project_id == project.id))
        project_total_cost = project_cost_result.scalar() or Decimal("0")
        # Budget remaining = project budget - total cost of all time entries
        if project.budget_allocated:
            project.current_budget_remaining = project.budget_allocated - project_total_cost
        else:
            project.current_budget_remaining = Decimal("0")

        # Update status if specified
        if deliverable_status_after:
            deliverable.status = deliverable_status_after

        await db.commit()
        await db.refresh(session)

        # Publish NATS event to trigger review modal in frontend
        try:
            await publish_session_stopped(
                {
                    "session_id": str(session.id),
                    "user_id": str(session.user_id),
                    "deliverable_id": str(session.deliverable_id),
                    "project_id": str(session.project_id),
                    "duration_minutes": session.accumulated_minutes,
                    "tracking_code": session.tracking_code,
                }
            )
            logger.info("Published session.stopped event for session %s", session.id)
        except Exception as e:
            logger.warning("Failed to publish session.stopped event: %s", e)

        return await SessionManager._to_response(db, session)

    @staticmethod
    async def pause_session(db: AsyncSession, session_id: UUID, user_id: UUID) -> TimeSessionResponse:
        """Pause an active session."""

        result = await db.execute(
            select(TimeSession).where(
                and_(
                    TimeSession.id == session_id,
                    TimeSession.user_id == user_id,
                    TimeSession.status == "active",
                )
            )
        )
        session = result.scalar_one_or_none()

        if not session:
            raise ValueError("Active session not found")

        # Calculate accumulated time
        now = datetime.now(timezone.utc)
        duration = now - session.start_time
        session.accumulated_minutes += int(duration.total_seconds() / 60)
        session.status = "paused"

        await db.commit()
        await db.refresh(session)

        return await SessionManager._to_response(db, session)

    @staticmethod
    async def resume_session(db: AsyncSession, session_id: UUID, user_id: UUID) -> TimeSessionResponse:
        """Resume a paused session."""

        result = await db.execute(
            select(TimeSession).where(
                and_(
                    TimeSession.id == session_id,
                    TimeSession.user_id == user_id,
                    TimeSession.status == "paused",
                )
            )
        )
        session = result.scalar_one_or_none()

        if not session:
            raise ValueError("Paused session not found")

        session.status = "active"
        session.start_time = datetime.now(timezone.utc)  # Reset start time for new active period

        await db.commit()
        await db.refresh(session)

        return await SessionManager._to_response(db, session)

    @staticmethod
    async def heartbeat(
        db: AsyncSession,
        session_id: UUID,
        user_id: UUID,
        activity_type: Optional[str] = None,
    ) -> TimeSessionResponse:
        """Update session heartbeat."""

        result = await db.execute(
            select(TimeSession).where(and_(TimeSession.id == session_id, TimeSession.user_id == user_id))
        )
        session = result.scalar_one_or_none()

        if not session:
            raise ValueError("Session not found")

        session.last_heartbeat = datetime.now(timezone.utc)

        await db.commit()
        await db.refresh(session)

        return await SessionManager._to_response(db, session)

    @staticmethod
    async def get_active_sessions(db: AsyncSession, user_id: UUID) -> list[TimeSessionResponse]:
        """Get all active sessions for a user."""

        result = await db.execute(
            select(TimeSession)
            .where(
                and_(
                    TimeSession.user_id == user_id,
                    TimeSession.status.in_(["active", "paused"]),
                )
            )
            .order_by(TimeSession.start_time.desc())
        )
        sessions = result.scalars().all()

        return [await SessionManager._to_response(db, s) for s in sessions]

    @staticmethod
    async def _to_response(db: AsyncSession, session: TimeSession) -> TimeSessionResponse:
        """Convert session to response with project/deliverable info."""

        # Get project and deliverable
        project_result = await db.execute(select(Project).where(Project.id == session.project_id))
        project = project_result.scalar_one()

        deliverable_result = await db.execute(select(Deliverable).where(Deliverable.id == session.deliverable_id))
        deliverable = deliverable_result.scalar_one()

        return TimeSessionResponse(
            id=session.id,
            tracking_code=session.tracking_code,
            project_id=session.project_id,
            deliverable_id=session.deliverable_id,
            project_name=project.name,
            deliverable_title=deliverable.title,
            status=session.status,
            start_time=session.start_time,
            end_time=session.end_time,
            accumulated_minutes=session.accumulated_minutes,
            pause_duration_minutes=session.pause_duration_minutes,
            auto_paused=session.auto_paused or False,
            auto_stopped=session.auto_stopped or False,
            created_at=session.created_at,
        )

    @staticmethod
    async def _ensure_webhook_setup(db: AsyncSession, user_id: UUID, project_id: UUID, repo_url: str):
        """Ensure webhook is set up for the repository."""
        from app.api.git_integration import get_git_client
        from app.core.config import settings
        from app.core.security import decrypt_token
        from app.models.git_integration import GitIntegration
        from app.models.git_repository import GitRepository

        # Check if repo is already linked
        result = await db.execute(
            select(GitRepository).where(
                and_(
                    GitRepository.project_id == project_id,
                    GitRepository.repo_url == repo_url,
                )
            )
        )
        git_repo = result.scalar_one_or_none()

        if git_repo and git_repo.webhook_id:
            return  # Already set up

        # Determine provider from URL
        provider = "github"
        if "gitlab" in repo_url:
            provider = "gitlab"
        elif "bitbucket" in repo_url:
            provider = "bitbucket"

        # Get integration
        integration_result = await db.execute(
            select(GitIntegration).where(
                and_(
                    GitIntegration.user_id == user_id,
                    GitIntegration.platform == provider,
                    GitIntegration.is_active == True,
                )
            )
        )
        integration = integration_result.scalar_one_or_none()

        if not integration:
            return  # No integration, can't setup webhook

        try:
            access_token = decrypt_token(integration.access_token)
            client = get_git_client(provider, access_token)

            # Webhook URL
            webhook_url = f"{settings.backend_url}/api/git/webhooks/{provider}"

            # Create webhook
            result = await client.create_webhook(repo_url, webhook_url, ["push", "pull_request"])

            if result.get("success"):
                if git_repo:
                    git_repo.webhook_id = result.get("webhook_id")
                else:
                    # Link repo if not exists
                    repo_info = await client.validate_repository(repo_url)
                    if repo_info.get("valid"):
                        new_repo = GitRepository(
                            integration_id=integration.id,
                            project_id=project_id,
                            repo_url=repo_url,
                            repo_name=repo_info.get("repo_name"),
                            repo_full_name=repo_info.get("full_name"),
                            repository_purpose="source_code",
                            default_branch="main",
                            webhook_id=result.get("webhook_id"),
                        )
                        db.add(new_repo)

                await db.commit()
        except Exception as e:
            logger.warning("Failed to auto-setup webhook: %s", e)
