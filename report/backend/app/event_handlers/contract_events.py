"""
Contract Event Handlers

Handles contract lifecycle and client portal events:
- Contract signing requests
- Contract signed confirmations
- Client portal welcome emails
- Contract declined notifications

NATS Subjects:
    email.contract_signing              - Send signing link to client
    contract.signed                      - Contract signed confirmation
    email.client_portal_welcome           - Welcome client to portal
    email.client_portal_access_link       - Send new portal access link
    email.contract_signed_confirmation    - Contract signed notification
    email.contract_declined              - Contract declined notification
"""

import json

from app.core.config import settings
from app.core.logging_config import get_logger
from app.utils.email import send_contract_signed_email, send_contract_signing_email, send_email
from app.utils.email_templates import (
    render_client_portal_welcome,
    render_contract_declined,
    render_contract_signed_confirmation,
)
from app.utils.nats_client import subscribe_to_subject

logger = get_logger(__name__)


async def handle_contract_signing_email(message: str):
    """Handle contract signing email event - send contract signing link to client"""
    try:
        message_data = json.loads(message)
        to_email = message_data.get("to_email")
        client_name = message_data.get("client_name")
        developer_name = message_data.get("developer_name")
        developer_email = message_data.get("developer_email")
        project_name = message_data.get("project_name")
        project_budget = message_data.get("project_budget")
        currency = message_data.get("currency", "USD")
        signing_url = message_data.get("signing_url")

        if not all([to_email, client_name, developer_name, project_name, signing_url]):
            logger.error("Missing required fields in contract signing email message")
            return

        await send_contract_signing_email(
            to_email=to_email,
            client_name=client_name,
            developer_name=developer_name,
            developer_email=developer_email,
            project_name=project_name,
            project_budget=project_budget,
            currency=currency,
            signing_url=signing_url,
        )

    except json.JSONDecodeError as e:
        logger.error("Failed to parse contract signing email message", exc_info=True)
    except Exception as e:
        logger.error("Error sending contract signing email", exc_info=True)


async def handle_contract_signed_event(message: str):
    """Handle contract signed event - Send confirmation email to developer only"""
    try:
        from app.db.database import async_session
        from app.services.contract_service import handle_contract_signed_event as service_handler

        async with async_session() as db:
            await service_handler(message, db)

    except Exception as e:
        logger.error("Error handling contract.signed event", exc_info=True)


async def handle_client_portal_welcome_email(message: str):
    """Handle client portal welcome email event - send magic link to client with PDF attachment"""
    try:
        message_data = json.loads(message)
        to_email = message_data.get("to_email")
        client_name = message_data.get("client_name")
        developer_name = message_data.get("developer_name")
        project_name = message_data.get("project_name")
        magic_link = message_data.get("magic_link")
        pdf_url = message_data.get("pdf_url")

        if not all([to_email, client_name, developer_name, project_name, magic_link]):
            logger.error("Missing required fields in client portal welcome email message")
            return

        html_content = render_client_portal_welcome(
            client_name=client_name,
            developer_name=developer_name,
            project_name=project_name,
            magic_link=magic_link,
            app_name=settings.app_name,
        )

        # Attach the signed contract PDF if available
        attachment_url = pdf_url if pdf_url else None
        attachment_name = f"Contract_{project_name.replace(' ', '_')}.pdf" if pdf_url else None

        if attachment_url:
            logger.info("Attaching contract PDF to welcome email for %s: %s", to_email, attachment_url)

        await send_email(
            to_email=to_email,
            subject=f"Welcome to {project_name} Client Portal",
            html_content=html_content,
            attachment_url=attachment_url,
            attachment_name=attachment_name,
        )

        logger.info("Client portal welcome email sent to %s with PDF attachment", to_email)

    except Exception as e:
        logger.error("Error handling client portal welcome email: %s", e, exc_info=True)


async def handle_client_portal_access_link_email(message: str):
    """Handle client portal access link email event - send new magic link"""
    try:
        message_data = json.loads(message)
        to_email = message_data.get("to_email")
        client_name = message_data.get("client_name")
        project_name = message_data.get("project_name")
        magic_link = message_data.get("magic_link")

        if not all([to_email, client_name, project_name, magic_link]):
            return

        html_content = render_client_portal_welcome(
            client_name=client_name,
            developer_name="DevHQ",
            project_name=project_name,
            magic_link=magic_link,
            app_name=settings.app_name,
        )

        await send_email(
            to_email=to_email,
            subject=f"Access Link for {project_name}",
            html_content=html_content,
        )

    except Exception as e:
        logger.error("Error handling client portal access link email", exc_info=True)


async def handle_contract_signed_confirmation_email(message: str):
    """Handle contract signed confirmation email event with PDF attachment"""
    try:
        from app.utils.email_templates import render_contract_signed_confirmation

        message_data = json.loads(message)
        to_email = message_data.get("to_email")
        recipient_name = message_data.get("recipient_name")
        project_name = message_data.get("project_name")
        signer_name = message_data.get("signer_name", "")
        signed_date = message_data.get("signed_date", "")
        project_url = message_data.get("project_url", "")
        pdf_url = message_data.get("pdf_url")

        if not all([to_email, recipient_name, project_name]):
            return

        html_content = render_contract_signed_confirmation(
            recipient_name=recipient_name,
            project_name=project_name,
            signer_name=signer_name,
            signed_date=signed_date,
            is_developer=True,
            project_url=project_url,
        )

        await send_email(
            to_email=to_email,
            subject=f"Contract Signed: {project_name}",
            html_content=html_content,
            attachment_url=pdf_url,
            attachment_name=f"Contract_{project_name.replace(' ', '_')}.pdf",
        )

    except Exception as e:
        logger.error("Error handling contract signed confirmation email: %s", e, exc_info=True)


async def handle_contract_declined_email(message: str):
    """Handle contract declined email event"""
    try:
        message_data = json.loads(message)
        to_email = message_data.get("to_email")
        developer_name = message_data.get("developer_name")
        project_name = message_data.get("project_name")
        decline_reason = message_data.get("decline_reason", "")
        project_url = message_data.get("project_url", "")

        if not all([to_email, developer_name, project_name]):
            return

        html_content = render_contract_declined(
            developer_name=developer_name,
            project_name=project_name,
            decline_reason=decline_reason,
            project_url=project_url,
        )

        await send_email(
            to_email=to_email,
            subject=f"Contract Declined: {project_name}",
            html_content=html_content,
        )

    except Exception as e:
        logger.error("Error handling contract declined email", exc_info=True)


async def register_contract_handlers():
    """
    Register all contract event handlers with NATS.

    Subscribes to contract-related subjects with high concurrency
    for fast email delivery to clients.
    """
    EMAIL_CONCURRENCY = 20
    EVENT_CONCURRENCY = 10

    await subscribe_to_subject(
        "email.contract_signing",
        handle_contract_signing_email,
        max_concurrent=EMAIL_CONCURRENCY,
    )
    await subscribe_to_subject(
        "email.client_portal_welcome",
        handle_client_portal_welcome_email,
        max_concurrent=EMAIL_CONCURRENCY,
    )
    await subscribe_to_subject(
        "email.client_portal_access_link",
        handle_client_portal_access_link_email,
        max_concurrent=EMAIL_CONCURRENCY,
    )
    await subscribe_to_subject(
        "email.contract_signed_confirmation",
        handle_contract_signed_confirmation_email,
        max_concurrent=EMAIL_CONCURRENCY,
    )
    await subscribe_to_subject(
        "email.contract_declined",
        handle_contract_declined_email,
        max_concurrent=EMAIL_CONCURRENCY,
    )
    await subscribe_to_subject(
        "contract.signed",
        handle_contract_signed_event,
        max_concurrent=EVENT_CONCURRENCY,
    )


__all__ = [
    "handle_contract_signing_email",
    "handle_contract_signed_event",
    "handle_client_portal_welcome_email",
    "handle_client_portal_access_link_email",
    "handle_contract_signed_confirmation_email",
    "handle_contract_declined_email",
    "register_contract_handlers",
]
