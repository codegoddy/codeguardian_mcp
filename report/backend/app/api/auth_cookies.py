"""
Cookie-based Authentication Endpoints

These are updated versions of auth endpoints that use httpOnly cookies
instead of returning tokens in JSON responses.

This provides better security by preventing XSS attacks.
"""

import random
import string

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import (
    create_access_token,
    create_refresh_token,
    decode_access_token,
    validate_refresh_token,
    verify_password,
)
from app.core.cookies import clear_auth_cookies, get_tokens_from_request, set_auth_cookies
from app.core.logging_config import get_logger
from app.db.database import get_db
from app.schemas.auth import OTPRequest, OTPVerify, TokenRefresh, UserCreate, UserLogin
from app.utils.crud import create_user, get_user_by_email, user_exists
from app.utils.rate_limiter import limiter

logger = get_logger(__name__)

router = APIRouter()

# Rate limits
RATE_LIMITS = {
    "auth_login": "5/minute",
    "auth_register": "3/minute",
    "auth_forgot": "3/minute",
}

# In-memory OTP store (use Redis in production)
otp_store = {}


@router.post("/login")
@limiter.limit(RATE_LIMITS["auth_login"])
async def login_with_cookies(
    request: Request,
    response: Response,
    user: UserLogin,
    db: AsyncSession = Depends(get_db),
):
    """
    Login with email and password.
    Sets httpOnly cookies instead of returning tokens in response.

    Security improvements over localStorage:
    - Cookies are httpOnly (cannot be accessed by JavaScript)
    - Cookies are secure (only sent over HTTPS in production)
    - Cookies use SameSite=lax (CSRF protection)
    - XSS attacks cannot steal tokens
    """
    # Verify user exists
    db_user = await get_user_by_email(db, user.email)
    if not db_user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    # Verify password
    if not verify_password(user.password, db_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    # Generate tokens
    access_token = create_access_token(
        data={"sub": db_user.email},
        user_id=str(db_user.id),
        full_name=db_user.full_name,
    )
    refresh_token = create_refresh_token(data={"sub": db_user.email})

    # Set cookies
    set_auth_cookies(response, access_token, refresh_token)

    # Return user info (no tokens in response)
    return {
        "message": "Login successful",
        "user": {
            "id": str(db_user.id),
            "email": db_user.email,
            "fullName": db_user.full_name,
        },
    }


@router.post("/register")
@limiter.limit(RATE_LIMITS["auth_register"])
async def register_with_cookies(
    request: Request,
    response: Response,
    user: UserCreate,
    db: AsyncSession = Depends(get_db),
):
    """
    Register a new user.
    Sets httpOnly cookies instead of returning tokens in response.
    """
    # Check if user exists
    if await user_exists(db, user.email):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    # Create user
    db_user = await create_user(db, user)  # Use the user object directly

    # Generate OTP for email verification
    otp = "".join(random.choices(string.digits, k=6))
    otp_store[user.email] = otp

    # Publish OTP email event to NATS (synchronous to ensure delivery)
    try:
        from app.utils.nats_client import publish_event

        await publish_event("user.registered_otp", {"email": user.email, "otp": otp})
        logger.debug("OTP email workflow triggered for %s", user.email)
    except Exception as e:
        logger.warning("Failed to trigger email workflow", exc_info=True)
    # Generate tokens
    access_token = create_access_token(
        data={"sub": db_user.email},
        user_id=str(db_user.id),
        full_name=db_user.full_name,
    )
    refresh_token = create_refresh_token(data={"sub": db_user.email})

    # Set cookies
    set_auth_cookies(response, access_token, refresh_token)

    # Return user info (no tokens in response)
    return {
        "message": "Registration successful",
        "user": {
            "id": str(db_user.id),
            "email": db_user.email,
            "fullName": db_user.full_name,
        },
    }


@router.post("/verify-otp")
async def verify_otp_with_cookies(
    request: Request,
    response: Response,
    verify: OTPVerify,
    db: AsyncSession = Depends(get_db),
):
    """Verify OTP and set session cookies"""
    stored_otp = otp_store.get(verify.email)
    if not stored_otp or stored_otp != verify.otp:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")

    # Get user
    db_user = await get_user_by_email(db, verify.email)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    # Clear OTP
    del otp_store[verify.email]

    # Generate tokens
    access_token = create_access_token(
        data={"sub": db_user.email},
        user_id=str(db_user.id),
        full_name=db_user.full_name,
    )
    refresh_token = create_refresh_token(data={"sub": db_user.email})

    # Set cookies
    set_auth_cookies(response, access_token, refresh_token)

    # Trigger welcome email event
    try:
        import json

        from app.utils.nats_client import publish_message_background

        message_data = {
            "email": db_user.email,
            "is_account_verification": True,
            "user_full_name": db_user.full_name,
        }
        await publish_message_background("user.otp_verified", json.dumps(message_data))
    except Exception:
        pass

    return {
        "message": "OTP verified successfully",
        "user": {
            "id": str(db_user.id),
            "email": db_user.email,
            "fullName": db_user.full_name,
        },
    }


@router.post("/logout")
async def logout_with_cookies(response: Response):
    """
    Logout by clearing authentication cookies.
    """
    clear_auth_cookies(response)

    return {"message": "Logout successful"}


@router.post("/refresh")
async def refresh_token_with_cookies(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    """
    Refresh access token using refresh token from cookie.
    """
    # Get tokens from cookies
    access_token, refresh_token = get_tokens_from_request(request)

    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token not found")

    try:
        # Validate refresh token
        payload = validate_refresh_token(refresh_token)
        email = payload.get("sub")

        if not email:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

        # Get user
        db_user = await get_user_by_email(db, email)
        if not db_user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

        # Generate new tokens
        new_access_token = create_access_token(data={"sub": email}, user_id=str(db_user.id), full_name=db_user.full_name)
        new_refresh_token = create_refresh_token(data={"sub": email})

        # Set new cookies
        set_auth_cookies(response, new_access_token, new_refresh_token)

        return {"message": "Token refreshed successfully"}

    except Exception as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")


@router.get("/me")
async def get_current_user_from_cookie(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Get current user from cookie token.
    """
    # Get token from cookie or header (backward compatibility)
    access_token, _ = get_tokens_from_request(request)

    if not access_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    try:
        # Decode token
        payload = decode_access_token(access_token)
        email = payload.get("sub")

        if not email:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

        # Get user
        user = await get_user_by_email(db, email)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        # Get user settings for profile image
        from sqlalchemy import select

        from app.models.user import UserSettings

        stmt = select(UserSettings).where(UserSettings.user_id == user.id)
        result = await db.execute(stmt)
        settings = result.scalar_one_or_none()

        return {
            "id": str(user.id),
            "email": user.email,
            "fullName": user.full_name,
            "provider": user.provider,
            "profileImageUrl": settings.profile_image_url if settings else None,
        }

    except Exception as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


@router.post("/forgot-password")
@limiter.limit(RATE_LIMITS["auth_forgot"])
async def forgot_password_with_cookies(request: Request, otp_request: OTPRequest, db: AsyncSession = Depends(get_db)):
    """Request password reset OTP via Brevo"""
    # Check if user exists
    user = await get_user_by_email(db, otp_request.email)
    if not user:
        # Don't reveal if email exists
        return {"message": "If the email exists, an OTP will be sent"}

    # Generate OTP
    otp = "".join(random.choices(string.digits, k=6))
    otp_store[otp_request.email] = otp

    # Publish to NATS for Brevo (via main.py worker)
    try:
        from app.utils.nats_client import publish_event

        await publish_event("user.forgot_password_otp", {"email": otp_request.email, "otp": otp})
        logger.debug("Forgot password OTP workflow triggered for %s", otp_request.email)
    except Exception as e:
        logger.warning("Failed to trigger forgot password email", exc_info=True)

    return {"message": "If the email exists, an OTP will be sent"}


@router.post("/resend-otp")
@limiter.limit(RATE_LIMITS["auth_forgot"])
async def resend_otp_with_cookies(request: Request, otp_request: OTPRequest, db: AsyncSession = Depends(get_db)):
    """Resend OTP via Brevo"""
    # Check if user exists
    user = await get_user_by_email(db, otp_request.email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Generate OTP
    otp = "".join(random.choices(string.digits, k=6))
    otp_store[otp_request.email] = otp

    # Publish to NATS
    try:
        from app.utils.nats_client import publish_event

        await publish_event("user.registered_otp", {"email": otp_request.email, "otp": otp})
        logger.debug("OTP resend triggered for %s", otp_request.email)
    except Exception as e:
        logger.warning("Failed to resend OTP email", exc_info=True)

    return {"message": "OTP resent successfully"}
