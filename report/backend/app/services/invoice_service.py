"""
Invoice Service

Handles automated invoice generation when milestones are completed.
Requirements: 9.1, 9.2, 9.3, 9.8
"""

import secrets
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.logging_config import get_logger
from app.models.client import Client
from app.models.deliverable import Deliverable
from app.models.invoice import Invoice
from app.models.milestone import Milestone
from app.models.project import Project
from app.models.subscription import Subscription

logger = get_logger(__name__)


def generate_invoice_number(db: Session) -> str:
    """Generate unique invoice number"""
    while True:
        # Format: INV-YYYYMMDD-XXXX (e.g., INV-20241022-A3F9)
        date_part = datetime.now(timezone.utc).strftime("%Y%m%d")
        random_part = secrets.token_hex(2).upper()
        invoice_number = f"INV-{date_part}-{random_part}"

        # Check if it already exists
        existing = db.query(Invoice).filter(Invoice.invoice_number == invoice_number).first()
        if not existing:
            return invoice_number


def calculate_platform_fee(db: Session, user_id: UUID, client: Client, subtotal: Decimal) -> Decimal:
    """
    Calculate platform fee based on subscription status.

    Requirements:
    - 19.3: Apply 1.5% Paystack fee for free users
    - 19.4: Waive fee for paid subscribers
    """
    platform_fee = Decimal("0.00")

    # Only apply fee for Paystack payments
    if client.payment_method == "paystack":
        # Check user subscription
        subscription = db.query(Subscription).filter(Subscription.user_id == user_id, Subscription.status == "active").first()

        # Apply 1.5% fee for free users
        if not subscription or subscription.plan == "free":
            platform_fee = subtotal * Decimal("0.015")  # 1.5%

    return platform_fee


def auto_generate_invoice_for_milestone(db: Session, milestone_id: UUID, user_id: UUID) -> Optional[Invoice]:
    """
    Automatically generate invoice when a milestone is completed.

    This function:
    1. Detects milestone completion (all deliverables ready to bill)
    2. Auto-populates invoice with verified deliverables
    3. Auto-includes approved and completed change requests (when implemented)
    4. Calculates platform fee based on subscription status
    5. Calculates total amount with fees
    6. Creates invoice in 'draft' status for developer review

    Requirements: 9.1, 9.2, 9.3, 9.8
    """
    # Get milestone
    milestone = db.query(Milestone).filter(Milestone.id == milestone_id).first()

    if not milestone:
        return None

    # Verify milestone is completed
    if milestone.status != "completed":
        return None

    # Get project
    project = db.query(Project).filter(Project.id == milestone.project_id).first()

    if not project:
        return None

    # Get client
    client = db.query(Client).filter(Client.id == project.client_id).first()

    if not client:
        return None

    # Requirement 9.2: Auto-populate invoice with verified deliverables
    deliverables = (
        db.query(Deliverable)
        .filter(
            Deliverable.milestone_id == milestone_id,
            Deliverable.status.in_(["verified", "ready_to_bill"]),
        )
        .all()
    )

    if not deliverables:
        return None

    # Calculate subtotal from deliverables
    subtotal = Decimal("0.00")
    for deliverable in deliverables:
        subtotal += deliverable.total_cost or Decimal("0.00")

    # TODO: Requirement 9.3: Auto-include approved and completed change requests
    # This will be implemented when change request system is added (task 16)
    # change_requests = db.query(ChangeRequest).filter(
    #     ChangeRequest.milestone_id == milestone_id,
    #     ChangeRequest.status == "completed",
    #     ChangeRequest.is_billed == False
    # ).all()
    # for cr in change_requests:
    #     subtotal += cr.total_cost

    # Requirement 9.8: Calculate platform fee based on subscription status
    platform_fee = calculate_platform_fee(db, user_id, client, subtotal)

    # Calculate total
    tax_amount = Decimal("0.00")  # TODO: Implement tax calculation if needed
    total_amount = subtotal + platform_fee + tax_amount

    # Generate unique invoice number
    invoice_number = generate_invoice_number(db)

    # Set due date (default 30 days from now)
    due_date = datetime.now(timezone.utc) + timedelta(days=30)

    # Requirement 9.8: Create invoice in 'draft' status for developer review
    invoice = Invoice(
        project_id=project.id,
        client_id=client.id,
        user_id=user_id,
        invoice_number=invoice_number,
        status="draft",
        subtotal=subtotal,
        platform_fee=platform_fee,
        tax_amount=tax_amount,
        total_amount=total_amount,
        payment_method=client.payment_method,
        payment_gateway_name=client.payment_gateway_name,
        due_date=due_date,
        notes=f"Auto-generated invoice for milestone: {milestone.name}",
    )

    db.add(invoice)
    db.commit()
    db.refresh(invoice)

    # Mark deliverables as billed
    for deliverable in deliverables:
        deliverable.status = "billed"

    # Mark milestone as billed
    milestone.status = "billed"

    db.commit()

    logger.info(
        "Auto-generated invoice %s for milestone %s",
        invoice.invoice_number,
        milestone.name,
    )

    return invoice


def get_ready_to_bill_deliverables(db: Session, project_id: UUID) -> List[Deliverable]:
    """
    Get all deliverables that are ready to bill for a project.

    Requirements: 9.1
    """
    deliverables = (
        db.query(Deliverable)
        .filter(
            Deliverable.project_id == project_id,
            Deliverable.status.in_(["verified", "ready_to_bill"]),
        )
        .all()
    )

    return deliverables


def check_and_generate_milestone_invoice(db: Session, milestone_id: UUID, user_id: UUID) -> Optional[Invoice]:
    """
    Check if milestone is complete and generate invoice if needed.

    This is called when:
    - A deliverable is marked as ready_to_bill
    - A deliverable status changes
    - Milestone status is updated

    Requirements: 9.1
    """
    milestone = db.query(Milestone).filter(Milestone.id == milestone_id).first()

    if not milestone:
        return None

    # Check if all deliverables are ready to bill
    total_deliverables = db.query(Deliverable).filter(Deliverable.milestone_id == milestone_id).count()

    ready_to_bill_count = (
        db.query(Deliverable)
        .filter(
            Deliverable.milestone_id == milestone_id,
            Deliverable.status.in_(["verified", "ready_to_bill"]),
        )
        .count()
    )

    # If all deliverables are ready to bill, generate invoice
    if total_deliverables > 0 and ready_to_bill_count == total_deliverables:
        # Check if invoice already exists for this milestone
        existing_invoice = db.query(Invoice).filter(Invoice.notes.like(f"%milestone: {milestone.name}%")).first()

        if existing_invoice:
            logger.info("Invoice already exists for milestone %s", milestone.name)
            return existing_invoice

        # Generate invoice
        return auto_generate_invoice_for_milestone(db, milestone_id, user_id)

    return None
