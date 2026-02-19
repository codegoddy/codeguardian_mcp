"""NATS Service for Time Tracking System

This service handles publishing time tracking events to NATS for real-time notifications.
"""

from datetime import datetime
from typing import Any, Dict, Optional

from app.core.config import settings
from app.utils.nats_client import publish_event


class TimeTrackingNATSService:
    """Service for publishing time tracking events to NATS"""

    # NATS subjects for time tracking events (loaded from config)
    COMMIT_REVIEW_SUBJECT = settings.nats_config["subjects"]["commits"]
    BUDGET_ALERT_SUBJECT = settings.nats_config["subjects"]["budget"]
    TIME_ENTRY_SUBJECT = settings.nats_config["subjects"]["time_entry"]
    REVIEW_REMINDER_SUBJECT = settings.nats_config["subjects"]["review_reminder"]

    @staticmethod
    async def publish_commit_review(review_data: Dict[str, Any]) -> None:
        """
        Publish commit review notification to NATS

        Args:
            review_data: Dictionary containing commit review information
                - review_id: ID of the commit review
                - commit_hash: Git commit hash
                - commit_message: Commit message
                - commit_author: Author email/username
                - commit_timestamp: When commit was made
                - deliverable_id: Associated deliverable ID
                - parsed_hours: Parsed time from commit
                - project_id: Associated project ID
                - user_id: User who needs to review
        """
        event_data = {
            "event_type": "commit_review_pending",
            "timestamp": datetime.utcnow().isoformat(),
            "data": review_data,
        }

        await publish_event(
            subject=TimeTrackingNATSService.COMMIT_REVIEW_SUBJECT,
            data=event_data,
            background=True,
        )

    @staticmethod
    async def publish_budget_alert(alert_data: Dict[str, Any]) -> None:
        """
        Publish budget alert notification to NATS

        Args:
            alert_data: Dictionary containing budget alert information
                - deliverable_id: ID of the deliverable
                - project_id: Associated project ID
                - deliverable_name: Name of the deliverable
                - estimated_hours: Estimated hours for deliverable
                - actual_hours: Actual hours spent
                - usage_percentage: Percentage of budget used
                - variance: Difference between estimated and actual
                - alert_level: 'warning' (80%), 'critical' (100%), 'exceeded' (>100%)
                - user_id: User to notify
        """
        event_data = {
            "event_type": "budget_alert",
            "timestamp": datetime.utcnow().isoformat(),
            "data": alert_data,
        }

        await publish_event(
            subject=TimeTrackingNATSService.BUDGET_ALERT_SUBJECT,
            data=event_data,
            background=True,
        )

    @staticmethod
    async def publish_time_entry_created(entry_data: Dict[str, Any]) -> None:
        """
        Publish time entry creation notification to NATS

        Args:
            entry_data: Dictionary containing time entry information
                - entry_id: ID of the time entry
                - deliverable_id: Associated deliverable ID
                - project_id: Associated project ID
                - hours: Hours logged
                - entry_type: 'commit' or 'manual'
                - commit_hash: Git commit hash (if applicable)
                - notes: Entry notes
                - user_id: User who created the entry
        """
        event_data = {
            "event_type": "time_entry_created",
            "timestamp": datetime.utcnow().isoformat(),
            "data": entry_data,
        }

        await publish_event(
            subject=TimeTrackingNATSService.TIME_ENTRY_SUBJECT,
            data=event_data,
            background=True,
        )

    @staticmethod
    async def publish_review_reminder(reminder_data: Dict[str, Any]) -> None:
        """
        Publish review reminder notification to NATS

        Args:
            reminder_data: Dictionary containing reminder information
                - user_id: User to remind
                - pending_count: Number of pending reviews
                - oldest_review_age: Age of oldest pending review in hours
                - project_ids: List of project IDs with pending reviews
        """
        event_data = {
            "event_type": "review_reminder",
            "timestamp": datetime.utcnow().isoformat(),
            "data": reminder_data,
        }

        await publish_event(
            subject=TimeTrackingNATSService.REVIEW_REMINDER_SUBJECT,
            data=event_data,
            background=True,
        )

    @staticmethod
    async def publish_bulk_reviews_submitted(bulk_data: Dict[str, Any]) -> None:
        """
        Publish notification when bulk reviews are submitted

        Args:
            bulk_data: Dictionary containing bulk submission information
                - user_id: User who submitted reviews
                - review_count: Number of reviews submitted
                - total_hours: Total hours from all reviews
                - deliverable_ids: List of affected deliverable IDs
                - project_id: Associated project ID
        """
        event_data = {
            "event_type": "bulk_reviews_submitted",
            "timestamp": datetime.utcnow().isoformat(),
            "data": bulk_data,
        }

        await publish_event(
            subject=TimeTrackingNATSService.COMMIT_REVIEW_SUBJECT,
            data=event_data,
            background=True,
        )


# Convenience functions for backward compatibility
async def publish_commit_review(review_data: Dict[str, Any]) -> None:
    """Publish commit review notification"""
    await TimeTrackingNATSService.publish_commit_review(review_data)


async def publish_budget_alert(alert_data: Dict[str, Any]) -> None:
    """Publish budget alert notification"""
    await TimeTrackingNATSService.publish_budget_alert(alert_data)


async def publish_time_entry_created(entry_data: Dict[str, Any]) -> None:
    """Publish time entry creation notification"""
    await TimeTrackingNATSService.publish_time_entry_created(entry_data)


async def publish_review_reminder(reminder_data: Dict[str, Any]) -> None:
    """Publish review reminder notification"""
    await TimeTrackingNATSService.publish_review_reminder(reminder_data)
