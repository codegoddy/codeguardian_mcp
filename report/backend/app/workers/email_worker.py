"""
Email Worker - Subscribes to NATS events and sends emails

This module is a standalone email worker that can be run independently.
It uses the consolidated event_handlers package for all event handling.

To run standalone:
    python -m app.workers.email_worker

To run from main.py:
    The start_email_worker function in main.py now delegates to event_handlers.register_all_event_handlers()
"""

import asyncio

from app.core.logging_config import get_logger
from app.event_handlers import register_all_event_handlers

logger = get_logger(__name__)


async def start_email_worker():
    """
    Start email worker and subscribe to all relevant NATS events.

    This function delegates to the consolidated event_handlers package,
    which contains all NATS event handlers organized by domain.
    """
    logger.info("Starting email worker...")
    await register_all_event_handlers()
    logger.info("Email worker started and subscribed to all events")

    # Keep worker running
    try:
        while True:
            await asyncio.sleep(1)
    except KeyboardInterrupt:
        logger.info("Email worker shutting down...")


if __name__ == "__main__":
    # This allows running the email worker as a standalone process
    asyncio.run(start_email_worker())
