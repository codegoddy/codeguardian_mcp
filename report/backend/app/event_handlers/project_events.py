"""
Project Event Handlers

Handles project management and budget monitoring events:
- Budget low warnings (20% threshold)
- Auto-pause triggered alerts

NATS Subjects:
    budget.low            - Budget at warning threshold
    auto_pause.triggered  - Auto-pause due to low budget
"""

import json
from datetime import datetime

from sqlalchemy import select

from app.core.config import settings
from app.core.logging_config import get_logger
from app.utils.email import send_auto_pause_triggered_email, send_auto_pause_warning_email
from app.utils.nats_client import subscribe_to_subject

logger = get_logger(__name__)


async def handle_budget_low_event(message: str):
    """Handle budget.low event (20% threshold) - Send warning email to developer"""
    try:
        from app.db.database import async_session
        from app.models.project import Project
        from app.models.user import User

        async with async_session() as db:
            event_data = json.loads(message)
            project_id = event_data.get("project_id")

            project_result = await db.execute(select(Project).where(Project.id == project_id))
            project = project_result.scalar_one_or_none()
            if not project:
                return

            user_result = await db.execute(select(User).where(User.id == project.user_id))
            user = user_result.scalar_one_or_none()
            if not user:
                return

            await send_auto_pause_warning_email(
                to_email=user.email,
                developer_name=user.full_name or user.email.split("@")[0],
                project_name=project.name,
                budget_remaining=str(project.current_budget_remaining),
                budget_percentage=event_data.get("budget_percentage", "20"),
                project_budget=str(project.total_budget),
                currency=event_data.get("currency", "USD"),
                auto_pause_threshold=str(project.auto_pause_threshold),
                project_url=f"{settings.frontend_url}/projects/{project.id}",
            )

    except Exception as e:
        logger.error("Error handling budget.low event", exc_info=True)


async def handle_auto_pause_triggered_event(message: str):
    """Handle auto_pause.triggered event - Send critical alert emails to both developer and client"""
    try:
        from app.db.database import async_session
        from app.models import user as user_model
        from app.models.client import Client
        from app.models.project import Project
        from app.models.user import User

        async with async_session() as db:
            event_data = json.loads(message)
            project_id = event_data.get("project_id")

            project_result = await db.execute(select(Project).where(Project.id == project_id))
            project = project_result.scalar_one_or_none()
            if not project:
                return

            user_result = await db.execute(select(User).where(User.id == project.user_id))
            user = user_result.scalar_one_or_none()
            if not user:
                return

            client_result = await db.execute(select(Client).where(Client.id == project.client_id))
            client = client_result.scalar_one_or_none()
            if not client:
                return

            user_settings_result = await db.execute(
                select(user_model.UserSettings).where(user_model.UserSettings.user_id == project.user_id)
            )
            user_settings = user_settings_result.scalar_one_or_none()
            currency = user_settings.default_currency if user_settings else "USD"

            triggered_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            project_url = f"{settings.frontend_url}/projects/{project.id}"

            await send_auto_pause_triggered_email(
                to_email=user.email,
                recipient_name=user.full_name or user.email.split("@")[0],
                project_name=project.name,
                budget_remaining=str(project.current_budget_remaining),
                currency=currency,
                auto_pause_threshold=str(project.auto_pause_threshold),
                triggered_at=triggered_at,
                is_developer=True,
                project_url=project_url,
            )

            await send_auto_pause_triggered_email(
                to_email=client.email,
                recipient_name=client.name,
                project_name=project.name,
                budget_remaining=str(project.current_budget_remaining),
                currency=currency,
                auto_pause_threshold=str(project.auto_pause_threshold),
                triggered_at=triggered_at,
                is_developer=False,
                project_url=project_url,
                developer_name=user.full_name or user.email.split("@")[0],
            )

    except Exception as e:
        logger.error("Error handling auto_pause.triggered event", exc_info=True)


async def register_project_handlers():
    """
    Register all project event handlers with NATS.

    Subscribes to project-related subjects with normal concurrency.
    """
    EVENT_CONCURRENCY = 10

    await subscribe_to_subject("budget.low", handle_budget_low_event, max_concurrent=EVENT_CONCURRENCY)
    await subscribe_to_subject("auto_pause.triggered", handle_auto_pause_triggered_event)


__all__ = [
    "handle_budget_low_event",
    "handle_auto_pause_triggered_event",
    "register_project_handlers",
]
