"""
Waitlist Event Handlers

Handles waitlist-related events:
- Send confirmation email when user joins waitlist

NATS Subjects:
    email.waitlist_confirmation - Send waitlist confirmation email
"""

import asyncio
import json
from datetime import datetime

from app.core.logging_config import get_logger
from app.utils.email import send_waitlist_confirmation_email
from app.utils.nats_client import subscribe_to_subject

logger = get_logger(__name__)


async def handle_waitlist_confirmation(message: str):
    """Handle email.waitlist_confirmation event - send waitlist confirmation email"""
    receive_time = datetime.now().timestamp()
    logger.debug(
        "[%s] NATS worker received email.waitlist_confirmation message: %s",
        receive_time,
        message,
    )
    try:
        message_data = json.loads(message)
        email = message_data.get("email")
        full_name = message_data.get("full_name")

        if not email or not full_name:
            logger.error("Missing required fields in email.waitlist_confirmation message")
            return

        logger.debug(
            "[%s] Sending waitlist confirmation email to %s",
            datetime.now().timestamp(),
            email,
        )
        result = await send_waitlist_confirmation_email(email, full_name)
        if result:
            logger.debug(
                "[%s] Waitlist confirmation email sent successfully to %s",
                datetime.now().timestamp(),
                email,
            )
        else:
            logger.error(
                "[%s] Waitlist confirmation email failed to send to %s",
                datetime.now().timestamp(),
                email,
            )

    except json.JSONDecodeError as e:
        logger.error("Failed to parse email.waitlist_confirmation message: %s", e, exc_info=True)
    except Exception as e:
        logger.error("Error sending waitlist confirmation email: %s", e, exc_info=True)


async def register_waitlist_handlers():
    """
    Register all waitlist event handlers with NATS.

    Subscribes to waitlist-related subjects with high concurrency
    for fast email delivery.
    """
    EMAIL_CONCURRENCY = 20

    await subscribe_to_subject(
        "email.waitlist_confirmation",
        handle_waitlist_confirmation,
        max_concurrent=EMAIL_CONCURRENCY,
    )


__all__ = [
    "handle_waitlist_confirmation",
    "register_waitlist_handlers",
]
