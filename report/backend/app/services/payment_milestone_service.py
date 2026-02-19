"""
Payment Milestone Service

Handles automatic triggering of payment milestones based on project completion,
and auto-generates invoices when milestones are triggered.
"""

import secrets
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging_config import get_logger
from app.models.client import Client
from app.models.deliverable import Deliverable
from app.models.invoice import Invoice
from app.models.payment_milestone import PaymentMilestone
from app.models.project import Project

logger = get_logger(__name__)


async def generate_invoice_number(db: AsyncSession) -> str:
    """Generate unique invoice number"""
    while True:
        date_part = datetime.now(timezone.utc).strftime("%Y%m%d")
        random_part = secrets.token_hex(2).upper()
        invoice_number = f"INV-{date_part}-{random_part}"

        result = await db.execute(select(Invoice).where(Invoice.invoice_number == invoice_number))
        existing = result.scalar_one_or_none()
        if not existing:
            return invoice_number


async def auto_generate_invoice_for_payment_milestone(
    db: AsyncSession, milestone: PaymentMilestone, project: Project, client: Client
) -> Optional[Invoice]:
    """
    Auto-generate an invoice when a payment milestone is triggered.

    Creates invoice in 'draft' status with the milestone amount.
    """
    try:
        # Generate invoice number
        invoice_number = await generate_invoice_number(db)

        # Calculate amounts
        subtotal = milestone.amount
        platform_fee = Decimal("0.00")  # Could implement subscription-based fee here
        tax_amount = Decimal("0.00")
        total_amount = subtotal + platform_fee + tax_amount

        # Set due date (14 days from now for milestone payments)
        due_date = datetime.now(timezone.utc) + timedelta(days=14)

        # Create invoice
        invoice = Invoice(
            project_id=project.id,
            client_id=client.id,
            user_id=project.user_id,
            invoice_number=invoice_number,
            status="draft",
            subtotal=subtotal,
            platform_fee=platform_fee,
            tax_amount=tax_amount,
            total_amount=total_amount,
            payment_method=client.payment_method,
            payment_gateway_name=client.payment_gateway_name,
            due_date=due_date,
            notes=f"Payment milestone: {milestone.name} ({milestone.percentage}%)",
        )

        db.add(invoice)
        await db.flush()  # Get invoice.id before committing

        # Link invoice to payment milestone
        milestone.invoice_id = invoice.id
        milestone.status = "invoiced"
        milestone.invoiced_at = datetime.now(timezone.utc)

        logger.info(
            "Created invoice %s for milestone '%s' - %s",
            invoice_number,
            milestone.name,
            total_amount,
        )

        return invoice

    except Exception as e:
        logger.error("Error creating invoice for milestone %s", milestone.id, exc_info=True)
        return None


async def calculate_project_completion_percentage(db: AsyncSession, project_id: UUID) -> float:
    """
    Calculate project completion percentage based on deliverables.

    Completed statuses: completed, verified, ready_to_bill, billed

    Returns: Float percentage (0.0 to 100.0)
    """
    result = await db.execute(
        select(
            func.count(Deliverable.id).label("total"),
            func.count(Deliverable.id)
            .filter(Deliverable.status.in_(["completed", "verified", "ready_to_bill", "billed"]))
            .label("completed"),
        ).where(Deliverable.project_id == project_id)
    )
    stats = result.one()

    if stats.total == 0:
        return 0.0

    return (stats.completed / stats.total) * 100


async def check_and_trigger_payment_milestones(db: AsyncSession, project_id: UUID) -> List[PaymentMilestone]:
    """
    Check all payment milestones for a project and trigger those that have met their threshold.
    Also auto-generates invoices for triggered milestones.

    Handles:
    - percentage_complete: Triggers when project completion % >= trigger_value

    Returns: List of newly triggered milestones
    """
    # Calculate current project completion
    completion_percentage = await calculate_project_completion_percentage(db, project_id)
    logger.info("Project %s completion: %.1f%%", project_id, completion_percentage)

    # Get project and client for invoice generation
    project_result = await db.execute(select(Project).where(Project.id == project_id))
    project = project_result.scalar_one_or_none()

    if not project:
        return []

    client_result = await db.execute(select(Client).where(Client.id == project.client_id))
    client = client_result.scalar_one_or_none()

    # Get all pending payment milestones for this project
    result = await db.execute(
        select(PaymentMilestone)
        .where(
            PaymentMilestone.project_id == project_id,
            PaymentMilestone.status == "pending",
            PaymentMilestone.trigger_type == "percentage_complete",
        )
        .order_by(PaymentMilestone.order)
    )
    pending_milestones = result.scalars().all()

    triggered_milestones = []
    now = datetime.utcnow()

    for milestone in pending_milestones:
        try:
            # Parse trigger_value as a percentage threshold
            threshold = float(milestone.trigger_value) if milestone.trigger_value else 100

            if completion_percentage >= threshold:
                # Trigger this milestone
                milestone.status = "triggered"
                milestone.triggered_at = now
                triggered_milestones.append(milestone)

                logger.info(
                    "Auto-triggered '%s' (threshold: %.1f%%, actual: %.1f%%)",
                    milestone.name,
                    threshold,
                    completion_percentage,
                )

                # Auto-generate invoice if client exists
                if client:
                    await auto_generate_invoice_for_payment_milestone(db, milestone, project, client)

        except (ValueError, TypeError) as e:
            logger.error(
                "Error parsing trigger_value for milestone %s",
                milestone.id,
                exc_info=True,
            )
            continue

    if triggered_milestones:
        # Update project payment schedule status to 'active' if not already
        if project.payment_schedule_status != "active":
            project.payment_schedule_status = "active"

        await db.commit()

        # Refresh milestones to get updated state
        for milestone in triggered_milestones:
            await db.refresh(milestone)

    return triggered_milestones
