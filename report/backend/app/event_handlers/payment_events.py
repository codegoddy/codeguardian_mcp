"""
Payment Event Handlers

Handles payment processing and invoice events:
- Payment received confirmations
- Invoice sent notifications

NATS Subjects:
    payment.received - Payment received confirmation (to developer and client)
"""

import json
from datetime import datetime

from sqlalchemy import select

from app.core.config import settings
from app.core.logging_config import get_logger
from app.utils.email import send_payment_received_email
from app.utils.nats_client import subscribe_to_subject

logger = get_logger(__name__)


async def handle_payment_received_event(message: str):
    """Handle payment.received event - send confirmation emails to developer and client"""
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
                logger.warning("Invoice not found for payment.received event: %s", invoice_id)
                return

            project_result = await db.execute(select(Project).where(Project.id == invoice.project_id))
            project = project_result.scalar_one_or_none()
            user_result = await db.execute(select(User).where(User.id == invoice.user_id))
            user = user_result.scalar_one_or_none()
            client_result = await db.execute(select(Client).where(Client.id == invoice.client_id))
            client = client_result.scalar_one_or_none()

            if not project or not user or not client:
                logger.warning("Project, user, or client not found for invoice %s", invoice_id)
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
        logger.error("Error handling payment.received event", exc_info=True)


async def register_payment_handlers():
    """
    Register all payment event handlers with NATS.

    Subscribes to payment-related subjects with normal concurrency.
    """
    await subscribe_to_subject("payment.received", handle_payment_received_event)


__all__ = [
    "handle_payment_received_event",
    "register_payment_handlers",
]
