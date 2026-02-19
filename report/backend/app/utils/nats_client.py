import asyncio
import json

import nats
from nats.aio.client import Client as NATS
from nats.js import JetStreamContext
from nats.js.api import (
    AckPolicy,
    ConsumerConfig,
    DeliverPolicy,
    RetentionPolicy,
    StorageType,
    StreamConfig,
)

from app.core.config import settings
from app.core.logging_config import get_logger

logger = get_logger(__name__)

nc: NATS | None = None
js: JetStreamContext | None = None


async def init_nats():
    global nc, js
    try:
        # Debug: Print all relevant environment variables
        import os

        logger.debug("Environment Variables for NATS:")
        for key, value in os.environ.items():
            if "NATS" in key or "URL" in key or "HOST" in key or "PORT" in key:
                logger.debug("  %s: %s", key, value)

        # Connect to NATS with timeout
        nats_url = settings.nats_config["url"]
        logger.debug("Connecting to NATS at %s", nats_url)
        nc = await asyncio.wait_for(nats.connect(nats_url), timeout=5.0)  # 5 second timeout
        logger.info("Connected to NATS at %s", nats_url)

        # Initialize JetStream
        try:
            js_manager = nc.jetstream()
            js = nc.jetstream()
            logger.info("JetStream initialized successfully")
        except Exception as js_error:
            logger.warning("JetStream not available: %s", js_error)
            logger.info("Continuing with regular NATS (no JetStream features)")
            js = None

        # Create streams for different message types
        streams = [
            StreamConfig(
                name="AUTH_EVENTS",
                subjects=[
                    "user.registered",
                    "user.registered_otp",
                    "user.logged_in",
                    "user.oauth_login",
                    "user.otp_verified",
                    "user.forgot_password",
                    "user.forgot_password_otp",  # Added missing subject
                    "email.contract_signing",
                    "email.contract_signed_confirmation",
                    "email.contract_declined",
                    "email.waitlist_confirmation",
                ],
                retention=RetentionPolicy.LIMITS,  # Messages persist until processed
                storage=StorageType.MEMORY,  # Use memory storage (change to FILE for persistence)
                max_age=86400 * 7,  # 7 days retention
                max_msgs=10000,  # Maximum messages per stream
            ),
            StreamConfig(
                name="PROJECT_EVENTS",
                subjects=[
                    "project.created",
                    "project.scope_configured",
                    "project.contract_generated",
                    "project.contract_signed",
                    "project.completed",
                    "project.contract_sent",
                    "project.status_changed",  # NEW: Real-time project status updates
                    "contract.status_changed",  # NEW: Real-time contract status updates
                ],
                retention=RetentionPolicy.LIMITS,
                storage=StorageType.FILE,  # Persist to disk for important events
                max_age=86400 * 30,  # 30 days retention
                max_msgs=50000,
            ),
            StreamConfig(
                name="FINANCIAL_EVENTS",
                subjects=[
                    "retainer.low_balance",
                    "retainer.critical",
                    "retainer.depleted",
                    "retainer.replenished",
                    "payment.received",
                    "invoice.generated",
                    "invoice.sent",
                    "budget.low",
                ],
                retention=RetentionPolicy.LIMITS,
                storage=StorageType.FILE,  # Critical financial events must persist
                max_age=86400 * 90,  # 90 days retention for financial records
                max_msgs=100000,
            ),
            StreamConfig(
                name="GIT_AUTOMATION_EVENTS",
                subjects=[
                    "git.commit_detected",
                    "git.commit_processed",  # NEW: Individual commit processing events
                    "git.pr_created",
                    "git.pr_merged",
                    "git.time_entry_created",
                    "git.deliverable_linked",
                    "git.webhook_configured",  # NEW: Webhook configuration events
                    "commit.detected",
                    "pr.merged",
                    "deliverable.linked",
                ],
                retention=RetentionPolicy.LIMITS,
                storage=StorageType.FILE,
                max_age=86400 * 30,  # 30 days retention
                max_msgs=100000,
            ),
            StreamConfig(
                name="CLIENT_PORTAL_EVENTS",
                subjects=[
                    "client_portal.access_requested",
                    "client_portal.login_success",
                    "client_portal.login_failed",
                    "client_portal.suspicious_activity",
                    "email.client_portal_welcome",
                    "email.client_portal_access_link",  # New: Send access link to client
                    "login.success",
                    "payment.marked_paid",
                    "contract.signed",  # NEW: Contract signed events
                ],
                retention=RetentionPolicy.LIMITS,
                storage=StorageType.FILE,
                max_age=86400 * 30,  # 30 days retention
                max_msgs=50000,
            ),
            StreamConfig(
                name="ENFORCEMENT_EVENTS",
                subjects=[
                    "auto_pause.triggered",
                    "auto_pause.resolved",
                    "git_access.revoked",
                    "git_access.restored",
                ],
                retention=RetentionPolicy.LIMITS,
                storage=StorageType.FILE,  # Critical enforcement events
                max_age=86400 * 90,  # 90 days retention
                max_msgs=50000,
            ),
            StreamConfig(
                name="CHANGE_REQUEST_EVENTS",
                subjects=[
                    "change_request.created",
                    "change_request.approved",
                    "change_request.rejected",
                    "change_request.completed",
                ],
                retention=RetentionPolicy.LIMITS,
                storage=StorageType.FILE,
                max_age=86400 * 60,  # 60 days retention
                max_msgs=50000,
            ),
            StreamConfig(
                name="DELIVERABLE_EVENTS",
                subjects=[
                    "deliverable.completed",
                    "deliverable.verified",
                    "deliverable.ready_to_bill",
                    "deliverable.status_changed",
                    "deliverable.documentation_generated",
                ],
                retention=RetentionPolicy.LIMITS,
                storage=StorageType.FILE,
                max_age=86400 * 60,  # 60 days retention
                max_msgs=100000,
            ),
            StreamConfig(
                name="TIME_TRACKING_EVENTS",
                subjects=[
                    "commits.review",
                    "budget.alert",
                    "time.entry",
                    "time_entry.pending_review",  # New: Time entry needs approval
                    "time_entry.approved",  # New: Time entry approved
                    "time_entry.rejected",  # New: Time entry rejected
                    "review.reminder",
                    "deliverable.stats_updated",  # NEW: Real-time deliverable stats
                    "session.stopped",  # NEW: CLI session stopped - trigger review modal
                ],
                retention=RetentionPolicy.INTEREST,  # Allow multiple consumers per subject
                storage=StorageType.FILE,  # Persist time tracking events
                max_age=86400 * 30,  # 30 days retention
                max_msgs=100000,
            ),
            StreamConfig(
                name="ACTIVITY_NOTIFICATION_EVENTS",
                subjects=[
                    "activity.created",
                    "activity.updated",
                    "notification.created",
                    "notification.read",
                    "notification.deleted",
                ],
                retention=RetentionPolicy.LIMITS,
                storage=StorageType.FILE,  # Persist activity and notification events
                max_age=86400 * 30,  # 30 days retention
                max_msgs=100000,
            ),
        ]

        for stream_config in streams:
            try:
                # Try to get existing stream first
                try:
                    existing_stream = await js_manager.stream_info(stream_config.name)

                    # Check if subjects or retention policy have changed
                    existing_subjects = set(existing_stream.config.subjects or [])
                    new_subjects = set(stream_config.subjects)

                    # Check retention policy (enum value comparison)
                    # existing_stream.config.retention is likely an int or enum, stream_config.retention is an enum
                    # We compare their values to be safe
                    existing_retention = existing_stream.config.retention
                    new_retention = stream_config.retention

                    if existing_subjects != new_subjects or existing_retention != new_retention:
                        # Configuration changed - need to delete and recreate
                        logger.debug(
                            "Configuration changed for %s, recreating stream...",
                            stream_config.name,
                        )
                        if existing_subjects != new_subjects:
                            logger.debug(
                                "  Subjects changed: %s -> %s",
                                existing_subjects,
                                new_subjects,
                            )
                        if existing_retention != new_retention:
                            logger.debug(
                                "  Retention changed: %s -> %s",
                                existing_retention,
                                new_retention,
                            )

                        await js_manager.delete_stream(stream_config.name)
                        await js_manager.add_stream(stream_config)
                        logger.info("Recreated JetStream: %s", stream_config.name)
                    else:
                        # Just update other config
                        await js_manager.update_stream(stream_config)
                        logger.info("Updated JetStream: %s", stream_config.name)
                except Exception as e:
                    # Stream doesn't exist, create it
                    if "not found" in str(e).lower():
                        await js_manager.add_stream(stream_config)
                        logger.info("Created JetStream: %s", stream_config.name)
                    else:
                        raise
            except Exception as e:
                logger.error(
                    "Failed to create/update stream %s: %s",
                    stream_config.name,
                    e,
                    exc_info=True,
                )

    except asyncio.TimeoutError:
        logger.warning("NATS connection timeout - NATS server may not be available")
        logger.info("Application will continue without NATS functionality")
    except Exception as e:
        logger.warning("Failed to connect to NATS: %s", e)
        logger.info("Application will continue without NATS functionality")


async def publish_message(subject: str, message: str):
    if nc and js:
        try:
            # Use JetStream for reliable message publishing with timeout
            # Increased timeout to 10 seconds to handle high-load scenarios
            await asyncio.wait_for(
                js.publish(subject, message.encode()),
                timeout=10.0,  # 10 second timeout for publish
            )
            logger.debug("Published message to JetStream subject: %s", subject)
        except asyncio.TimeoutError as e:
            logger.error("JetStream publish timeout for subject: %s", subject, exc_info=True)
            raise Exception(f"JetStream publish timeout for subject: {subject}") from e
        except Exception as e:
            logger.error("Failed to publish to JetStream: %s", e, exc_info=True)
            raise
    elif nc:
        # Fallback to regular NATS if JetStream not available
        try:
            await asyncio.wait_for(
                nc.publish(subject, message.encode()),
                timeout=10.0,  # 10 second timeout for publish
            )
            logger.debug("Published message to NATS subject: %s (fallback)", subject)
        except asyncio.TimeoutError as e:
            logger.error("NATS publish timeout for subject: %s", subject, exc_info=True)
            raise Exception(f"NATS publish timeout for subject: {subject}") from e
        except Exception as e:
            logger.error("Failed to publish to NATS: %s", e, exc_info=True)
            raise
    else:
        error_msg = f"NATS not connected, cannot publish to {subject}"
        logger.warning(error_msg)
        raise Exception(error_msg)


async def publish_message_background(subject: str, message: str):
    """
    Publish a message to NATS/JetStream asynchronously without waiting for acknowledgement.
    This is faster but less reliable (fire and forget).
    """
    if nc and js:
        try:
            # Use JetStream publish_async for non-blocking publish
            # This returns a future that resolves when the ack is received
            future = await js.publish_async(subject, message.encode())

            # We don't await the future here, but we should attach a callback or
            # just let it run. However, publish_async in nats-py usually returns a future.
            # To truly be "background" from the caller's perspective, we shouldn't await the ack.
            # But js.publish_async IS the non-blocking call.
            # It returns an asyncio.Future.

            # Define a callback to handle the ack/error
            def ack_handler(future):
                try:
                    future.result()
                    # logger.debug("Async publish confirmed for %s", subject)
                except Exception as e:
                    error_msg = str(e)
                    # Handle "no response from stream" error - stream might need restart
                    if "no response from stream" in error_msg.lower():
                        logger.warning("JetStream stream not responding for %s", subject)
                        logger.info("Stream may need to be recreated. Restart backend to update streams.")
                    else:
                        logger.error("Async publish failed for %s: %s", subject, e, exc_info=True)

            future.add_done_callback(ack_handler)
            logger.debug("Published async message to JetStream subject: %s", subject)

        except Exception as e:
            error_msg = str(e)
            # Handle stream configuration errors gracefully
            if "no response from stream" in error_msg.lower():
                logger.warning("JetStream stream not configured for %s", subject)
                logger.info("Falling back to regular NATS publish")
                # Fallback to regular NATS if JetStream fails
                if nc:
                    try:
                        await nc.publish(subject, message.encode())
                        logger.debug("Published to regular NATS subject: %s", subject)
                    except Exception as fallback_error:
                        logger.error(
                            "Fallback NATS publish also failed: %s",
                            fallback_error,
                            exc_info=True,
                        )
            else:
                logger.error(
                    "Failed to initiate async publish to JetStream: %s",
                    e,
                    exc_info=True,
                )
            # Don't crash the caller - this is background publishing
            pass
    elif nc:
        # Fallback to regular NATS
        try:
            # nc.publish is already fire-and-forget in some contexts if we don't flush,
            # but usually it's just writing to the buffer.
            await nc.publish(subject, message.encode())
            logger.debug("Published message to NATS subject: %s (fallback async)", subject)
        except Exception as e:
            logger.error("Failed to publish to NATS (async): %s", e, exc_info=True)
    else:
        logger.warning("NATS not connected, cannot publish async to %s", subject)


async def publish_event(subject: str, data: dict, background: bool = False):
    """Publish an event to NATS with JSON serialization."""
    message = json.dumps(data)
    if background:
        await publish_message_background(subject, message)
    else:
        # Try to publish with error tolerance for non-critical events
        try:
            await publish_message(subject, message)
        except Exception as e:
            # Log but don't crash for non-critical event types
            if subject in ["contract.signed"]:
                logger.warning("Failed to publish %s event (continuing): %s", subject, e)
            else:
                raise


async def subscribe_to_subject(
    subject: str,
    callback,
    durable_name: str | None = "default",
    max_concurrent: int = 10,
):
    """
    Subscribe to a NATS subject with concurrent message processing.

    Args:
        subject: NATS subject to subscribe to
        callback: Async function to handle messages
        durable_name: Optional durable consumer name. Use "default" for auto-generated durable name,
                     None for ephemeral consumer (no persistence)
        max_concurrent: Maximum number of concurrent message handlers (default: 10)
    """
    if nc and js:
        try:
            # Semaphore to limit concurrent processing
            semaphore = asyncio.Semaphore(max_concurrent)

            async def message_handler(msg):
                async with semaphore:
                    try:
                        await callback(msg.data.decode())
                        # Acknowledge successful processing
                        await msg.ack()
                    except Exception as e:
                        logger.error("Error processing message: %s", e, exc_info=True)
                        # Negative acknowledge - message will be redelivered
                        await msg.nak()

            # Create consumer config based on durable_name parameter
            if durable_name is None:
                # Ephemeral consumer - no durable_name, gets new messages only
                consumer_config = ConsumerConfig(
                    ack_policy=AckPolicy.EXPLICIT,
                    deliver_policy=DeliverPolicy.NEW,  # Only new messages (not historical)
                    max_ack_pending=max_concurrent * 2,
                    max_deliver=3,
                )
                logger.debug(
                    "Subscribed to JetStream subject: %s with ephemeral consumer (max_concurrent=%d)",
                    subject,
                    max_concurrent,
                )
            else:
                # Durable consumer - persists and processes all messages
                consumer_config = ConsumerConfig(
                    durable_name=(durable_name if durable_name != "default" else f"{subject.replace('.', '_')}_consumer"),
                    ack_policy=AckPolicy.EXPLICIT,
                    deliver_policy=DeliverPolicy.ALL,  # Process all messages
                    max_ack_pending=max_concurrent * 2,
                    max_deliver=3,
                )
                logger.debug(
                    "Subscribed to JetStream subject: %s with durable consumer (max_concurrent=%d)",
                    subject,
                    max_concurrent,
                )

            await js.subscribe(subject, cb=message_handler, config=consumer_config)

        except Exception as e:
            logger.error(
                "Failed to subscribe to JetStream subject %s: %s",
                subject,
                e,
                exc_info=True,
            )
    elif nc:
        # Fallback to regular NATS subscription
        semaphore = asyncio.Semaphore(max_concurrent)

        async def message_handler(msg):
            async with semaphore:
                await callback(msg.data.decode())

        await nc.subscribe(subject, cb=message_handler)
        logger.debug(
            "Subscribed to NATS subject: %s (fallback, max_concurrent=%d)",
            subject,
            max_concurrent,
        )
    else:
        logger.warning("NATS not connected, cannot subscribe to %s", subject)


async def close_nats():
    if nc:
        await nc.drain()
        await nc.close()
        logger.info("NATS connection closed")


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
    from datetime import datetime

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
    from datetime import datetime

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
    from datetime import datetime

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
