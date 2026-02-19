from datetime import datetime, timedelta
from decimal import Decimal
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.common.responses import error_response, success_response
from app.core.auth import get_current_user
from app.core.logging_config import get_logger
from app.db.database import get_db
from app.models.subscription import Subscription
from app.models.user import User
from app.schemas.subscription import (
    SubscriptionCancel,
    SubscriptionCreate,
    SubscriptionFeatures,
    SubscriptionPlan,
    SubscriptionResponse,
)
from app.utils.paystack_client import PaystackClient

logger = get_logger(__name__)
router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])

# Define subscription plans
SUBSCRIPTION_PLANS = {
    "free": SubscriptionPlan(
        name="Free",
        description="Basic features for getting started",
        price=Decimal("0.00"),
        currency="USD",
        billing_period="monthly",
        features=[
            "Unlimited projects",
            "Unlimited clients",
            "Paystack payments with 1.5% platform fee",
            "Git integration",
            "Auto-pause enforcement",
            "Basic email notifications",
        ],
        max_projects=None,
        max_clients=None,
        paystack_fee_waived=False,
        manual_payment_enabled=False,
    ),
    "pro": SubscriptionPlan(
        name="Pro",
        description="Advanced features for professional freelancers",
        price=Decimal("29.00"),
        currency="USD",
        billing_period="monthly",
        features=[
            "All Free features",
            "Manual payment gateway configuration",
            "No Paystack platform fee (1.5% waived)",
            "Priority email support",
            "Custom contract templates",
            "Advanced analytics",
        ],
        max_projects=None,
        max_clients=None,
        paystack_fee_waived=True,
        manual_payment_enabled=True,
    ),
    "enterprise": SubscriptionPlan(
        name="Enterprise",
        description="Full-featured solution for agencies and teams",
        price=Decimal("99.00"),
        currency="USD",
        billing_period="monthly",
        features=[
            "All Pro features",
            "Team collaboration",
            "White-label client portal",
            "API access",
            "Dedicated account manager",
            "Custom integrations",
        ],
        max_projects=None,
        max_clients=None,
        paystack_fee_waived=True,
        manual_payment_enabled=True,
    ),
}


@router.get("/plans", response_model=dict)
async def get_subscription_plans():
    """Get all available subscription plans"""
    return success_response(
        data={"plans": [{"id": plan_id, **plan.model_dump()} for plan_id, plan in SUBSCRIPTION_PLANS.items()]},
        message="Subscription plans retrieved successfully",
    )


@router.get("/current", response_model=dict)
async def get_current_subscription(request: Request, db: Session = Depends(get_db)):
    """Get current user's subscription"""
    current_user = get_current_user(request, db)

    stmt = select(Subscription).where(Subscription.user_id == current_user.id)
    result = db.execute(stmt)
    subscription = result.scalar_one_or_none()

    if not subscription:
        # Create default free subscription
        subscription = Subscription(
            user_id=current_user.id,
            plan="free",
            status="active",
            started_at=datetime.utcnow(),
            paystack_fee_waived=False,
        )
        db.add(subscription)
        db.commit()
        db.refresh(subscription)

    return success_response(
        data={
            "subscription": {
                "id": subscription.id,
                "user_id": subscription.user_id,
                "plan": subscription.plan,
                "status": subscription.status,
                "started_at": (subscription.started_at.isoformat() if subscription.started_at else None),
                "expires_at": (subscription.expires_at.isoformat() if subscription.expires_at else None),
                "cancelled_at": (subscription.cancelled_at.isoformat() if subscription.cancelled_at else None),
                "payment_method": subscription.payment_method,
                "payment_reference": subscription.payment_reference,
                "amount": float(subscription.amount) if subscription.amount else None,
                "currency": subscription.currency,
                "paystack_fee_waived": subscription.paystack_fee_waived,
                "max_projects": subscription.max_projects,
                "max_clients": subscription.max_clients,
                "created_at": (subscription.created_at.isoformat() if subscription.created_at else None),
                "updated_at": (subscription.updated_at.isoformat() if subscription.updated_at else None),
            }
        },
        message="Current subscription retrieved successfully",
    )


@router.post("/subscribe", response_model=dict)
async def subscribe_to_plan(
    subscription_data: SubscriptionCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    """Subscribe to a plan"""
    current_user = get_current_user(request, db)

    # Validate plan
    if subscription_data.plan not in SUBSCRIPTION_PLANS:
        return error_response(message="Invalid subscription plan", status_code=status.HTTP_400_BAD_REQUEST)

    plan = SUBSCRIPTION_PLANS[subscription_data.plan]

    # Check if user already has a subscription
    stmt = select(Subscription).where(Subscription.user_id == current_user.id)
    result = db.execute(stmt)
    existing_subscription = result.scalar_one_or_none()

    if subscription_data.plan == "free":
        # Downgrade to free plan
        if existing_subscription:
            existing_subscription.plan = "free"
            existing_subscription.status = "active"
            existing_subscription.paystack_fee_waived = False
            existing_subscription.max_projects = None
            existing_subscription.max_clients = None
            existing_subscription.expires_at = None
            existing_subscription.cancelled_at = None
            db.commit()
            db.refresh(existing_subscription)
            subscription = existing_subscription
        else:
            subscription = Subscription(
                user_id=current_user.id,
                plan="free",
                status="active",
                started_at=datetime.utcnow(),
                paystack_fee_waived=False,
            )
            db.add(subscription)
            db.commit()
            db.refresh(subscription)
    else:
        # Paid plan - require payment
        if not subscription_data.payment_reference:
            return error_response(
                message="Payment reference required for paid plans",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        # Calculate expiration date (30 days for monthly)
        expires_at = datetime.utcnow() + timedelta(days=30)

        if existing_subscription:
            existing_subscription.plan = subscription_data.plan
            existing_subscription.status = "active"
            existing_subscription.started_at = datetime.utcnow()
            existing_subscription.expires_at = expires_at
            existing_subscription.payment_method = subscription_data.payment_method
            existing_subscription.payment_reference = subscription_data.payment_reference
            existing_subscription.amount = plan.price
            existing_subscription.currency = plan.currency
            existing_subscription.paystack_fee_waived = plan.paystack_fee_waived
            existing_subscription.max_projects = plan.max_projects
            existing_subscription.max_clients = plan.max_clients
            existing_subscription.cancelled_at = None
            db.commit()
            db.refresh(existing_subscription)
            subscription = existing_subscription
        else:
            subscription = Subscription(
                user_id=current_user.id,
                plan=subscription_data.plan,
                status="active",
                started_at=datetime.utcnow(),
                expires_at=expires_at,
                payment_method=subscription_data.payment_method,
                payment_reference=subscription_data.payment_reference,
                amount=plan.price,
                currency=plan.currency,
                paystack_fee_waived=plan.paystack_fee_waived,
                max_projects=plan.max_projects,
                max_clients=plan.max_clients,
            )
            db.add(subscription)
            db.commit()
            db.refresh(subscription)

    # Publish subscription event to NATS
    try:
        from app.utils.nats_client import publish_event

        await publish_event(
            ("subscription.created" if not existing_subscription else "subscription.updated"),
            {
                "user_id": current_user.id,
                "plan": subscription_data.plan,
                "status": "active",
                "timestamp": datetime.utcnow().isoformat(),
            },
        )
    except Exception as e:
        logger.error("Failed to publish subscription event: %s", e)

    return success_response(
        data={
            "subscription": {
                "id": subscription.id,
                "user_id": subscription.user_id,
                "plan": subscription.plan,
                "status": subscription.status,
                "started_at": (subscription.started_at.isoformat() if subscription.started_at else None),
                "expires_at": (subscription.expires_at.isoformat() if subscription.expires_at else None),
                "paystack_fee_waived": subscription.paystack_fee_waived,
                "max_projects": subscription.max_projects,
                "max_clients": subscription.max_clients,
            }
        },
        message=f"Successfully subscribed to {plan.name} plan",
    )


@router.post("/cancel", response_model=dict)
async def cancel_subscription(cancel_data: SubscriptionCancel, request: Request, db: Session = Depends(get_db)):
    """Cancel current subscription"""
    current_user = get_current_user(request, db)

    stmt = select(Subscription).where(Subscription.user_id == current_user.id)
    result = db.execute(stmt)
    subscription = result.scalar_one_or_none()

    if not subscription:
        return error_response(
            message="No active subscription found",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    if subscription.plan == "free":
        return error_response(message="Cannot cancel free plan", status_code=status.HTTP_400_BAD_REQUEST)

    # Mark as cancelled but keep active until expiration
    subscription.status = "cancelled"
    subscription.cancelled_at = datetime.utcnow()
    db.commit()
    db.refresh(subscription)

    # Publish cancellation event to NATS
    try:
        from app.utils.nats_client import publish_event

        await publish_event(
            "subscription.cancelled",
            {
                "user_id": current_user.id,
                "plan": subscription.plan,
                "cancelled_at": subscription.cancelled_at.isoformat(),
                "expires_at": (subscription.expires_at.isoformat() if subscription.expires_at else None),
                "reason": cancel_data.reason,
                "timestamp": datetime.utcnow().isoformat(),
            },
        )
    except Exception as e:
        logger.error("Failed to publish cancellation event: %s", e)

    return success_response(
        data={
            "subscription": {
                "id": subscription.id,
                "plan": subscription.plan,
                "status": subscription.status,
                "cancelled_at": (subscription.cancelled_at.isoformat() if subscription.cancelled_at else None),
                "expires_at": (subscription.expires_at.isoformat() if subscription.expires_at else None),
            }
        },
        message="Subscription cancelled successfully. Access will continue until expiration date.",
    )


@router.post("/webhooks/paystack", response_model=dict)
async def handle_paystack_subscription_webhook(request: Request, db: Session = Depends(get_db)):
    """Handle Paystack subscription webhooks"""
    # Get webhook payload
    payload = await request.json()

    # Verify webhook signature
    paystack_client = PaystackClient()
    signature = request.headers.get("x-paystack-signature")

    if not paystack_client.verify_webhook_signature(await request.body(), signature):
        return error_response(
            message="Invalid webhook signature",
            status_code=status.HTTP_401_UNAUTHORIZED,
        )

    event_type = payload.get("event")
    data = payload.get("data", {})

    if event_type == "subscription.create":
        # Handle new subscription
        reference = data.get("reference")
        customer_email = data.get("customer", {}).get("email")

        # Find user by email
        stmt = select(User).where(User.email == customer_email)
        result = db.execute(stmt)
        user = result.scalar_one_or_none()

        if user:
            # Update or create subscription
            stmt = select(Subscription).where(Subscription.user_id == user.id)
            result = db.execute(stmt)
            subscription = result.scalar_one_or_none()

            if subscription:
                subscription.status = "active"
                subscription.payment_reference = reference
            else:
                subscription = Subscription(
                    user_id=user.id,
                    plan="pro",  # Default to pro for webhook subscriptions
                    status="active",
                    started_at=datetime.utcnow(),
                    expires_at=datetime.utcnow() + timedelta(days=30),
                    payment_method="paystack",
                    payment_reference=reference,
                    paystack_fee_waived=True,
                )
                db.add(subscription)

            db.commit()

    elif event_type == "subscription.disable":
        # Handle subscription expiration
        reference = data.get("reference")

        stmt = select(Subscription).where(Subscription.payment_reference == reference)
        result = db.execute(stmt)
        subscription = result.scalar_one_or_none()

        if subscription:
            subscription.status = "expired"
            subscription.plan = "free"
            subscription.paystack_fee_waived = False
            db.commit()

    return success_response(data={"event": event_type}, message="Webhook processed successfully")
