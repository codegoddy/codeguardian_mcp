"""
Subscription utility functions for feature gating and subscription checks
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.subscription import Subscription
from app.models.user import User


async def get_user_subscription(db: Session, user_id: int) -> Optional[Subscription]:
    """Get user's current subscription"""
    stmt = select(Subscription).where(Subscription.user_id == user_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_or_create_subscription(db: Session, user_id: int) -> Subscription:
    """Get user's subscription or create a free one if it doesn't exist"""
    subscription = await get_user_subscription(db, user_id)

    if not subscription:
        # Create default free subscription
        subscription = Subscription(
            user_id=user_id,
            plan="free",
            status="active",
            started_at=datetime.utcnow(),
            paystack_fee_waived=False,
        )
        db.add(subscription)
        await db.commit()
        await db.refresh(subscription)

    return subscription


def is_subscription_active(subscription: Subscription) -> bool:
    """Check if subscription is active"""
    if subscription.status != "active":
        return False

    # Check expiration for paid plans
    if subscription.expires_at and subscription.expires_at < datetime.utcnow():
        return False

    return True


async def has_feature_access(db: Session, user_id: int, feature: str) -> bool:
    """
    Check if user has access to a specific feature

    Features:
    - manual_payment: Manual payment gateway configuration
    - paystack_fee_waived: No 1.5% platform fee on Paystack
    - custom_templates: Custom project templates
    - api_access: API access
    - white_label: White-label client portal
    """
    subscription = await get_or_create_subscription(db, user_id)

    if not is_subscription_active(subscription):
        # Expired subscription - revert to free tier
        if subscription.plan != "free":
            subscription.plan = "free"
            subscription.status = "expired"
            subscription.paystack_fee_waived = False
            await db.commit()
        return False

    # Free plan has no premium features
    if subscription.plan == "free":
        return False

    # Pro plan features
    if subscription.plan == "pro":
        pro_features = ["manual_payment", "paystack_fee_waived", "custom_templates"]
        return feature in pro_features

    # Enterprise plan has all features
    if subscription.plan == "enterprise":
        return True

    return False


async def get_paystack_platform_fee(db: Session, user_id: int) -> float:
    """
    Get the Paystack platform fee percentage for a user
    Returns configured fee for free users, waived fee for paid subscribers
    """
    from app.core.config import settings

    subscription = await get_or_create_subscription(db, user_id)

    if not is_subscription_active(subscription):
        return settings.paystack_platform_fee_free_users  # Default fee for expired subscriptions

    if subscription.paystack_fee_waived:
        return settings.paystack_platform_fee_paid_users

    return settings.paystack_platform_fee_free_users


async def can_configure_manual_payment(db: Session, user_id: int) -> bool:
    """Check if user can configure manual payment gateways"""
    return await has_feature_access(db, user_id, "manual_payment")


async def check_subscription_limits(db: Session, user_id: int, resource_type: str, current_count: int) -> bool:
    """
    Check if user has reached their subscription limits

    resource_type: 'projects' or 'clients'
    current_count: current number of resources

    Returns True if within limits, False if limit exceeded
    """
    subscription = await get_or_create_subscription(db, user_id)

    if resource_type == "projects":
        if subscription.max_projects is None:
            return True  # Unlimited
        return current_count < subscription.max_projects

    elif resource_type == "clients":
        if subscription.max_clients is None:
            return True  # Unlimited
        return current_count < subscription.max_clients

    return True


async def handle_subscription_expiration(db: Session, user_id: int):
    """Handle subscription expiration - revert to free tier"""
    subscription = await get_user_subscription(db, user_id)

    if not subscription:
        return

    if subscription.expires_at and subscription.expires_at < datetime.utcnow():
        subscription.status = "expired"
        subscription.plan = "free"
        subscription.paystack_fee_waived = False
        subscription.max_projects = None
        subscription.max_clients = None
        await db.commit()
