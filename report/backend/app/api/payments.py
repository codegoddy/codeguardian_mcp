import secrets
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.config import settings
from app.core.logging_config import get_logger
from app.db.database import get_db
from app.models.client import Client
from app.models.deliverable import Deliverable
from app.models.invoice import Invoice
from app.models.project import Project
from app.models.subscription import Subscription
from app.models.user import User
from app.schemas.payment import InvoiceCreate, InvoiceMarkPaid, InvoiceResponse, InvoiceSend, InvoiceVerifyPayment
from app.services.activity_service import create_activity
from app.services.notification_service import create_notification
from app.utils.email import send_invoice_email, send_payment_confirmed, send_payment_verification_request
from app.utils.pdf_generator import generate_invoice_pdf

logger = get_logger(__name__)
router = APIRouter()


@router.post("/invoices/{invoice_id}/client-mark-paid", response_model=InvoiceResponse)
async def client_mark_invoice_paid(invoice_id: UUID, db: AsyncSession = Depends(get_db)):
    """
    Client marks manual payment as paid (Requirement 18.4).
    This triggers a verification request email to the developer.
    """
    # Note: In a real implementation, this would use client portal authentication
    # For now, we'll allow any authenticated user to mark invoices as paid
    # TODO: Implement client portal authentication when task 17 is completed

    result = await db.execute(select(Invoice).where(Invoice.id == invoice_id))
    invoice = result.scalar_one_or_none()

    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Verify this is a manual payment invoice
    if invoice.payment_method != "manual":
        raise HTTPException(status_code=400, detail="This endpoint is only for manual payment invoices")

    # Check if already marked as paid
    if invoice.client_marked_paid:
        raise HTTPException(status_code=400, detail="Invoice has already been marked as paid by client")

    # Mark invoice as paid by client
    invoice.client_marked_paid = True
    invoice.client_marked_paid_at = datetime.now(timezone.utc)
    invoice.status = "awaiting_verification"

    await db.commit()
    await db.refresh(invoice)

    # Get related data for email
    project_result = await db.execute(select(Project).where(Project.id == invoice.project_id))
    project = project_result.scalar_one_or_none()

    client_result = await db.execute(select(Client).where(Client.id == invoice.client_id))
    client = client_result.scalar_one_or_none()

    developer_result = await db.execute(select(User).where(User.id == invoice.user_id))
    developer = developer_result.scalar_one_or_none()

    if not project or not client or not developer:
        raise HTTPException(status_code=500, detail="Failed to retrieve related data")

    # Requirement 18.5: Send verification request email to developer
    verification_url = f"{settings.frontend_url}/invoices/{invoice.id}"

    try:
        await send_payment_verification_request(
            to_email=developer.email,
            developer_name=developer.full_name or developer.email,
            client_name=client.name,
            invoice_number=invoice.invoice_number,
            project_name=project.name,
            payment_gateway_name=client.payment_gateway_name or "Manual Payment",
            currency="USD",  # TODO: Get from user settings when implemented
            total_amount=str(invoice.total_amount),
            verification_url=verification_url,
        )
    except Exception as e:
        logger.error("Failed to send verification request email: %s", e, exc_info=True)
        # Don't fail the request if email fails

    # Create notification for developer to verify payment
    try:
        await create_notification(
            db=db,
            user_id=invoice.user_id,
            notification_type="alert",
            title="Payment awaiting verification",
            message=f"{client.name} marked Invoice {invoice.invoice_number} as paid. Please verify.",
            action_url=f"/invoices",
            entity_type="invoice",
            entity_id=invoice.id,
        )
    except Exception as e:
        logger.warning("Failed to create payment verification notification: %s", e)

    return invoice


@router.post("/invoices/{invoice_id}/developer-verify", response_model=InvoiceResponse)
async def developer_verify_payment(
    invoice_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Developer verifies manual payment receipt (Requirement 18.6, 18.7).
    This updates the project budget and sends confirmation emails.
    """

    result = await db.execute(select(Invoice).where(Invoice.id == invoice_id, Invoice.user_id == current_user.id))
    invoice = result.scalar_one_or_none()

    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Verify this is a manual payment invoice
    if invoice.payment_method != "manual":
        raise HTTPException(status_code=400, detail="This endpoint is only for manual payment invoices")

    # Check if client has marked as paid
    if not invoice.client_marked_paid:
        raise HTTPException(
            status_code=400,
            detail="Client must mark invoice as paid before developer can verify",
        )

    # Check if already verified
    if invoice.developer_verified:
        raise HTTPException(status_code=400, detail="Invoice has already been verified")

    # Mark invoice as verified by developer
    invoice.developer_verified = True
    invoice.developer_verified_at = datetime.now(timezone.utc)
    invoice.status = "paid"
    invoice.payment_received_at = datetime.now(timezone.utc)

    # Requirement 18.8: Update project budget only after developer verification
    project_result = await db.execute(select(Project).where(Project.id == invoice.project_id))
    project = project_result.scalar_one_or_none()
    if project:
        project.current_budget_remaining += invoice.total_amount
        project.total_revenue += invoice.total_amount

    await db.commit()
    await db.refresh(invoice)

    # Get related data for emails
    client_result = await db.execute(select(Client).where(Client.id == invoice.client_id))
    client = client_result.scalar_one_or_none()

    developer_result = await db.execute(select(User).where(User.id == invoice.user_id))
    developer = developer_result.scalar_one_or_none()

    if not project or not client or not developer:
        raise HTTPException(status_code=500, detail="Failed to retrieve related data")

    verified_date = invoice.developer_verified_at.strftime("%B %d, %Y at %I:%M %p")
    project_url = f"{settings.frontend_url}/projects/{project.id}"

    # Requirement 18.7: Send payment confirmation emails after verification
    try:
        # Send confirmation to developer
        await send_payment_confirmed(
            to_email=developer.email,
            recipient_name=developer.full_name or developer.email,
            invoice_number=invoice.invoice_number,
            project_name=project.name,
            payment_gateway_name=client.payment_gateway_name or "Manual Payment",
            currency="USD",  # TODO: Get from user settings when implemented
            total_amount=str(invoice.total_amount),
            verified_date=verified_date,
            is_client=False,
            project_url=project_url,
        )

        # Send confirmation to client
        await send_payment_confirmed(
            to_email=client.email,
            recipient_name=client.name,
            invoice_number=invoice.invoice_number,
            project_name=project.name,
            payment_gateway_name=client.payment_gateway_name or "Manual Payment",
            currency="USD",  # TODO: Get from user settings when implemented
            total_amount=str(invoice.total_amount),
            verified_date=verified_date,
            is_client=True,
            project_url="",  # Clients don't have access to developer dashboard
        )
    except Exception as e:
        logger.error("Failed to send confirmation emails: %s", e, exc_info=True)
        # Don't fail the request if email fails

    # Log activity for payment verification
    try:
        await create_activity(
            db=db,
            user_id=current_user.id,
            entity_type="invoice",
            entity_id=invoice.id,
            action="verified",
            title=f"Payment verified: {invoice.invoice_number}",
            description=f"Payment of {invoice.total_amount:,.2f} confirmed for {project.name}",
        )
    except Exception as e:
        logger.warning("Failed to log payment verification activity: %s", e)

    return invoice


@router.get("/invoices", response_model=List[InvoiceResponse])
async def get_invoices(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get all invoices for authenticated user"""

    result = await db.execute(select(Invoice).where(Invoice.user_id == current_user.id).order_by(Invoice.created_at.desc()))
    invoices = result.scalars().all()

    return invoices


@router.get("/invoices/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(
    invoice_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get invoice details"""

    result = await db.execute(select(Invoice).where(Invoice.id == invoice_id, Invoice.user_id == current_user.id))
    invoice = result.scalar_one_or_none()

    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    return invoice


async def generate_invoice_number(db: AsyncSession) -> str:
    """Generate unique invoice number"""
    while True:
        # Format: INV-YYYYMMDD-XXXX (e.g., INV-20241022-A3F9)
        date_part = datetime.now(timezone.utc).strftime("%Y%m%d")
        random_part = secrets.token_hex(2).upper()
        invoice_number = f"INV-{date_part}-{random_part}"

        # Check if it already exists
        result = await db.execute(select(Invoice).where(Invoice.invoice_number == invoice_number))
        existing = result.scalar_one_or_none()
        if not existing:
            return invoice_number


@router.post("/invoices", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
async def create_invoice(
    invoice_data: InvoiceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generate invoice for a project (Requirement 9.1, 9.4).
    Can optionally include specific deliverables and change requests.
    """
    user_id = current_user.id

    # Verify project exists and belongs to user
    project_result = await db.execute(select(Project).where(Project.id == invoice_data.project_id, Project.user_id == user_id))
    project = project_result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get client
    client_result = await db.execute(select(Client).where(Client.id == project.client_id))
    client = client_result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    # Calculate invoice amounts
    subtotal = Decimal("0.00")

    # Include deliverables if specified, otherwise include all ready-to-bill deliverables
    if invoice_data.deliverable_ids:
        deliverables_result = await db.execute(
            select(Deliverable).where(
                Deliverable.id.in_(invoice_data.deliverable_ids),
                Deliverable.project_id == project.id,
            )
        )
        deliverables = deliverables_result.scalars().all()
    else:
        # Auto-include all verified deliverables that are ready to bill
        deliverables_result = await db.execute(
            select(Deliverable).where(
                Deliverable.project_id == project.id,
                Deliverable.status.in_(["verified", "ready_to_bill"]),
            )
        )
        deliverables = deliverables_result.scalars().all()

    # Calculate subtotal from deliverables
    for deliverable in deliverables:
        subtotal += deliverable.total_cost or Decimal("0.00")

    # TODO: Include change requests when change request system is implemented (task 16)
    # if invoice_data.change_request_ids:
    #     change_requests = db.query(ChangeRequest).filter(...)
    #     for cr in change_requests:
    #         subtotal += cr.total_cost

    # Calculate platform fee based on subscription status
    platform_fee = Decimal("0.00")

    # Check if payment method is Paystack
    if client.payment_method == "paystack":
        # Check user subscription
        subscription_result = await db.execute(
            select(Subscription).where(Subscription.user_id == user_id, Subscription.status == "active")
        )
        subscription = subscription_result.scalar_one_or_none()

        # Apply 1.5% fee for free users (Requirement 19.3)
        if not subscription or subscription.plan == "free":
            platform_fee = subtotal * Decimal("0.015")  # 1.5%

    # Calculate total
    tax_amount = Decimal("0.00")  # TODO: Implement tax calculation if needed
    total_amount = subtotal + platform_fee + tax_amount

    # Generate unique invoice number
    invoice_number = await generate_invoice_number(db)

    # Set due date (default 30 days from now if not specified)
    due_date = invoice_data.due_date or datetime.now(timezone.utc) + timedelta(days=30)

    # Create invoice
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
        notes=invoice_data.notes,
    )

    db.add(invoice)
    await db.commit()
    await db.refresh(invoice)

    # Mark deliverables as billed
    for deliverable in deliverables:
        deliverable.status = "billed"

    await db.commit()

    # Log activity for invoice creation
    try:
        await create_activity(
            db=db,
            user_id=current_user.id,
            entity_type="invoice",
            entity_id=invoice.id,
            action="created",
            title=f"Created invoice: {invoice.invoice_number}",
            description=f"Invoice for {project.name} - Total: {total_amount:,.2f}",
        )
    except Exception as e:
        logger.warning("Failed to log invoice creation activity: %s", e)

    return invoice


@router.post("/invoices/{invoice_id}/send", response_model=InvoiceResponse)
async def send_invoice(
    invoice_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Send invoice to client (Requirement 9.5).
    Updates status to 'sent' and sends email notification.
    """

    result = await db.execute(select(Invoice).where(Invoice.id == invoice_id, Invoice.user_id == current_user.id))
    invoice = result.scalar_one_or_none()

    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Check if invoice is in draft status
    if invoice.status != "draft":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot send invoice with status '{invoice.status}'. Only draft invoices can be sent.",
        )

    # Get related data
    project_result = await db.execute(select(Project).where(Project.id == invoice.project_id))
    project = project_result.scalar_one_or_none()

    client_result = await db.execute(select(Client).where(Client.id == invoice.client_id))
    client = client_result.scalar_one_or_none()

    developer_result = await db.execute(select(User).where(User.id == invoice.user_id))
    developer = developer_result.scalar_one_or_none()

    if not project or not client or not developer:
        raise HTTPException(status_code=500, detail="Failed to retrieve related data")

    # Get user settings for currency
    from app.models.user import UserSettings

    settings_result = await db.execute(select(UserSettings).where(UserSettings.user_id == current_user.id))
    user_settings = settings_result.scalar_one_or_none()

    # Currency mapping
    currency_symbols = {
        "USD": "$",
        "EUR": "€",
        "GBP": "£",
        "KES": "KSh",
        "NGN": "₦",
        "ZAR": "R",
        "GHS": "GH₵",
        "UGX": "USh",
        "TZS": "TSh",
        "RWF": "FRw",
    }
    user_currency = user_settings.default_currency if user_settings else "USD"
    currency_symbol = currency_symbols.get(user_currency, user_currency)

    # Generate PDF before sending (Requirement 20.1, 20.2, 20.4)
    pdf_url = None
    try:
        pdf_url = await generate_invoice_pdf(db, invoice, currency=user_currency)  # Use user's currency
        logger.info("Generated PDF for invoice %s: %s", invoice.invoice_number, pdf_url)
    except Exception as e:
        logger.warning("Error generating PDF: %s", e)
        # Continue even if PDF generation fails

    # Update invoice status
    invoice.status = "sent"
    invoice.sent_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(invoice)

    # Create a magic session token for the client to access the portal directly
    from app.models.client_portal_session import ClientPortalSession

    magic_token = ClientPortalSession.generate_magic_token()
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)  # 7 day access for invoice

    portal_session = ClientPortalSession(
        client_id=client.id,
        magic_token=magic_token,
        ip_address="invoice_email",
        user_agent="invoice_email_link",
        expires_at=expires_at,
    )
    db.add(portal_session)
    await db.commit()

    # Use the magic token in the client portal URL - goes to dashboard
    invoice_url = f"{settings.frontend_url}/client-portal/{magic_token}"

    try:
        await send_invoice_email(
            to_email=client.email,
            client_name=client.name,
            developer_name=developer.full_name or developer.email,
            invoice_number=invoice.invoice_number,
            invoice_date=invoice.created_at.strftime("%B %d, %Y"),
            due_date=(invoice.due_date.strftime("%B %d, %Y") if invoice.due_date else "Upon Receipt"),
            project_name=project.name,
            currency=currency_symbol,  # Use user's currency symbol
            total_amount=f"{invoice.total_amount:,.2f}",
            payment_method=(invoice.payment_method.title() if invoice.payment_method else "Not Specified"),
            payment_gateway_name=client.payment_gateway_name,
            payment_instructions=(client.payment_instructions if invoice.payment_method == "manual" else None),
            invoice_url=invoice_url,
            pdf_url=pdf_url,
            notes=invoice.notes,
        )
        logger.info("Invoice email sent to %s", client.email)
    except Exception as e:
        logger.error("Error sending invoice email: %s", e, exc_info=True)
        # Don't fail the request if email fails

    # Log activity for invoice sent
    try:
        await create_activity(
            db=db,
            user_id=current_user.id,
            entity_type="invoice",
            entity_id=invoice.id,
            action="sent",
            title=f"Sent invoice: {invoice.invoice_number}",
            description=f"Invoice sent to {client.name} for {project.name}",
        )
    except Exception as e:
        logger.warning("Failed to log invoice sent activity: %s", e)

    return invoice


@router.post("/invoices/{invoice_id}/resend", response_model=InvoiceResponse)
async def resend_invoice(
    invoice_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Resend invoice email to client.
    Works for invoices that have already been sent.
    """

    result = await db.execute(select(Invoice).where(Invoice.id == invoice_id, Invoice.user_id == current_user.id))
    invoice = result.scalar_one_or_none()

    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Only allow resending for sent or awaiting_verification invoices
    if invoice.status not in ["sent", "awaiting_verification"]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot resend invoice with status '{invoice.status}'. Only sent invoices can be resent.",
        )

    # Get related data
    project_result = await db.execute(select(Project).where(Project.id == invoice.project_id))
    project = project_result.scalar_one_or_none()

    client_result = await db.execute(select(Client).where(Client.id == invoice.client_id))
    client = client_result.scalar_one_or_none()

    developer_result = await db.execute(select(User).where(User.id == invoice.user_id))
    developer = developer_result.scalar_one_or_none()

    if not project or not client or not developer:
        raise HTTPException(status_code=500, detail="Failed to retrieve related data")

    # Get user settings for currency
    from app.models.user import UserSettings

    settings_result = await db.execute(select(UserSettings).where(UserSettings.user_id == current_user.id))
    user_settings = settings_result.scalar_one_or_none()

    # Currency mapping
    currency_symbols = {
        "USD": "$",
        "EUR": "€",
        "GBP": "£",
        "KES": "KSh",
        "NGN": "₦",
        "ZAR": "R",
        "GHS": "GH₵",
        "UGX": "USh",
        "TZS": "TSh",
        "RWF": "FRw",
    }
    user_currency = user_settings.default_currency if user_settings else "USD"
    currency_symbol = currency_symbols.get(user_currency, user_currency)

    # Create a magic session token for the client to access the portal directly
    from app.models.client_portal_session import ClientPortalSession

    magic_token = ClientPortalSession.generate_magic_token()
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)  # 7 day access for invoice

    portal_session = ClientPortalSession(
        client_id=client.id,
        magic_token=magic_token,
        ip_address="invoice_resend_email",
        user_agent="invoice_resend_link",
        expires_at=expires_at,
    )
    db.add(portal_session)
    await db.commit()

    # Use the magic token in the client portal URL - goes to dashboard
    invoice_url = f"{settings.frontend_url}/client-portal/{magic_token}"

    try:
        await send_invoice_email(
            to_email=client.email,
            client_name=client.name,
            developer_name=developer.full_name or developer.email,
            invoice_number=invoice.invoice_number,
            invoice_date=invoice.created_at.strftime("%B %d, %Y"),
            due_date=(invoice.due_date.strftime("%B %d, %Y") if invoice.due_date else "Upon Receipt"),
            project_name=project.name,
            currency=currency_symbol,
            total_amount=f"{invoice.total_amount:,.2f}",
            payment_method=(invoice.payment_method.title() if invoice.payment_method else "Not Specified"),
            payment_gateway_name=client.payment_gateway_name,
            payment_instructions=(client.payment_instructions if invoice.payment_method == "manual" else None),
            invoice_url=invoice_url,
            pdf_url=invoice.invoice_pdf_url,  # Use existing PDF URL
            notes=invoice.notes,
        )
        logger.info("Invoice resent to %s", client.email)
    except Exception as e:
        logger.error("Error resending invoice email: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to resend invoice email")

    return invoice
