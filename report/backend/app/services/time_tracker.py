"""Time tracking service"""

from datetime import datetime, timedelta
from typing import Dict, List, Optional
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.deliverable import Deliverable
from app.models.time_tracking import TimeEntry


class GitTimeTracker:
    """Calculate and track time from Git commits"""

    MAX_SESSION_GAP = timedelta(hours=2)  # Max time between commits in same session
    MIN_COMMIT_TIME = 0.25  # 15 minutes minimum per commit
    SESSION_BUFFER = 0.5  # 30 minutes buffer per session

    async def calculate_time_from_commits(self, commits: List[Dict], db: AsyncSession) -> float:
        """
        Calculate hours from commit timestamps using session-based algorithm

        Algorithm:
        1. Sort commits by timestamp
        2. Group commits into work sessions (gap < 2 hours)
        3. Calculate session duration
        4. Add minimum time for single commits
        """

        if not commits:
            return 0.0

        # Sort commits by timestamp
        sorted_commits = sorted(
            commits,
            key=lambda c: datetime.fromisoformat(c["timestamp"].replace("Z", "+00:00")),
        )

        total_hours = 0.0
        sessions = []
        current_session = []

        for commit in sorted_commits:
            commit_time = datetime.fromisoformat(commit["timestamp"].replace("Z", "+00:00"))

            if not current_session:
                # First commit - start new session
                current_session.append(commit_time)
            else:
                last_commit_time = current_session[-1]
                time_gap = commit_time - last_commit_time

                if time_gap <= self.MAX_SESSION_GAP:
                    # Same session - add commit
                    current_session.append(commit_time)
                else:
                    # New session - save current and start new
                    sessions.append(current_session)
                    current_session = [commit_time]

        # Add last session
        if current_session:
            sessions.append(current_session)

        # Calculate time per session
        for session in sessions:
            if len(session) == 1:
                # Single commit - minimum time
                total_hours += self.MIN_COMMIT_TIME
            else:
                # Multiple commits - calculate duration
                session_start = session[0]
                session_end = session[-1]
                duration = (session_end - session_start).total_seconds() / 3600

                # Add duration + buffer + minimum for last commit
                total_hours += duration + self.SESSION_BUFFER + self.MIN_COMMIT_TIME

        return round(total_hours, 2)

    async def track_commit(
        self,
        commit_data: Dict,
        deliverable_id: UUID,
        parsed_hours: Optional[float],
        db: AsyncSession,
    ) -> TimeEntry:
        """
        Create time entry for commit

        Args:
            commit_data: Commit information from Git
            deliverable_id: ID of the deliverable
            parsed_hours: Manually specified hours from commit message
            db: Database session
        """

        # Get deliverable to get project_id
        result = await db.execute(select(Deliverable).where(Deliverable.id == deliverable_id))
        deliverable = result.scalar_one_or_none()

        if not deliverable:
            raise ValueError(f"Deliverable {deliverable_id} not found")

        # Calculate time from commit
        calculated_hours = await self.calculate_time_from_commits([commit_data], db)

        # Use manual hours if provided, otherwise use calculated
        final_hours = parsed_hours if parsed_hours else calculated_hours

        # Create time entry
        time_entry = TimeEntry(
            deliverable_id=deliverable_id,
            project_id=deliverable.project_id,
            commit_hash=commit_data.get("id"),
            commit_message=commit_data.get("message"),
            commit_timestamp=datetime.fromisoformat(commit_data.get("timestamp", "").replace("Z", "+00:00")),
            calculated_hours=calculated_hours,
            manual_hours=parsed_hours,
            final_hours=final_hours,
            developer_email=commit_data.get("author", {}).get("email"),
            auto_tracked=True,
            verified=False,
        )

        db.add(time_entry)

        # Update deliverable time tracking
        await self.update_deliverable_time(deliverable_id, db)

        return time_entry

    async def update_deliverable_time(self, deliverable_id: UUID, db: AsyncSession):
        """
        Update deliverable time tracking fields

        Calculates:
        - actual_hours (sum of all time entries)
        - calculated_hours (sum of auto-calculated hours)
        - hours_remaining
        - hours_used_percentage
        - variance metrics
        - budget alerts
        """

        # Get deliverable
        result = await db.execute(select(Deliverable).where(Deliverable.id == deliverable_id))
        deliverable = result.scalar_one_or_none()

        if not deliverable:
            return

        # Get all time entries for this deliverable (CLI and git commits)
        time_entries_result = await db.execute(
            select(TimeEntry).where(
                TimeEntry.deliverable_id == deliverable_id,
                TimeEntry.final_hours.isnot(None),  # Only entries with hours calculated
            )
        )
        time_entries = time_entries_result.scalars().all()

        # Calculate totals
        total_actual_hours = sum(entry.final_hours or 0 for entry in time_entries)
        total_calculated_hours = sum(entry.calculated_hours or 0 for entry in time_entries)
        commit_count = len(time_entries)

        # Update deliverable
        deliverable.actual_hours = total_actual_hours
        deliverable.calculated_hours = total_calculated_hours
        deliverable.commit_count = commit_count

        # Update timestamps
        if time_entries:
            deliverable.first_commit_at = min(entry.commit_timestamp for entry in time_entries if entry.commit_timestamp)
            deliverable.last_commit_at = max(entry.commit_timestamp for entry in time_entries if entry.commit_timestamp)

        # Calculate budget metrics
        if deliverable.estimated_hours and deliverable.estimated_hours > 0:
            deliverable.hours_remaining = deliverable.estimated_hours - total_actual_hours
            deliverable.hours_used_percentage = total_actual_hours / deliverable.estimated_hours * 100

            # Calculate variance
            deliverable.variance_hours = total_actual_hours - deliverable.estimated_hours
            deliverable.variance_percentage = deliverable.variance_hours / deliverable.estimated_hours * 100

            # Determine variance status
            if deliverable.variance_hours > 0:
                deliverable.variance_status = "over"
                deliverable.is_over_budget = True
                deliverable.hours_over_budget = deliverable.variance_hours
            elif deliverable.hours_used_percentage >= 80:
                deliverable.variance_status = "warning"
            else:
                deliverable.variance_status = "under"

            # Check if budget alert should be sent
            if deliverable.hours_used_percentage >= deliverable.budget_alert_threshold and not deliverable.budget_alert_sent:
                deliverable.budget_alert_sent = True
                # TODO: Trigger budget alert notification

        await db.commit()

    async def add_manual_time_entry(
        self,
        deliverable_id: UUID,
        hours: float,
        notes: str,
        developer_email: str,
        db: AsyncSession,
    ) -> TimeEntry:
        """
        Add manual time entry for non-coding work

        Args:
            deliverable_id: ID of the deliverable
            hours: Hours to add
            notes: Description of work done
            developer_email: Email of developer
            db: Database session
        """

        # Get deliverable to get project_id
        result = await db.execute(select(Deliverable).where(Deliverable.id == deliverable_id))
        deliverable = result.scalar_one_or_none()

        if not deliverable:
            raise ValueError(f"Deliverable {deliverable_id} not found")

        # Create manual time entry
        time_entry = TimeEntry(
            deliverable_id=deliverable_id,
            project_id=deliverable.project_id,
            manual_hours=hours,
            final_hours=hours,
            developer_email=developer_email,
            notes=notes,
            auto_tracked=False,
            verified=True,  # Manual entries are pre-verified
        )

        db.add(time_entry)

        # Update deliverable time tracking
        await self.update_deliverable_time(deliverable_id, db)

        await db.commit()

        return time_entry
