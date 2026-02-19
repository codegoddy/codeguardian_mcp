"""
Event Handlers Package

This package contains all NATS event handlers organized by domain.
Each module focuses on a specific business domain:

- auth_events.py - User authentication events (registration, OTP, password reset)
- contract_events.py - Contract lifecycle events (signing, portal access)
- payment_events.py - Payment processing events (payment received)
- project_events.py - Project management events (budget alerts, auto-pause)
- git_events.py - Git integration events (commits, PRs)
- deliverable_events.py - Deliverable lifecycle events (status changes)
- change_request_events.py - Change request workflow events (created, approved, rejected)

Usage:
    from app.event_handlers import register_all_event_handlers
    await register_all_event_handlers()

Or import specific handlers:
    from app.event_handlers.auth_events import handle_user_registered
"""

import asyncio

from app.core.logging_config import get_logger
from app.event_handlers.auth_events import register_auth_handlers
from app.event_handlers.change_request_events import register_change_request_handlers
from app.event_handlers.contract_events import register_contract_handlers
from app.event_handlers.deliverable_events import register_deliverable_handlers
from app.event_handlers.git_events import register_git_handlers
from app.event_handlers.payment_events import register_payment_handlers
from app.event_handlers.project_events import register_project_handlers
from app.event_handlers.waitlist_events import register_waitlist_handlers

logger = get_logger(__name__)


async def register_all_event_handlers():
    """
    Register all event handlers with NATS.

    This function subscribes all domain-specific handlers to their
    respective NATS subjects with appropriate concurrency settings.

    Configuration:
        EMAIL_CONCURRENCY = 20  - For time-sensitive email subjects
        EVENT_CONCURRENCY = 10  - For less time-sensitive event subjects
    """
    logger.info("Registering all event handlers...")

    await register_auth_handlers()
    await register_contract_handlers()
    await register_payment_handlers()
    await register_project_handlers()
    await register_git_handlers()
    await register_deliverable_handlers()
    await register_change_request_handlers()
    await register_waitlist_handlers()

    await asyncio.sleep(0.2)
    logger.info("All event handlers registered and subscribed")


__all__ = [
    "register_all_event_handlers",
    "register_auth_handlers",
    "register_contract_handlers",
    "register_payment_handlers",
    "register_project_handlers",
    "register_git_handlers",
    "register_deliverable_handlers",
    "register_change_request_handlers",
    "register_waitlist_handlers",
]
