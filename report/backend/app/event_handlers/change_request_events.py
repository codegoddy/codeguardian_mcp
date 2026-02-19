"""
Change Request Event Handlers

Handles change request workflow events:
- Change request created
- Change request approved
- Change request rejected

NATS Subjects:
    change_request.created   - New change request created
    change_request.approved - Change request approved
    change_request.rejected - Change request rejected
"""

import json

from app.core.logging_config import get_logger
from app.utils.email import send_change_request_approved_email, send_change_request_email, send_change_request_rejected_email
from app.utils.nats_client import subscribe_to_subject

logger = get_logger(__name__)


async def handle_change_request_created_event(message: str):
    """Handle change request created event - send notification to client"""
    try:
        message_data = json.loads(message)
        to_email = message_data.get("client_email")
        client_name = message_data.get("client_name", "Client")
        project_name = message_data.get("project_name")
        title = message_data.get("title")
        description = message_data.get("description", "")
        estimated_hours = message_data.get("estimated_hours", "0")
        hourly_rate = message_data.get("hourly_rate", "0")
        total_cost = message_data.get("total_cost")
        currency = message_data.get("currency", "USD")
        portal_url = message_data.get("portal_url", "")

        if not all([to_email, project_name, title]):
            return

        await send_change_request_email(
            to_email=to_email,
            client_name=client_name,
            project_name=project_name,
            title=title,
            description=description,
            estimated_hours=estimated_hours,
            hourly_rate=hourly_rate,
            total_cost=total_cost,
            currency=currency,
            portal_url=portal_url,
        )

    except Exception as e:
        logger.error("Error handling change_request.created event", exc_info=True)


async def handle_change_request_approved_event(message: str):
    """Handle change request approved event - send notification to developer"""
    try:
        message_data = json.loads(message)
        to_email = message_data.get("developer_email")
        developer_name = message_data.get("developer_name", "Developer")
        project_name = message_data.get("project_name")
        title = message_data.get("title")
        total_cost = message_data.get("total_cost")
        currency = message_data.get("currency", "USD")
        project_url = message_data.get("project_url", "")

        if not all([to_email, project_name, title]):
            return

        await send_change_request_approved_email(
            to_email=to_email,
            developer_name=developer_name,
            project_name=project_name,
            title=title,
            total_cost=total_cost,
            currency=currency,
            project_url=project_url,
        )

    except Exception as e:
        logger.error("Error handling change_request.approved event", exc_info=True)


async def handle_change_request_rejected_event(message: str):
    """Handle change request rejected event - send notification to developer"""
    try:
        message_data = json.loads(message)
        to_email = message_data.get("developer_email")
        developer_name = message_data.get("developer_name", "Developer")
        project_name = message_data.get("project_name")
        title = message_data.get("title")
        project_url = message_data.get("project_url", "")

        if not all([to_email, project_name, title]):
            return

        await send_change_request_rejected_email(
            to_email=to_email,
            developer_name=developer_name,
            project_name=project_name,
            title=title,
            project_url=project_url,
        )

    except Exception as e:
        logger.error("Error handling change_request.rejected event", exc_info=True)


async def register_change_request_handlers():
    """
    Register all change request event handlers with NATS.

    Subscribes to change request related subjects with normal concurrency.
    """
    EVENT_CONCURRENCY = 10

    await subscribe_to_subject(
        "change_request.created",
        handle_change_request_created_event,
        max_concurrent=EVENT_CONCURRENCY,
    )
    await subscribe_to_subject(
        "change_request.approved",
        handle_change_request_approved_event,
        max_concurrent=EVENT_CONCURRENCY,
    )
    await subscribe_to_subject(
        "change_request.rejected",
        handle_change_request_rejected_event,
        max_concurrent=EVENT_CONCURRENCY,
    )


__all__ = [
    "handle_change_request_created_event",
    "handle_change_request_approved_event",
    "handle_change_request_rejected_event",
    "register_change_request_handlers",
]
