"""
WebSocket API Router for NATS Event Streaming

Provides WebSocket endpoints for real-time NATS events.
"""

import asyncio
import json
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect

from app.core.config import settings
from app.services.websocket_manager import manager
from app.utils import nats_client

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/events")
async def websocket_events_endpoint(
    websocket: WebSocket,
    subjects: Optional[str] = Query(None, description="Comma-separated list of NATS subjects to subscribe to"),
):
    """
    WebSocket endpoint for receiving NATS events in real-time.

    Query Parameters:
        subjects: Optional comma-separated list of subjects to filter (e.g., "user.registered,payment.received")

    Example:
        ws://localhost:8000/api/ws/events
        ws://localhost:8000/api/ws/events?subjects=user.registered,payment.received
    """
    await manager.connect(websocket)

    # Parse subjects filter
    subject_filter = None
    if subjects:
        subject_filter = [s.strip() for s in subjects.split(",")]
        logger.info(f"WebSocket client subscribed to subjects: {subject_filter}")

    # NATS event handler
    async def nats_event_handler(message: str):
        """Forward NATS messages to this WebSocket client"""
        try:
            # Parse NATS message
            event_data = json.loads(message)

            # Apply subject filter if specified
            if subject_filter:
                # Check if this event's subject matches any in the filter
                event_subject = event_data.get("subject") or event_data.get("data", {}).get("event_type")
                if event_subject and not any(subject in event_subject for subject in subject_filter):
                    return  # Skip this event

            # Send to WebSocket client
            await manager.send_personal_message(event_data, websocket)

        except Exception as e:
            logger.error(f"Error handling NATS event: {e}")

    # Subscribe to relevant NATS subjects
    nats_subjects_to_subscribe = []

    if subject_filter:
        # Subscribe only to specified subjects
        nats_subjects_to_subscribe = subject_filter
    else:
        # Subscribe to all common subjects
        nats_subjects_to_subscribe = [
            "user.registered",
            "user.registered_otp",
            "user.otp_verified",
            "user.forgot_password",
            "email.contract_signing",
            "email.client_portal_welcome",
            "email.client_portal_access_link",
            "email.contract_signed_confirmation",
            "email.contract_declined",
            "auto_pause.triggered",
            "auto_pause.resolved",
            "payment.received",
            "commits.review",
            # "budget.alert",  # TODO: Enable when budget alerts are implemented
            "time.entry",
            "review.reminder",
            "contract.signed",
            "project.contract_generated",
            # Real-time UI update subjects
            "project.status_changed",
            "contract.status_changed",
            "deliverable.stats_updated",
            "session.stopped",  # NEW: CLI session stopped - trigger review modal
            # Activity and notification subjects for RightSidebar real-time updates
            "activity.created",
            "notification.created",
        ]

    # Subscribe to NATS subjects if NATS is connected
    logger.info(f"[WebSocket] NATS connection status: nc={nats_client.nc is not None}, js={nats_client.js is not None}")

    if nats_client.nc and nats_client.js:
        try:
            logger.info(f"[WebSocket] Subscribing to {len(nats_subjects_to_subscribe)} NATS subjects...")
            # Use ephemeral consumers for WebSocket (no durable_name) to avoid conflicts
            for subject in nats_subjects_to_subscribe:
                await nats_client.subscribe_to_subject(subject, nats_event_handler, durable_name=None, max_concurrent=5)
            logger.info(f"[WebSocket] ✅ Successfully subscribed to {len(nats_subjects_to_subscribe)} NATS subjects")
        except Exception as e:
            logger.error(f"[WebSocket] ❌ Error subscribing to NATS subjects: {e}")
            await manager.send_personal_message(
                {"type": "warning", "message": f"NATS subscription error: {str(e)}"},
                websocket,
            )
    else:
        logger.warning(
            f"[WebSocket] ⚠️  NATS not fully initialized (nc={nats_client.nc is not None}, js={nats_client.js is not None})"
        )
        # Send a warning message to the client
        await manager.send_personal_message(
            {
                "type": "warning",
                "message": "NATS not available, real-time events disabled",
            },
            websocket,
        )

    try:
        # Keep connection alive and handle incoming messages
        while True:
            # Wait for messages from client (e.g., ping/pong)
            data = await websocket.receive_text()

            # Handle client messages
            try:
                client_message = json.loads(data)

                # Handle ping
                if client_message.get("type") == "ping":
                    await manager.send_personal_message({"type": "pong"}, websocket)

            except json.JSONDecodeError:
                logger.warning(f"Invalid JSON from WebSocket client: {data}")

    except WebSocketDisconnect:
        manager.disconnect(websocket)
        logger.info("WebSocket client disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)


@router.get("/ws/status")
async def websocket_status():
    """Get WebSocket connection status"""
    return {
        "active_connections": manager.get_connection_count(),
        "nats_connected": nats_client.nc is not None
        and hasattr(nats_client.nc, "is_connected")
        and nats_client.nc.is_connected,
    }
