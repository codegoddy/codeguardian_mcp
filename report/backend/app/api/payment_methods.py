"""
Payment Methods API
Handles user payment method configuration (Paystack and Manual payments)
"""

import json
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.logging_config import get_logger
from app.db.database import get_db
from app.models.client import Client
from app.models.payment_method import PaymentMethod
from app.models.user import User
from app.services.activity_service import create_activity
from app.utils.redis_client import RedisCache

logger = get_logger(__name__)
router = APIRouter()


# Schemas
class PaystackMethodCreate(BaseModel):
    business_name: str
    settlement_bank: str
    account_number: str


class ManualMethodCreate(BaseModel):
    payment_method: str  # 'bank_transfer', 'mobile_money', 'paypal', etc.
    payment_gateway_name: str
    payment_instructions: str
    # Bank Transfer fields
    bank_name: Optional[str] = None
    account_name: Optional[str] = None
    account_number: Optional[str] = None
    swift_code: Optional[str] = None
    branch_code: Optional[str] = None
    # Mobile Money fields
    mobile_money_provider: Optional[str] = None
    mobile_money_number: Optional[str] = None
    mobile_money_name: Optional[str] = None
    # PayPal fields
    paypal_email: Optional[str] = None
    # Wise fields
    wise_email: Optional[str] = None
    # Cryptocurrency fields
    crypto_wallet_address: Optional[str] = None
    crypto_network: Optional[str] = None
    # Other fields
    other_gateway_name: Optional[str] = None
    additional_info: Optional[str] = None


class PaymentMethodResponse(BaseModel):
    id: UUID
    method_type: str
    is_active: bool
    is_default: bool
    created_at: str
    updated_at: str
    # Paystack specific
    paystack_business_name: Optional[str] = None
    paystack_settlement_bank: Optional[str] = None
    paystack_account_number: Optional[str] = None
    paystack_subaccount_code: Optional[str] = None
    # Manual specific
    payment_gateway_name: Optional[str] = None
    payment_instructions: Optional[str] = None
    manual_payment_type: Optional[str] = None
    # Bank Transfer
    bank_name: Optional[str] = None
    account_name: Optional[str] = None
    account_number: Optional[str] = None
    swift_code: Optional[str] = None
    branch_code: Optional[str] = None
    # Mobile Money
    mobile_money_provider: Optional[str] = None
    mobile_money_number: Optional[str] = None
    mobile_money_name: Optional[str] = None
    # PayPal
    paypal_email: Optional[str] = None
    # Wise
    wise_email: Optional[str] = None
    # Cryptocurrency
    crypto_wallet_address: Optional[str] = None
    crypto_network: Optional[str] = None
    # Other
    other_gateway_name: Optional[str] = None
    additional_info: Optional[str] = None

    class Config:
        from_attributes = True


@router.get("/payment-methods", response_model=List[PaymentMethodResponse])
async def get_payment_methods(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """
    Get all configured payment methods for the user.
    Uses Redis caching for performance.
    """
    # Try to get from cache first
    cached_methods = await RedisCache.get_payment_methods(current_user.id)
    if cached_methods is not None:
        return cached_methods

    # Get all payment methods for this user
    stmt = select(PaymentMethod).where(PaymentMethod.user_id == current_user.id)
    result = await db.execute(stmt)
    methods = result.scalars().all()

    # Convert to dict for caching
    methods_list = [method.to_dict() for method in methods]

    # Cache the results
    await RedisCache.set_payment_methods(current_user.id, methods_list)

    return methods_list


@router.post("/payment-methods/paystack", status_code=status.HTTP_201_CREATED)
async def create_paystack_method(
    data: PaystackMethodCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a Paystack payment method configuration.
    This will be used when creating clients with Paystack payment.
    """
    # TODO: Integrate with Paystack API to create subaccount
    # For now, we'll store the configuration

    # Check if user already has a Paystack method
    stmt = select(PaymentMethod).where(
        PaymentMethod.user_id == current_user.id,
        PaymentMethod.method_type == "paystack",
        PaymentMethod.is_active == True,
    )
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()

    if existing:
        # Update existing method
        existing.paystack_business_name = data.business_name
        existing.paystack_settlement_bank = data.settlement_bank
        existing.paystack_account_number = data.account_number
        # TODO: Update Paystack subaccount via API
        await db.commit()
        await db.refresh(existing)
        method = existing
    else:
        # Create new method
        method = PaymentMethod(
            user_id=current_user.id,
            method_type="paystack",
            is_active=True,
            paystack_business_name=data.business_name,
            paystack_settlement_bank=data.settlement_bank,
            paystack_account_number=data.account_number,
            # TODO: Create Paystack subaccount and store code
            paystack_subaccount_code=None,
        )
        db.add(method)
        await db.commit()
        await db.refresh(method)

    # Invalidate cache
    await RedisCache.invalidate_payment_methods(current_user.id)
    # Cache will be updated on next fetch

    # Log activity for Paystack setup
    try:
        action = "updated" if existing else "created"
        await create_activity(
            db=db,
            user_id=current_user.id,
            entity_type="payment_method",
            entity_id=method.id,
            action=action,
            title=f"Configured Paystack: {data.business_name}",
            description=f"Bank: {data.settlement_bank}",
        )
    except Exception as e:
        logger.warning("Failed to log Paystack setup activity: %s", e)

    return {
        "message": "Paystack configuration saved successfully",
        "id": method.id,
        "business_name": data.business_name,
    }


@router.post("/payment-methods/manual/debug")
async def debug_manual_method(request: Request, current_user: User = Depends(get_current_user)):
    """Debug endpoint to see what data is being sent"""
    body = await request.body()
    logger.debug("Raw request body: %s", body.decode())
    try:
        json_data = await request.json()
        logger.debug("Parsed JSON: %s", json.dumps(json_data, indent=2))
        return {"received": json_data}
    except Exception as e:
        logger.debug("Error parsing JSON: %s", e)
        return {"error": str(e), "body": body.decode()}


@router.post("/payment-methods/manual", status_code=status.HTTP_201_CREATED)
async def create_manual_method(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a manual payment method configuration.
    This will be used when creating clients with manual payment.
    """
    # Get raw body for debugging
    body = await request.body()
    logger.debug("Raw request body: %s", body.decode())

    # Parse and validate
    try:
        json_data = json.loads(body.decode())
        logger.debug("Parsed JSON: %s", json.dumps(json_data, indent=2))
        data = ManualMethodCreate(**json_data)
        logger.debug("Validated data: %s", data.model_dump())
    except ValidationError as e:
        logger.debug("Validation error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Validation error: {str(e)}",
        )
    except Exception as e:
        logger.debug("Unexpected error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error parsing request: {str(e)}",
        )

    # Validate method-specific required fields
    if data.payment_method == "bank_transfer":
        if not data.bank_name or not data.account_number:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Bank name and account number are required for bank transfer",
            )
    elif data.payment_method == "mobile_money":
        if not data.mobile_money_provider or not data.mobile_money_number:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Mobile money provider and number are required",
            )
    elif data.payment_method == "paypal":
        if not data.paypal_email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="PayPal email is required",
            )
    elif data.payment_method == "wise":
        if not data.wise_email:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Wise email is required")
    elif data.payment_method == "cryptocurrency":
        if not data.crypto_wallet_address:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cryptocurrency wallet address is required",
            )
    elif data.payment_method == "other":
        if not data.other_gateway_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Payment gateway name is required for other payment methods",
            )

    # Create new method
    method = PaymentMethod(
        user_id=current_user.id,
        method_type="manual",
        is_active=True,
        manual_payment_type=data.payment_method,
        payment_gateway_name=data.payment_gateway_name,
        payment_instructions=data.payment_instructions,
        # Bank Transfer fields
        bank_name=data.bank_name,
        account_name=data.account_name,
        account_number=data.account_number,
        swift_code=data.swift_code,
        branch_code=data.branch_code,
        # Mobile Money fields
        mobile_money_provider=data.mobile_money_provider,
        mobile_money_number=data.mobile_money_number,
        mobile_money_name=data.mobile_money_name,
        # PayPal fields
        paypal_email=data.paypal_email,
        # Wise fields
        wise_email=data.wise_email,
        # Cryptocurrency fields
        crypto_wallet_address=data.crypto_wallet_address,
        crypto_network=data.crypto_network,
        # Other fields
        other_gateway_name=data.other_gateway_name,
        additional_info=data.additional_info,
    )
    db.add(method)
    await db.commit()
    await db.refresh(method)

    # Invalidate cache
    await RedisCache.invalidate_payment_methods(current_user.id)
    # Cache will be updated on next fetch

    # Log activity for manual payment method setup
    try:
        await create_activity(
            db=db,
            user_id=current_user.id,
            entity_type="payment_method",
            entity_id=method.id,
            action="created",
            title=f"Added payment method: {data.payment_gateway_name}",
            description=f"Type: {data.payment_method}",
        )
    except Exception as e:
        logger.warning("Failed to log payment method activity: %s", e)

    return {
        "message": "Manual payment configuration saved successfully",
        "id": method.id,
        "payment_gateway_name": data.payment_gateway_name,
    }


@router.put("/payment-methods/{method_id}")
async def update_payment_method(
    method_id: UUID,
    data: ManualMethodCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Update a payment method configuration.
    """
    stmt = select(PaymentMethod).where(PaymentMethod.id == method_id, PaymentMethod.user_id == current_user.id)
    result = await db.execute(stmt)
    method = result.scalar_one_or_none()

    if not method:
        raise HTTPException(status_code=404, detail="Payment method not found")

    # Update fields
    method.payment_gateway_name = data.payment_gateway_name
    method.payment_instructions = data.payment_instructions
    method.manual_payment_type = data.payment_method
    method.bank_name = data.bank_name
    method.account_name = data.account_name
    method.account_number = data.account_number
    method.swift_code = data.swift_code
    method.branch_code = data.branch_code
    method.mobile_money_provider = data.mobile_money_provider
    method.mobile_money_number = data.mobile_money_number
    method.mobile_money_name = data.mobile_money_name
    method.paypal_email = data.paypal_email
    method.wise_email = data.wise_email
    method.crypto_wallet_address = data.crypto_wallet_address
    method.crypto_network = data.crypto_network
    method.other_gateway_name = data.other_gateway_name
    method.additional_info = data.additional_info

    await db.commit()
    await db.refresh(method)

    # Invalidate cache
    await RedisCache.invalidate_payment_methods(current_user.id)
    # Cache will be updated on next fetch

    # Log activity for payment method update
    try:
        await create_activity(
            db=db,
            user_id=current_user.id,
            entity_type="payment_method",
            entity_id=method.id,
            action="updated",
            title=f"Updated payment method: {data.payment_gateway_name}",
            description=None,
        )
    except Exception as e:
        logger.warning("Failed to log payment method update activity: %s", e)

    return {"message": "Payment method updated successfully", "id": method.id}


@router.delete("/payment-methods/{method_id}")
async def delete_payment_method(
    method_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Delete a payment method configuration.
    Marks the payment method as inactive.
    """
    stmt = select(PaymentMethod).where(PaymentMethod.id == method_id, PaymentMethod.user_id == current_user.id)
    result = await db.execute(stmt)
    method = result.scalar_one_or_none()

    if not method:
        raise HTTPException(status_code=404, detail="Payment method not found")

    # Mark as inactive instead of deleting
    method.is_active = False
    method_name = method.payment_gateway_name or method.paystack_business_name or "Payment Method"
    await db.commit()

    # Invalidate cache
    await RedisCache.invalidate_payment_methods(current_user.id)
    # Cache will be updated on next fetch

    # Log activity for payment method removal
    try:
        await create_activity(
            db=db,
            user_id=current_user.id,
            entity_type="payment_method",
            entity_id=method_id,
            action="deleted",
            title=f"Removed payment method: {method_name}",
            description=None,
        )
    except Exception as e:
        logger.warning("Failed to log payment method removal activity: %s", e)

    return {"message": "Payment method removed successfully"}


# Bundle endpoint for payments page - returns all payment data in one response
class PaymentsBundleResponse(BaseModel):
    """Schema for payments bundle response"""

    payment_methods: List[PaymentMethodResponse]
    active_methods: List[PaymentMethodResponse]
    recent_invoices: List[dict]
    invoices_summary: dict


@router.get("/payments/bundle", response_model=PaymentsBundleResponse)
async def get_payments_bundle(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """
    Get all payment data in one response.
    Returns payment methods and recent invoices.
    """
    # Get payment methods
    stmt = select(PaymentMethod).where(PaymentMethod.user_id == current_user.id)
    result = await db.execute(stmt)
    methods = result.scalars().all()
    payment_methods = [method.to_dict() for method in methods]

    # Get active methods
    active_methods = [m for m in payment_methods if m.get("is_active", False)]

    # Get invoices
    from app.models.invoice import Invoice

    invoices_stmt = select(Invoice).where(Invoice.user_id == current_user.id)
    invoices_stmt = invoices_stmt.order_by(Invoice.created_at.desc()).limit(20)
    invoices_result = await db.execute(invoices_stmt)
    invoices = invoices_result.scalars().all()

    # Get client names for invoices
    recent_invoices = []
    for inv in invoices:
        client_stmt = select(Client).where(Client.id == inv.client_id)
        client_result = await db.execute(client_stmt)
        client = client_result.scalar_one_or_none()

        recent_invoices.append(
            {
                "id": str(inv.id),
                "invoice_number": inv.invoice_number,
                "client_name": client.name if client else "Unknown",
                "total_amount": float(inv.total_amount) if inv.total_amount else 0,
                "status": inv.status,
                "due_date": inv.due_date.isoformat() if inv.due_date else None,
                "created_at": inv.created_at.isoformat() if inv.created_at else None,
            }
        )

    # Calculate invoices summary
    total_invoiced = sum(float(inv.total_amount) for inv in invoices if inv.total_amount)
    total_paid = sum(float(inv.total_amount) for inv in invoices if inv.total_amount and inv.status == "paid")
    total_unpaid = total_invoiced - total_paid

    invoices_summary = {
        "total_invoiced": total_invoiced,
        "total_paid": total_paid,
        "total_unpaid": total_unpaid,
        "pending_count": len([inv for inv in invoices if inv.status == "pending"]),
        "paid_count": len([inv for inv in invoices if inv.status == "paid"]),
        "overdue_count": len([inv for inv in invoices if inv.status == "overdue"]),
    }

    return PaymentsBundleResponse(
        payment_methods=payment_methods,
        active_methods=active_methods,
        recent_invoices=recent_invoices,
        invoices_summary=invoices_summary,
    )
