"""Background worker to monitor CLI time tracking sessions."""

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_async_session
from app.models.deliverable import Deliverable
from app.models.time_session import TimeSession

logger = logging.getLogger(__name__)


class SessionMonitor:
    """Monitors active sessions and handles auto-pause/stop for abandoned sessions."""

    def __init__(self):
        self.check_interval = 60  # Check every 1 minute
        self.running = False

        # Thresholds (in minutes)
        self.inactivity_pause_threshold = 30  # Auto-pause after 30 min no heartbeat
        self.inactivity_stop_threshold = 480  # Auto-stop after 8 hours no heartbeat
        self.max_duration_threshold = 720  # Hard limit: 12 hours

    async def start(self):
        """Start the monitoring loop."""
        self.running = True
        logger.info("Session monitor started")

        while self.running:
            try:
                await self.check_sessions()
            except Exception as e:
                logger.error(f"Error in session monitor: {e}", exc_info=True)

            # Wait before next check
            await asyncio.sleep(self.check_interval)

    def stop(self):
        """Stop the monitoring loop."""
        self.running = False
        logger.info("Session monitor stopped")

    async def check_sessions(self):
        """Check all active sessions for abandonment."""
        session_maker = get_async_session()
        async with session_maker() as db:
            # Get all active sessions
            result = await db.execute(select(TimeSession).where(TimeSession.status.in_(["active", "paused"])))
            sessions = result.scalars().all()

            now = datetime.now(timezone.utc)

            for session in sessions:
                try:
                    await self._check_session(db, session, now)
                except Exception as e:
                    logger.error(f"Error checking session {session.id}: {e}")

            # Commit all changes
            await db.commit()

    async def _check_session(self, db: AsyncSession, session: TimeSession, now: datetime):
        """Check a single session for abandonment."""

        # Calculate duration and inactivity
        total_duration = now - session.start_time
        total_minutes = int(total_duration.total_seconds() / 60)

        # Use last_heartbeat if available, otherwise use start_time
        last_activity = session.last_heartbeat or session.start_time
        inactivity_duration = now - last_activity
        inactivity_minutes = int(inactivity_duration.total_seconds() / 60)

        # Skip if already auto-paused or auto-stopped
        if session.auto_paused or session.auto_stopped:
            return

        # Only check active sessions for auto-actions
        if session.status != "active":
            return

        # 1. Check maximum duration (12 hours) - hard limit
        if total_minutes > self.max_duration_threshold:
            logger.warning(f"Session {session.tracking_code} exceeded max duration " f"({total_minutes} min) - auto-stopping")
            await self._auto_stop_session(
                db,
                session,
                now,
                reason="max_duration_exceeded",
                final_minutes=session.accumulated_minutes + 15,  # 15 min grace
            )
            return

        # 2. Check extreme inactivity (8+ hours) - auto-stop
        if inactivity_minutes > self.inactivity_stop_threshold:
            logger.warning(f"Session {session.tracking_code} inactive for {inactivity_minutes} min " f"- auto-stopping")
            # Stop at last activity + 15 min grace period
            await self._auto_stop_session(
                db,
                session,
                now,
                reason="extreme_inactivity",
                final_minutes=session.accumulated_minutes + 15,
            )
            return

        # 3. Check medium inactivity (30+ min) - auto-pause
        if inactivity_minutes > self.inactivity_pause_threshold:
            logger.info(f"Session {session.tracking_code} inactive for {inactivity_minutes} min " f"- auto-pausing")
            # Pause at last activity + 5 min grace period
            await self._auto_pause_session(db, session, now, final_minutes=session.accumulated_minutes + 5)
            return

        # 4. Warn about long running sessions (8+ hours)
        if total_minutes > 480 and total_minutes < 540:  # 8-9 hours
            logger.warning(f"Session {session.tracking_code} running for {total_minutes/60:.1f} hours")

    async def _auto_pause_session(self, db: AsyncSession, session: TimeSession, now: datetime, final_minutes: int):
        """Automatically pause a session due to inactivity."""

        session.status = "paused"
        session.paused_at = now
        session.accumulated_minutes = final_minutes
        session.auto_paused = True
        session.updated_at = now

        logger.info(f"Auto-paused session {session.tracking_code} " f"(duration: {final_minutes} min)")

        # TODO: Send notification to user about auto-pause
        # Could publish NATS event: session.auto_paused

    async def _auto_stop_session(
        self,
        db: AsyncSession,
        session: TimeSession,
        now: datetime,
        reason: str,
        final_minutes: int,
    ):
        """Automatically stop a session due to inactivity or max duration."""

        from app.models.client import Client
        from app.models.project import Project
        from app.models.time_tracking import TimeEntry
        from app.models.user import UserSettings

        session.status = "completed"
        session.end_time = now
        session.accumulated_minutes = final_minutes
        session.auto_stopped = True
        session.stop_reason = reason
        session.updated_at = now

        # Create TimeEntry from session
        time_entry = TimeEntry(
            project_id=session.project_id,
            user_id=session.user_id,
            deliverable_id=session.deliverable_id,
            description=f"CLI tracked (auto-stopped: {reason}): {session.tracking_code}",
            start_time=session.start_time,
            end_time=now,
            duration_minutes=final_minutes,
            source="cli",
            git_commit_sha=session.commit_sha,
            git_commit_message=session.commit_message,
            auto_generated=True,  # Mark as auto-generated since it's auto-stopped
            is_billable=True,
            is_billed=False,
        )

        # Get project and client for hourly rate
        project_result = await db.execute(select(Project).where(Project.id == session.project_id))
        project = project_result.scalar_one()

        # Get client's hourly rate
        client_result = await db.execute(select(Client).where(Client.id == project.client_id))
        client = client_result.scalar_one()

        # Get user's currency settings
        settings_result = await db.execute(select(UserSettings).where(UserSettings.user_id == session.user_id))
        user_settings = settings_result.scalar_one_or_none()

        time_entry.hourly_rate = client.default_hourly_rate
        time_entry.cost = (final_minutes / 60.0) * time_entry.hourly_rate
        time_entry.currency = user_settings.default_currency if user_settings else "USD"

        db.add(time_entry)

        # Update deliverable metrics
        from app.models.deliverable import Deliverable

        deliverable_result = await db.execute(select(Deliverable).where(Deliverable.id == session.deliverable_id))
        deliverable = deliverable_result.scalar_one_or_none()

        if deliverable:
            hours_tracked = final_minutes / 60.0
            deliverable.actual_hours = (deliverable.actual_hours or 0) + hours_tracked
            deliverable.total_cost = (deliverable.total_cost or 0) + time_entry.cost

        logger.info(
            f"Auto-stopped session {session.tracking_code} "
            f"(reason: {reason}, duration: {final_minutes} min, cost: ${time_entry.cost:.2f})"
        )

        # TODO: Send notification to user about auto-stop
        # Could publish NATS event: session.auto_stopped


# Global monitor instance
_monitor_instance: Optional[SessionMonitor] = None


async def start_session_monitor():
    """Start the session monitoring worker."""
    global _monitor_instance

    if _monitor_instance is not None:
        logger.warning("Session monitor already running")
        return

    _monitor_instance = SessionMonitor()

    # Run in background task
    asyncio.create_task(_monitor_instance.start())
    logger.info("Session monitor background task created")


def stop_session_monitor():
    """Stop the session monitoring worker."""
    global _monitor_instance

    if _monitor_instance is not None:
        _monitor_instance.stop()
        _monitor_instance = None
        logger.info("Session monitor stopped")
