"""
Deliverable Event Handlers

Handles deliverable lifecycle events:
- Deliverable status changed to completed

NATS Subjects:
    deliverable.status_changed - Deliverable status updated
"""

import json

from app.core.logging_config import get_logger
from app.utils.nats_client import subscribe_to_subject

logger = get_logger(__name__)


async def handle_deliverable_status_changed_event(message: str):
    """Handle deliverable status changed event - send client notification when completed"""
    try:
        from app.db.database import async_session
        from app.models.client import Client
        from app.models.project import Project
        from app.utils.email import send_email
        from app.utils.email_templates import render_deliverable_completed_email

        async with async_session() as db:
            event_data = json.loads(message)
            task_reference = event_data.get("task_reference")
            status = event_data.get("status")
            pr_url = event_data.get("pr_url", "")

            if status != "completed":
                return

            logger.info(
                "Deliverable %s completed - email notification would be sent here",
                task_reference,
            )

    except Exception as e:
        logger.error("Error handling deliverable status changed event", exc_info=True)


async def register_deliverable_handlers():
    """
    Register all deliverable event handlers with NATS.

    Subscribes to deliverable-related subjects with normal concurrency.
    """
    EVENT_CONCURRENCY = 10

    await subscribe_to_subject(
        "deliverable.status_changed",
        handle_deliverable_status_changed_event,
        max_concurrent=EVENT_CONCURRENCY,
    )


__all__ = [
    "handle_deliverable_status_changed_event",
    "register_deliverable_handlers",
]
