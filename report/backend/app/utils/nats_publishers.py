import asyncio
import json
from datetime import datetime

import nats
from nats.aio.client import Client as NATS
from nats.js import JetStreamContext
from nats.js.api import AckPolicy, ConsumerConfig, DeliverPolicy, RetentionPolicy, StorageType, StreamConfig

from app.core.config import settings
from app.utils.nats_client import publish_event

nc: NATS | None = None
js: JetStreamContext | None = None

# Real-Time Update Event Publishers


async def publish_project_status_changed(project_data: dict):
    """
    Publish project status change event for real-time UI updates.

    Args:
        project_data: Dictionary containing:
            - project_id: str (required)
            - status: str (required) - new project status
            - user_id: str (required)
            - timestamp: str (optional) - ISO format timestamp
    """
    await publish_event(
        "project.status_changed",
        {
            "event_type": "project_status_changed",
            "project_id": project_data["project_id"],
            "status": project_data["status"],
            "user_id": project_data["user_id"],
            "timestamp": project_data.get("timestamp", datetime.utcnow().isoformat()),
        },
        background=True,
    )


async def publish_contract_status_changed(contract_data: dict):
    """
    Publish contract status change event for real-time UI updates.

    Args:
        contract_data: Dictionary containing:
            - contract_id: str (required)
            - project_id: str (optional)
            - status: str (required) - new contract status (signed/declined/pending)
            - user_id: str (required)
            - timestamp: str (optional) - ISO format timestamp
    """
    await publish_event(
        "contract.status_changed",
        {
            "event_type": "contract_status_changed",
            "contract_id": contract_data["contract_id"],
            "project_id": contract_data.get("project_id"),
            "status": contract_data["status"],
            "user_id": contract_data["user_id"],
            "timestamp": contract_data.get("timestamp", datetime.utcnow().isoformat()),
        },
        background=True,
    )


async def publish_deliverable_stats_updated(stats_data: dict):
    """
    Publish deliverable stats update event for real-time UI updates.

    Args:
        stats_data: Dictionary containing:
            - deliverable_id: str (required)
            - project_id: str (required)
            - actual_hours: float (optional)
            - total_cost: float (optional)
            - budget_used_percentage: float (optional)
            - user_id: str (required)
            - timestamp: str (optional) - ISO format timestamp
    """
    await publish_event(
        "deliverable.stats_updated",
        {
            "event_type": "deliverable_stats_updated",
            "deliverable_id": stats_data["deliverable_id"],
            "project_id": stats_data["project_id"],
            "actual_hours": stats_data.get("actual_hours"),
            "total_cost": stats_data.get("total_cost"),
            "budget_used_percentage": stats_data.get("budget_used_percentage"),
            "user_id": stats_data["user_id"],
            "timestamp": stats_data.get("timestamp", datetime.utcnow().isoformat()),
        },
        background=True,
    )


async def publish_session_stopped(session_data: dict):
    """
    Publish session stopped event to trigger review modal in frontend.

    Args:
        session_data: Dictionary containing:
            - session_id: str (required)
            - user_id: str (required)
            - deliverable_id: str (required)
            - project_id: str (required)
            - duration_minutes: int (required)
            - tracking_code: str (optional)
            - timestamp: str (optional) - ISO format timestamp
    """
    await publish_event(
        "session.stopped",
        {
            "event_type": "session_stopped",
            "session_id": session_data["session_id"],
            "user_id": session_data["user_id"],
            "deliverable_id": session_data["deliverable_id"],
            "project_id": session_data["project_id"],
            "duration_minutes": session_data["duration_minutes"],
            "tracking_code": session_data.get("tracking_code"),
            "timestamp": session_data.get("timestamp", datetime.utcnow().isoformat()),
        },
        background=True,
    )
