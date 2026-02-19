"""Budget monitoring service"""

from typing import Dict, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.deliverable import Deliverable
from app.models.time_tracking import TimeEntry
from app.services.nats_service import TimeTrackingNATSService


class BudgetMonitor:
    """Monitor deliverable budget in real-time"""

    async def check_budget_status(self, deliverable: Deliverable, db: AsyncSession) -> Dict:
        """
        Check current budget status and return alerts

        Returns:
            dict with status, alert_level, usage_percentage, variance, etc.
        """

        if not deliverable.estimated_hours or deliverable.estimated_hours == 0:
            return {
                "status": "no_budget",
                "alert_level": "none",
                "message": "No budget set for this deliverable",
            }

        # Calculate current metrics
        actual_hours = deliverable.actual_hours or 0
        estimated_hours = deliverable.estimated_hours

        usage_percentage = (actual_hours / estimated_hours) * 100
        variance = actual_hours - estimated_hours
        variance_percentage = (variance / estimated_hours) * 100
        hours_remaining = estimated_hours - actual_hours

        # Determine status and alert level
        if usage_percentage < 80:
            status = "on_track"
            alert_level = "none"
            message = "Budget is on track"
        elif usage_percentage < 100:
            status = "warning"
            alert_level = "medium"
            message = f"Approaching budget limit ({usage_percentage:.1f}% used)"
        else:
            status = "over_budget"
            alert_level = "high"
            message = f"Over budget by {abs(hours_remaining):.1f} hours"

        # Calculate projection
        commit_count = deliverable.commit_count or 0
        if commit_count > 0 and hours_remaining > 0:
            avg_hours_per_commit = actual_hours / commit_count
            estimated_remaining_commits = hours_remaining / avg_hours_per_commit if avg_hours_per_commit > 0 else None
        else:
            estimated_remaining_commits = None

        # Calculate estimated completion
        if commit_count > 1 and deliverable.first_commit_at and deliverable.last_commit_at:
            time_span = (deliverable.last_commit_at - deliverable.first_commit_at).total_seconds()
            if time_span > 0:
                hours_per_second = actual_hours / time_span
                if hours_remaining > 0:
                    estimated_seconds_remaining = hours_remaining / hours_per_second
                    # Convert to days
                    estimated_days_remaining = estimated_seconds_remaining / 86400
                else:
                    estimated_days_remaining = 0
            else:
                estimated_days_remaining = None
        else:
            estimated_days_remaining = None

        return {
            "status": status,
            "alert_level": alert_level,
            "message": message,
            "usage_percentage": round(usage_percentage, 2),
            "hours_remaining": round(hours_remaining, 2),
            "variance": round(variance, 2),
            "variance_percentage": round(variance_percentage, 2),
            "estimated_remaining_commits": (round(estimated_remaining_commits) if estimated_remaining_commits else None),
            "estimated_days_remaining": (round(estimated_days_remaining, 1) if estimated_days_remaining else None),
            "should_alert": usage_percentage >= (deliverable.budget_alert_threshold or 80),
            "metrics": {
                "estimated_hours": estimated_hours,
                "actual_hours": actual_hours,
                "commit_count": commit_count,
                "avg_hours_per_commit": (round(actual_hours / commit_count, 2) if commit_count > 0 else 0),
            },
        }

    async def send_budget_alert(self, deliverable: Deliverable, db: AsyncSession):
        """
        Send alert when budget threshold reached

        This should:
        1. Check if alert already sent
        2. Get budget status
        3. Send email notification
        4. Publish NATS event
        5. Mark alert as sent
        """

        # Check if alert already sent
        if deliverable.budget_alert_sent:
            return

        # Get budget status
        status = await self.check_budget_status(deliverable, db)

        if not status["should_alert"]:
            return

        # TODO: Send email notification
        # from app.utils.email import send_budget_alert_email
        # await send_budget_alert_email(user_email, deliverable_data)

        # Publish NATS event for budget alert
        await TimeTrackingNATSService.publish_budget_alert(
            {
                "deliverable_id": deliverable.id,
                "project_id": deliverable.project_id,
                "deliverable_name": deliverable.title,
                "estimated_hours": deliverable.estimated_hours,
                "actual_hours": deliverable.actual_hours,
                "usage_percentage": status["usage_percentage"],
                "variance": status["variance"],
                "alert_level": status["alert_level"],
                "message": status["message"],
            }
        )

        # Mark alert as sent
        deliverable.budget_alert_sent = True
        await db.commit()

    async def get_project_budget_summary(self, project_id: UUID, db: AsyncSession) -> Dict:
        """
        Get budget summary for entire project

        Returns:
            dict with total estimated, actual, variance, and per-deliverable breakdown
        """

        # Get all deliverables for project
        result = await db.execute(select(Deliverable).where(Deliverable.project_id == project_id))
        deliverables = result.scalars().all()

        if not deliverables:
            return {
                "total_estimated": 0,
                "total_actual": 0,
                "total_variance": 0,
                "deliverables": [],
            }

        total_estimated = sum(d.estimated_hours or 0 for d in deliverables)
        total_actual = sum(d.actual_hours or 0 for d in deliverables)
        total_variance = total_actual - total_estimated

        deliverable_summaries = []
        for deliverable in deliverables:
            status = await self.check_budget_status(deliverable, db)
            deliverable_summaries.append(
                {
                    "id": deliverable.id,
                    "title": deliverable.title,
                    "estimated": deliverable.estimated_hours,
                    "actual": deliverable.actual_hours,
                    "variance": status["variance"],
                    "status": status["status"],
                    "usage_percentage": status["usage_percentage"],
                }
            )

        # Calculate accuracy
        on_budget_count = sum(1 for d in deliverable_summaries if d["status"] == "on_track")
        accuracy_percentage = (on_budget_count / len(deliverables)) * 100 if deliverables else 0

        return {
            "total_estimated": total_estimated,
            "total_actual": total_actual,
            "total_variance": total_variance,
            "variance_percentage": ((total_variance / total_estimated * 100) if total_estimated > 0 else 0),
            "deliverable_count": len(deliverables),
            "on_budget_count": on_budget_count,
            "over_budget_count": sum(1 for d in deliverable_summaries if d["status"] == "over_budget"),
            "accuracy_percentage": accuracy_percentage,
            "deliverables": deliverable_summaries,
        }

    async def check_and_alert_all_deliverables(self, project_id: UUID, db: AsyncSession):
        """
        Check all deliverables in a project and send alerts if needed
        """

        # Get all deliverables for project
        result = await db.execute(select(Deliverable).where(Deliverable.project_id == project_id))
        deliverables = result.scalars().all()

        for deliverable in deliverables:
            await self.send_budget_alert(deliverable, db)
