from decimal import Decimal
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.logging_config import get_logger
from app.db.database import get_db
from app.models.paystack_subaccount import PaystackSubaccount
from app.models.user import User as UserModel
from app.schemas.paystack import (
    PaymentInitializeRequest,
    PaymentInitializeResponse,
    PaystackBankResponse,
    PaystackWebhookEvent,
    SubaccountCreate,
    SubaccountResponse,
    SubaccountUpdate,
)
from app.utils.paystack_client import paystack_client

logger = get_logger(__name__)
router = APIRouter()


@router.get("/paystack/banks", response_model=List[PaystackBankResponse])
async def list_kenyan_banks(current_user: UserModel = Depends(get_current_user)):
    """
    List all supported banks in Kenya

    This endpoint fetches the list of banks from Paystack API.
    Users need this list to select their settlement bank when creating a subaccount.
    """
    try:
        banks = await paystack_client.list_banks(country="kenya")
        return banks
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch banks: {str(e)}",
        )


@router.post(
    "/paystack/subaccounts",
    response_model=SubaccountResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_subaccount(
    subaccount_data: SubaccountCreate,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Create a Paystack subaccount for the current user

    This allows developers to receive payments directly to their bank account.
    The platform will charge a percentage fee (1.5% for free users, 0% for subscribers).

    Requirements: 17.1, 17.2, 17.3, 19.3, 19.4
    """
    # Check if user already has a subaccount
    stmt = select(PaystackSubaccount).where(PaystackSubaccount.user_id == current_user.id)
    result = db.execute(stmt)
    existing_subaccount = result.scalar_one_or_none()

    if existing_subaccount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User already has a Paystack subaccount. Use PUT to update it.",
        )

    try:
        # Get platform fee based on subscription
        from app.utils.subscription_utils import get_paystack_platform_fee

        platform_fee = get_paystack_platform_fee(db, current_user.id)

        # Validate bank account with Paystack
        account_details = await paystack_client.resolve_account_number(
            account_number=subaccount_data.account_number,
            bank_code=subaccount_data.settlement_bank,
        )

        # Create subaccount on Paystack with subscription-based fee
        paystack_response = await paystack_client.create_subaccount(
            business_name=subaccount_data.business_name,
            settlement_bank=subaccount_data.settlement_bank,
            account_number=subaccount_data.account_number,
            percentage_charge=platform_fee,
        )

        # Store subaccount in database with subscription-based fee
        db_subaccount = PaystackSubaccount(
            user_id=current_user.id,
            subaccount_code=paystack_response["subaccount_code"],
            business_name=subaccount_data.business_name,
            settlement_bank=subaccount_data.settlement_bank,
            account_number=subaccount_data.account_number,
            percentage_charge=Decimal(str(platform_fee)),
            is_active=True,
        )

        db.add(db_subaccount)
        db.commit()
        db.refresh(db_subaccount)

        return SubaccountResponse(
            id=db_subaccount.id,
            user_id=db_subaccount.user_id,
            subaccount_code=db_subaccount.subaccount_code,
            business_name=db_subaccount.business_name,
            settlement_bank=db_subaccount.settlement_bank,
            account_number=db_subaccount.account_number,
            percentage_charge=db_subaccount.percentage_charge,
            is_active=db_subaccount.is_active,
            created_at=db_subaccount.created_at,
            updated_at=db_subaccount.updated_at,
        )

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to create subaccount: {str(e)}",
        )


@router.get("/paystack/subaccounts", response_model=SubaccountResponse)
async def get_user_subaccount(current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Get the current user's Paystack subaccount

    Returns the subaccount details if it exists.

    Requirements: 17.1, 17.2
    """
    stmt = select(PaystackSubaccount).where(PaystackSubaccount.user_id == current_user.id)
    result = db.execute(stmt)
    subaccount = result.scalar_one_or_none()

    if not subaccount:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No Paystack subaccount found for this user",
        )

    return SubaccountResponse(
        id=subaccount.id,
        user_id=subaccount.user_id,
        subaccount_code=subaccount.subaccount_code,
        business_name=subaccount.business_name,
        settlement_bank=subaccount.settlement_bank,
        account_number=subaccount.account_number,
        percentage_charge=subaccount.percentage_charge,
        is_active=subaccount.is_active,
        created_at=subaccount.created_at,
        updated_at=subaccount.updated_at,
    )


@router.put("/paystack/subaccounts", response_model=SubaccountResponse)
async def update_subaccount(
    subaccount_update: SubaccountUpdate,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Update the current user's Paystack subaccount

    Allows updating business name, bank details, and percentage charge.

    Requirements: 17.3
    """
    # Get existing subaccount
    stmt = select(PaystackSubaccount).where(PaystackSubaccount.user_id == current_user.id)
    result = db.execute(stmt)
    subaccount = result.scalar_one_or_none()

    if not subaccount:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No Paystack subaccount found for this user",
        )

    try:
        # Prepare update data for Paystack
        update_data = subaccount_update.model_dump(exclude_unset=True)

        # If bank details are being updated, validate them first
        if "account_number" in update_data and "settlement_bank" in update_data:
            await paystack_client.resolve_account_number(
                account_number=update_data["account_number"],
                bank_code=update_data["settlement_bank"],
            )
        elif "account_number" in update_data:
            # Use existing bank code
            await paystack_client.resolve_account_number(
                account_number=update_data["account_number"],
                bank_code=subaccount.settlement_bank,
            )
        elif "settlement_bank" in update_data:
            # Use existing account number
            await paystack_client.resolve_account_number(
                account_number=subaccount.account_number,
                bank_code=update_data["settlement_bank"],
            )

        # Update subaccount on Paystack
        paystack_update_data = {}
        if "business_name" in update_data:
            paystack_update_data["business_name"] = update_data["business_name"]
        if "settlement_bank" in update_data:
            paystack_update_data["settlement_bank"] = update_data["settlement_bank"]
        if "account_number" in update_data:
            paystack_update_data["account_number"] = update_data["account_number"]
        if "percentage_charge" in update_data:
            paystack_update_data["percentage_charge"] = float(update_data["percentage_charge"])
        if "is_active" in update_data:
            paystack_update_data["active"] = update_data["is_active"]

        if paystack_update_data:
            await paystack_client.update_subaccount(subaccount_code=subaccount.subaccount_code, **paystack_update_data)

        # Update local database
        for field, value in update_data.items():
            setattr(subaccount, field, value)

        db.commit()
        db.refresh(subaccount)

        return SubaccountResponse(
            id=subaccount.id,
            user_id=subaccount.user_id,
            subaccount_code=subaccount.subaccount_code,
            business_name=subaccount.business_name,
            settlement_bank=subaccount.settlement_bank,
            account_number=subaccount.account_number,
            percentage_charge=subaccount.percentage_charge,
            is_active=subaccount.is_active,
            created_at=subaccount.created_at,
            updated_at=subaccount.updated_at,
        )

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to update subaccount: {str(e)}",
        )


@router.post("/payments/paystack/initialize", response_model=PaymentInitializeResponse)
async def initialize_payment(
    payment_request: PaymentInitializeRequest,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Initialize a Paystack payment for an invoice

    This creates a payment link with split payment configuration.
    Free users pay 1.5% platform fee, subscribers pay 0%.

    Requirements: 17.4, 17.5
    """
    import uuid

    from app.models.client import Client
    from app.models.invoice import Invoice
    from app.models.project import Project
    from app.models.user import User

    # Get invoice
    stmt = select(Invoice).where(Invoice.id == payment_request.invoice_id, Invoice.user_id == current_user.id)
    result = db.execute(stmt)
    invoice = result.scalar_one_or_none()

    if not invoice:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")

    if invoice.status == "paid":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invoice is already paid")

    # Get client
    stmt = select(Client).where(Client.id == invoice.client_id)
    result = db.execute(stmt)
    client = result.scalar_one_or_none()

    if not client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")

    # Get user's subaccount
    stmt = select(PaystackSubaccount).where(PaystackSubaccount.user_id == current_user.id)
    result = db.execute(stmt)
    subaccount = result.scalar_one_or_none()

    if not subaccount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No Paystack subaccount configured. Please set up your subaccount first.",
        )

    # Check subscription status to determine platform fee
    # Requirement 17.4, 17.5: Apply 1.5% fee for free users, waive for subscribers
    from app.utils.subscription_utils import get_paystack_platform_fee

    platform_fee_percentage = get_paystack_platform_fee(db, current_user.id)

    # Calculate amounts in kobo (Paystack uses smallest currency unit)
    # Assuming invoice amounts are in KES
    total_amount_kobo = int(float(invoice.total_amount) * 100)

    # Calculate platform fee
    platform_fee_kobo = int(total_amount_kobo * (platform_fee_percentage / 100))

    # Generate unique reference
    reference = f"INV-{invoice.invoice_number}-{uuid.uuid4().hex[:8]}"

    try:
        # Initialize transaction with split payment
        payment_data = await paystack_client.initialize_transaction(
            email=client.email,
            amount=total_amount_kobo,
            reference=reference,
            callback_url=payment_request.callback_url,
            subaccount=subaccount.subaccount_code,
            transaction_charge=platform_fee_kobo,
            bearer="account",  # Subaccount bears Paystack charges
        )

        # Update invoice with payment reference
        invoice.payment_reference = reference
        invoice.payment_method = "paystack"
        invoice.status = "sent"
        db.commit()

        return PaymentInitializeResponse(
            authorization_url=payment_data["authorization_url"],
            access_code=payment_data["access_code"],
            reference=reference,
        )

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to initialize payment: {str(e)}",
        )


@router.post("/payments/webhooks/paystack")
async def paystack_webhook(request: Request, db: Session = Depends(get_db)):
    """
    Handle Paystack webhook events

    This endpoint receives payment notifications from Paystack.
    It verifies the webhook signature and processes successful payments.

    Requirements: 17.6, 17.7, 17.8
    """
    from datetime import datetime

    from app.models.invoice import Invoice
    from app.models.project import Project
    from app.utils.nats_client import publish_message

    # Get raw body for signature verification
    body = await request.body()
    signature = request.headers.get("x-paystack-signature", "")

    # Verify webhook signature
    if not paystack_client.verify_webhook_signature(body, signature):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid webhook signature")

    # Parse webhook data
    import json

    webhook_data = json.loads(body.decode("utf-8"))

    event = webhook_data.get("event")
    data = webhook_data.get("data", {})

    # Handle charge.success event
    if event == "charge.success":
        reference = data.get("reference")
        status_paystack = data.get("status")

        if status_paystack != "success":
            return {"message": "Payment not successful"}

        # Find invoice by reference
        stmt = select(Invoice).where(Invoice.payment_reference == reference)
        result = db.execute(stmt)
        invoice = result.scalar_one_or_none()

        if not invoice:
            logger.warning("No invoice found for reference %s", reference)
            return {"message": "Invoice not found"}

        if invoice.status == "paid":
            # Already processed
            return {"message": "Invoice already paid"}

        try:
            # Update invoice status
            invoice.status = "paid"
            invoice.payment_transaction_id = data.get("id")
            invoice.payment_received_at = datetime.utcnow()

            # Get project to update budget
            stmt = select(Project).where(Project.id == invoice.project_id)
            result = db.execute(stmt)
            project = result.scalar_one_or_none()

            if project:
                # Add invoice amount to project budget
                project.current_budget_remaining += invoice.total_amount
                project.total_revenue += invoice.total_amount

            db.commit()

            # Publish payment received event
            await publish_message(
                "payment.received",
                json.dumps(
                    {
                        "invoice_id": invoice.id,
                        "project_id": invoice.project_id,
                        "amount": float(invoice.total_amount),
                        "reference": reference,
                    }
                ),
            )

            # Send payment confirmation emails automatically
            from app.models.client import Client
            from app.models.user import User
            from app.utils.email import send_email

            # Get client and developer details
            stmt = select(Client).where(Client.id == invoice.client_id)
            result = db.execute(stmt)
            client = result.scalar_one_or_none()

            stmt = select(User).where(User.id == invoice.user_id)
            result = db.execute(stmt)
            developer = result.scalar_one_or_none()

            if client and developer:
                # Send email to client
                await send_email(
                    to_email=client.email,
                    subject=f"Payment Received - Invoice {invoice.invoice_number}",
                    html_content=f"""
                    <h2>Payment Received</h2>
                    <p>Thank you for your payment!</p>
                    <p><strong>Invoice Number:</strong> {invoice.invoice_number}</p>
                    <p><strong>Amount:</strong> KES {invoice.total_amount}</p>
                    <p><strong>Reference:</strong> {reference}</p>
                    """,
                )

                # Send email to developer
                await send_email(
                    to_email=developer.email,
                    subject=f"Payment Received - Invoice {invoice.invoice_number}",
                    html_content=f"""
                    <h2>Payment Received</h2>
                    <p>You have received a payment!</p>
                    <p><strong>Invoice Number:</strong> {invoice.invoice_number}</p>
                    <p><strong>Amount:</strong> KES {invoice.total_amount}</p>
                    <p><strong>Reference:</strong> {reference}</p>
                    <p>The funds have been added to your project budget.</p>
                    """,
                )

            return {"message": "Payment processed successfully"}

        except Exception as e:
            db.rollback()
            logger.error("Error processing payment webhook: %s", e)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to process payment: {str(e)}",
            )

    return {"message": "Event received"}
