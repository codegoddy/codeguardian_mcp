"""
Git Event Handlers

Handles Git integration events:
- Commit detected
- Pull request created
- Pull request merged

NATS Subjects:
    git.commit_detected - New commit detected
    git.pr_created      - Pull request created
    git.pr_merged       - Pull request merged
"""

import json

from app.core.logging_config import get_logger
from app.utils.nats_client import subscribe_to_subject

logger = get_logger(__name__)


async def handle_git_commit_event(message: str):
    """Handle Git commit detected event"""
    try:
        from app.db.database import async_session
        from app.services.automation import handle_commit_event

        async with async_session() as db:
            event_data = json.loads(message)
            await handle_commit_event(event_data, db)
    except Exception as e:
        logger.error("Error handling commit event", exc_info=True)


async def handle_git_pr_created_event(message: str):
    """Handle Git PR created event"""
    try:
        from app.db.database import async_session
        from app.services.automation import handle_pr_created_event

        async with async_session() as db:
            event_data = json.loads(message)
            await handle_pr_created_event(event_data, db)
    except Exception as e:
        logger.error("Error handling PR created event", exc_info=True)


async def handle_git_pr_merged_event(message: str):
    """Handle Git PR merged event"""
    try:
        from app.db.database import async_session
        from app.services.automation import handle_pr_merged_event

        async with async_session() as db:
            event_data = json.loads(message)
            await handle_pr_merged_event(event_data, db)
    except Exception as e:
        logger.error("Error handling PR merged event", exc_info=True)


async def register_git_handlers():
    """
    Register all Git event handlers with NATS.

    Subscribes to Git-related subjects with normal concurrency.
    """
    EVENT_CONCURRENCY = 10

    await subscribe_to_subject("git.commit_detected", handle_git_commit_event, max_concurrent=EVENT_CONCURRENCY)
    await subscribe_to_subject("git.pr_created", handle_git_pr_created_event, max_concurrent=EVENT_CONCURRENCY)
    await subscribe_to_subject("git.pr_merged", handle_git_pr_merged_event, max_concurrent=EVENT_CONCURRENCY)


__all__ = [
    "handle_git_commit_event",
    "handle_git_pr_created_event",
    "handle_git_pr_merged_event",
    "register_git_handlers",
]
