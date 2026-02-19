"""
Middleware for subscription feature gating
"""

from typing import Callable

from fastapi import HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.logging_config import get_logger
from app.utils.subscription_utils import get_or_create_subscription, has_feature_access, is_subscription_active

logger = get_logger(__name__)


def require_subscription_feature(feature: str):
    """
    Decorator to require a specific subscription feature

    Usage:
        @require_subscription_feature("manual_payment")
        async def configure_manual_payment(...):
            ...
    """

    def decorator(func: Callable):
        async def wrapper(*args, **kwargs):
            # Extract request and db from kwargs
            request = kwargs.get("request")
            db = kwargs.get("db")

            if not request or not db:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Missing request or database session",
                )

            # Get current user from request
            from app.core.auth import get_current_user

            current_user = get_current_user(request, db)

            # Check feature access
            if not has_feature_access(db, current_user.id, feature):
                subscription = get_or_create_subscription(db, current_user.id)

                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail={
                        "error": "SUBSCRIPTION_REQUIRED",
                        "message": f"This feature requires a paid subscription. Your current plan: {subscription.plan}",
                        "required_feature": feature,
                        "current_plan": subscription.plan,
                        "upgrade_url": "/api/subscriptions/plans",
                    },
                )

            return await func(*args, **kwargs)

        return wrapper

    return decorator


def check_subscription_status(db: Session, user_id: int):
    """
    Check and update subscription status
    Handles expiration and feature reversion
    """
    from app.utils.subscription_utils import handle_subscription_expiration

    handle_subscription_expiration(db, user_id)


async def subscription_middleware(request: Request, call_next):
    """
    Middleware to check subscription status on each request
    """
    response = await call_next(request)

    # Check if user is authenticated
    auth_header = request.headers.get("authorization")
    if auth_header and auth_header.startswith("Bearer "):
        try:
            from sqlalchemy import select

            from app.core.auth import decode_supabase_token, extract_user_id_from_token
            from app.db.database import get_db
            from app.models.user import User

            token = auth_header.split(" ")[1]

            # Try to get user_id from token (works for both internal and Supabase tokens)
            user_id = extract_user_id_from_token(token)

            if user_id:
                # Get database session
                db = next(get_db())
                try:
                    # Try to find user by ID (for Supabase tokens, sub is the user ID)
                    # or by email (for internal tokens)
                    try:
                        from uuid import UUID

                        user_uuid = UUID(user_id)
                        stmt = select(User).where(User.id == user_uuid)
                    except ValueError:
                        # Not a UUID, try as email
                        stmt = select(User).where(User.email == user_id)

                    result = db.execute(stmt)
                    user = result.scalar_one_or_none()

                    if user:
                        # Check and update subscription status
                        check_subscription_status(db, user.id)
                finally:
                    db.close()
        except Exception as e:
            logger.error("Subscription middleware error: %s", e)

    return response
