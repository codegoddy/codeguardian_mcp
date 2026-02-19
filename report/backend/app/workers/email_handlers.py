"""
Email Handlers - Consolidated NATS event handlers for email notifications

This module contains all email-related event handlers organized by domain:
- Authentication: user registration, OTP, password reset
- Contracts: contract signing, signatures, portal access
- Payments: payment received, invoices
- Projects: budget alerts, auto-pause
- Git: commits, pull requests
- Deliverables: status changes
- Change Requests: creation, approval, rejection
"""

import asyncio
import json
import random
import string
from datetime import datetime

from sqlalchemy import select

from app.core.config import settings
from app.core.logging_config import get_logger
from app.utils.email import (
    send_auto_pause_triggered_email,
    send_auto_pause_warning_email,
    send_change_request_approved_email,
    send_change_request_email,
    send_change_request_rejected_email,
    send_client_portal_welcome_email,
    send_contract_signed_email,
    send_contract_signing_email,
    send_deliverable_completed_email,
    send_email,
    send_invoice_email,
    send_otp_email,
    send_password_reset_email,
    send_payment_confirmed,
    send_payment_received_email,
    send_payment_verification_request,
    send_welcome_email,
)
from app.utils.email_templates import (
    render_change_request_notification,
    render_client_portal_welcome,
    render_contract_declined,
    render_deliverable_completed_email,
)
from app.utils.nats_client import subscribe_to_subject

logger = get_logger(__name__)


async def handle_user_registered(message: str):
    """Handle user registration event - send OTP email"""
    try:
        if message.startswith("New user registered: "):
            email = message.replace("New user registered: ", "")

            otp = "".join(random.choices(string.digits, k=6))

            from app.api.auth import otp_store

            otp_store[email] = otp

            await send_otp_email(email, otp)

    except Exception as e:
        logger.error("Error sending OTP email: %s", e, exc_info=True)


async def handle_user_registered_otp(message: str):
    """Handle user.registered_otp event - send OTP email asynchronously"""
    receive_time = datetime.now().timestamp()
    logger.debug(
        "[%s] NATS worker received user.registered_otp message: %s",
        receive_time,
        message,
    )
    try:
        message_data = json.loads(message)
        email = message_data.get("email")
        otp = message_data.get("otp")

        if not email or not otp:
            logger.error("Missing required fields in user.registered_otp message")
            return

        logger.debug("[%s] Sending OTP email to %s", datetime.now().timestamp(), email)
        result = await send_otp_email(email, otp)
        if result:
            logger.debug(
                "[%s] ✅ OTP email sent successfully to %s (took %.2fs from receive)",
                datetime.now().timestamp(),
                email,
                datetime.now().timestamp() - receive_time,
            )
        else:
            logger.error(
                "[%s] ❌ OTP email failed to send to %s",
                datetime.now().timestamp(),
                email,
            )

    except json.JSONDecodeError as e:
        logger.error("Failed to parse user.registered_otp message: %s", e, exc_info=True)
    except Exception as e:
        logger.error("Error sending OTP email: %s", e, exc_info=True)


async def handle_user_verified(message: str):
    """Handle user verification event - send welcome email for account verification only"""
    try:
        message_data = json.loads(message)
        email = message_data.get("email")
        is_account_verification = message_data.get("is_account_verification", False)
        user_full_name = message_data.get("user_full_name")

        if is_account_verification and email and user_full_name:
            await send_welcome_email(
                to_email=email,
                username=user_full_name,
                login_url=f"{settings.frontend_url}/login",
            )
        else:
            logger.debug(
                "%s - Skipping welcome email (not account verification or missing data)",
                email,
            )

    except json.JSONDecodeError:
        if message.startswith("OTP verified for: "):
            email = message.replace("OTP verified for: ", "")
            username = email.split("@")[0]
            await send_welcome_email(
                to_email=email,
                username=username,
                login_url=f"{settings.frontend_url}/login",
            )

    except Exception as e:
        logger.error("Error sending welcome email: %s", e, exc_info=True)


async def handle_forgot_password_otp(message: str):
    """Handle user.forgot_password_otp event - send password reset email via Brevo"""
    try:
        message_data = json.loads(message)
        email = message_data.get("email")
        otp = message_data.get("otp")

        if not email or not otp:
            return

        await send_password_reset_email(email, otp)

    except json.JSONDecodeError as e:
        logger.error("Failed to parse user.forgot_password_otp message: %s", e, exc_info=True)
    except Exception as e:
        logger.error("Error sending password reset email: %s", e, exc_info=True)


async def handle_forgot_password(message: str):
    """Handle forgot password event - send password reset email"""
    try:
        if message.startswith("Password reset requested for: "):
            email = message.replace("Password reset requested for: ", "")

            from app.api.auth import otp_store

            otp = otp_store.get(email, "")

            if otp:
                await send_password_reset_email(email, otp)

    except Exception as e:
        logger.error("Error sending password reset email: %s", e, exc_info=True)


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
        logger.error("Failed to parse contract signing email message: %s", e, exc_info=True)
    except Exception as e:
        logger.error("Error sending contract signing email: %s", e, exc_info=True)


async def handle_contract_signed_event(message: str):
    """Handle contract signed event - Send confirmation email to developer only"""
    try:
        from app.db.database import async_session
        from app.services.contract_service import handle_contract_signed_event as service_handler

        async with async_session() as db:
            await service_handler(message, db)

    except Exception as e:
        logger.error("Error handling contract.signed event: %s", e, exc_info=True)


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
        logger.error("Error handling client portal access link email: %s", e, exc_info=True)


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
        logger.error("Error handling contract declined email: %s", e, exc_info=True)


async def handle_git_commit_event(message: str):
    """Handle Git commit detected event"""
    try:
        from app.db.database import async_session
        from app.services.automation import handle_commit_event

        async with async_session() as db:
            event_data = json.loads(message)
            await handle_commit_event(event_data, db)

    except Exception as e:
        logger.error("Error handling commit event: %s", e, exc_info=True)


async def handle_git_pr_created_event(message: str):
    """Handle Git PR created event"""
    try:
        from app.db.database import async_session
        from app.services.automation import handle_pr_created_event

        async with async_session() as db:
            event_data = json.loads(message)
            await handle_pr_created_event(event_data, db)

    except Exception as e:
        logger.error("Error handling PR created event: %s", e, exc_info=True)


async def handle_git_pr_merged_event(message: str):
    """Handle Git PR merged event"""
    try:
        from app.db.database import async_session
        from app.services.automation import handle_pr_merged_event

        async with async_session() as db:
            event_data = json.loads(message)
            await handle_pr_merged_event(event_data, db)

    except Exception as e:
        logger.error("Error handling PR merged event: %s", e, exc_info=True)


async def handle_deliverable_status_changed_event(message: str):
    """Handle deliverable status changed event - send client notification"""
    try:
        from app.db.database import async_session
        from app.models.client import Client
        from app.models.project import Project

        async with async_session() as db:
            event_data = json.loads(message)
            task_reference = event_data.get("task_reference")
            status = event_data.get("status")

            if status != "completed":
                return

            logger.debug(
                "Deliverable %s completed - email notification would be sent here",
                task_reference,
            )

    except Exception as e:
        logger.error("Error handling deliverable status changed event: %s", e, exc_info=True)


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
        logger.error("Error handling change_request.created event: %s", e, exc_info=True)


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
        logger.error("Error handling change_request.approved event: %s", e, exc_info=True)


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
        logger.error("Error handling change_request.rejected event: %s", e, exc_info=True)


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
        logger.error("Error handling budget.low event: %s", e, exc_info=True)


async def handle_auto_pause_triggered_event(message: str):
    """Handle auto_pause.triggered event - Send critical alert emails to both developer and client"""
    try:
        from app.db.database import async_session
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

            from app.models import user as user_model

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
        logger.error("Error handling auto_pause.triggered event: %s", e, exc_info=True)


async def handle_payment_received_event(message: str):
    """Handle payment.received event - send confirmation emails"""
    try:
        from app.db.database import async_session
        from app.models import user as user_model
        from app.models.client import Client
        from app.models.invoice import Invoice
        from app.models.project import Project
        from app.models.user import User

        async with async_session() as db:
            event_data = json.loads(message)
            invoice_id = event_data.get("invoice_id")

            invoice_result = await db.execute(select(Invoice).where(Invoice.id == invoice_id))
            invoice = invoice_result.scalar_one_or_none()
            if not invoice:
                return

            project_result = await db.execute(select(Project).where(Project.id == invoice.project_id))
            project = project_result.scalar_one_or_none()
            user_result = await db.execute(select(User).where(User.id == invoice.user_id))
            user = user_result.scalar_one_or_none()
            client_result = await db.execute(select(Client).where(Client.id == invoice.client_id))
            client = client_result.scalar_one_or_none()

            if not project or not user or not client:
                return

            user_settings_result = await db.execute(
                select(user_model.UserSettings).where(user_model.UserSettings.user_id == project.user_id)
            )
            user_settings = user_settings_result.scalar_one_or_none()
            currency = user_settings.default_currency if user_settings else "USD"

            project_url = f"{settings.frontend_url}/projects/{project.id}"
            payment_date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            await send_payment_received_email(
                to_email=user.email,
                recipient_name=user.full_name or user.email.split("@")[0],
                invoice_number=invoice.invoice_number,
                project_name=project.name,
                total_amount=str(invoice.total_amount),
                currency=currency,
                payment_method=invoice.payment_method or "Paystack",
                payment_date=payment_date,
                is_developer=True,
                project_url=project_url,
                transaction_id=invoice.payment_transaction_id or "",
                auto_pause_resolved=event_data.get("auto_pause_resolved", False),
                new_budget_balance=str(project.current_budget_remaining),
            )

            await send_payment_received_email(
                to_email=client.email,
                recipient_name=client.name,
                invoice_number=invoice.invoice_number,
                project_name=project.name,
                total_amount=str(invoice.total_amount),
                currency=currency,
                payment_method=invoice.payment_method or "Paystack",
                payment_date=payment_date,
                is_developer=False,
                project_url=project_url,
                transaction_id=invoice.payment_transaction_id or "",
                developer_name=user.full_name or user.email.split("@")[0],
            )

    except Exception as e:
        logger.error("Error handling payment.received event: %s", e, exc_info=True)


async def register_email_handlers():
    """
    Register all email handlers with NATS subscriptions.

    This function should be called from main.py to start the email worker.
    It subscribes to all relevant NATS subjects and sets up appropriate concurrency limits.
    """
    logger.debug("Starting email worker initialization...")
    await asyncio.sleep(0.3)

    EMAIL_CONCURRENCY = 20
    EVENT_CONCURRENCY = 10

    logger.debug("Subscribing to email subjects...")

    await subscribe_to_subject("user.registered", handle_user_registered, max_concurrent=EMAIL_CONCURRENCY)
    await subscribe_to_subject(
        "user.registered_otp",
        handle_user_registered_otp,
        max_concurrent=EMAIL_CONCURRENCY,
    )
    await subscribe_to_subject("user.otp_verified", handle_user_verified, max_concurrent=EMAIL_CONCURRENCY)
    await subscribe_to_subject("user.forgot_password", handle_forgot_password, max_concurrent=EMAIL_CONCURRENCY)
    await subscribe_to_subject(
        "user.forgot_password_otp",
        handle_forgot_password_otp,
        max_concurrent=EMAIL_CONCURRENCY,
    )
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

    logger.debug("Subscribing to event subjects...")

    await subscribe_to_subject("auto_pause.triggered", handle_auto_pause_triggered_event)
    await subscribe_to_subject("payment.received", handle_payment_received_event)
    await subscribe_to_subject(
        "contract.signed",
        handle_contract_signed_event,
        max_concurrent=EVENT_CONCURRENCY,
    )

    await subscribe_to_subject("git.commit_detected", handle_git_commit_event, max_concurrent=EVENT_CONCURRENCY)
    await subscribe_to_subject("git.pr_created", handle_git_pr_created_event, max_concurrent=EVENT_CONCURRENCY)
    await subscribe_to_subject("git.pr_merged", handle_git_pr_merged_event, max_concurrent=EVENT_CONCURRENCY)

    await subscribe_to_subject(
        "deliverable.status_changed",
        handle_deliverable_status_changed_event,
        max_concurrent=EVENT_CONCURRENCY,
    )

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

    await subscribe_to_subject("budget.low", handle_budget_low_event, max_concurrent=EVENT_CONCURRENCY)

    await asyncio.sleep(0.2)

    logger.info("All email handlers registered and subscribed")
