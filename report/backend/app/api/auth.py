import json
import random
import string

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.core.auth import (
    check_token_expiration,
    create_access_token,
    create_refresh_token,
    decode_access_token,
    generate_oauth_state,
    get_current_user,
    handle_oauth_callback,
    should_refresh_token,
    validate_refresh_token,
    verify_oauth_state,
)
from app.core.config import settings
from app.core.logging_config import get_logger
from app.db.database import get_db
from app.models.user import User as UserModel

# from authlib.integrations.httpx_client import AsyncOAuth2Client  # Temporarily commented out due to missing httpx
from app.schemas.auth import (
    OAuthCallback,
    OAuthLoginResponse,
    OAuthTokenResponse,
    OTPRequest,
    OTPVerify,
    Token,
    TokenPair,
    TokenRefresh,
    UserCreate,
    UserLogin,
)
from app.utils.crud import authenticate_user, create_user, get_user_by_email, user_exists
from app.utils.email import send_otp_email, send_welcome_email
from app.utils.nats_client import publish_message_background
from app.utils.rate_limiter import RATE_LIMITS, limiter

router = APIRouter()
logger = get_logger(__name__)

# In-memory OTP store (in production, use Redis or similar)
otp_store = {}


@router.post("/register")
@limiter.limit(RATE_LIMITS["auth_register"])
async def register(request: Request, user: UserCreate, db=Depends(get_db)):
    user_exists_result = await user_exists(db, user.email)
    if user_exists_result:
        raise HTTPException(status_code=400, detail="User already exists")

    # Create the user in database
    db_user = await create_user(db, user)

    # Generate OTP for email verification
    otp = "".join(random.choices(string.digits, k=6))
    otp_store[user.email] = otp

    # Publish OTP email event to NATS (synchronous to ensure delivery)
    try:
        import time

        publish_time = time.time()
        from app.utils.nats_client import publish_event

        await publish_event("user.registered_otp", {"email": user.email, "otp": otp})
        logger.debug("OTP email event published for %s", user.email)
    except Exception as e:
        logger.warning("Failed to publish OTP email event: %s", e)
        # Continue - user is created, they can request OTP resend if needed

    # Return message indicating OTP was sent (no token yet)
    return {"message": "Registration successful. Please check your email for OTP verification."}


@router.post("/login", response_model=Token)
@limiter.limit(RATE_LIMITS["auth_login"])
async def login(request: Request, user: UserLogin, db=Depends(get_db)):
    logger.debug("Login attempt for user: %s", user.email)
    import time

    start_time = time.time()

    try:
        db_user = await authenticate_user(db, user)
        logger.debug("Authentication completed in %.2fs", time.time() - start_time)
    except Exception as e:
        logger.error("Authentication failed for %s: %s", user.email, e, exc_info=True)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not db_user:
        logger.debug("User not found or invalid credentials for: %s", user.email)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    logger.debug("Creating access token for: %s", user.email)
    # Include user data in token to reduce Redis lookups
    access_token = create_access_token(data={"sub": user.email}, user_id=str(db_user.id), full_name=db_user.full_name)

    # Publish login event to NATS (non-blocking)
    try:
        await publish_message_background("user.logged_in", f"User logged in: {user.email}")
        logger.debug("NATS message published successfully")
    except Exception as e:
        logger.warning("Failed to publish login event to NATS: %s", e)
        # Continue with login even if NATS fails

    total_time = time.time() - start_time
    logger.debug("Login completed successfully for %s in %.2fs", user.email, total_time)

    # Generate refresh token
    refresh_token = create_refresh_token(data={"sub": user.email})

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }


@router.post("/forgot-password")
@limiter.limit(RATE_LIMITS["auth_forgot"])
async def forgot_password(request: Request, otp_request: OTPRequest, db: Session = Depends(get_db)):
    logger.debug("Forgot password request for: %s", otp_request.email)


@router.get("/test-no-db")
async def test_no_db():
    """Test endpoint that doesn't use database"""
    logger.debug("Test endpoint called - no database dependency")
    return {
        "message": "This endpoint works without database",
        "timestamp": "2025-01-01T00:00:00Z",
    }


from fastapi import Request


@router.post("/validate-token")
async def validate_token(request: Request, db=Depends(get_db)):
    """Validate JWT token"""
    import time

    start_time = time.time()

    logger.debug("Token validation request started at %s", start_time)

    auth_header = request.headers.get("authorization")
    logger.debug("Auth header present: %s", auth_header is not None)

    if not auth_header or not auth_header.startswith("Bearer "):
        logger.debug("Invalid auth header format")
        raise HTTPException(status_code=401, detail="Token not provided")

    token = auth_header.split(" ")[1]
    logger.debug("Token length: %d", len(token) if token else 0)

    if not token:
        logger.debug("Empty token provided")
        raise HTTPException(status_code=401, detail="Token not provided")

    try:
        logger.debug("Attempting to decode token...")
        # Decode and verify the token (imported from auth core)
        payload = decode_access_token(token)
        email = payload.get("sub")
        logger.debug("Token decoded successfully, email: %s", email)

        if not email:
            logger.debug("No email in token payload")
            raise HTTPException(status_code=401, detail="Invalid token")

        logger.debug("Checking if user exists in database: %s", email)
        # Verify user exists in database
        user_exists_result = await user_exists(db, email)
        logger.debug("User exists result: %s", user_exists_result)

        if not user_exists_result:
            logger.debug("User not found in database: %s", email)
            raise HTTPException(status_code=401, detail="User not found")

        total_time = time.time() - start_time
        logger.debug("Token validation completed successfully in %.2fs for %s", total_time, email)
        return {"valid": True, "email": email}

    except Exception as e:
        total_time = time.time() - start_time
        logger.debug("Token validation failed after %.2fs: %s", total_time, e)
        raise HTTPException(status_code=401, detail="Invalid token")


@router.post("/verify-otp", response_model=Token)
@limiter.limit(RATE_LIMITS["auth_otp"])
async def verify_otp(request: Request, verify: OTPVerify, db=Depends(get_db)):
    # For OTP verification, first check if user exists (security check)
    user_exists_result = await user_exists(db, verify.email)
    if not user_exists_result:
        raise HTTPException(status_code=400, detail="Invalid email")

    stored_otp = otp_store.get(verify.email)
    if not stored_otp or stored_otp != verify.otp:
        raise HTTPException(status_code=400, detail="Invalid OTP")

    # Get user information for welcome email
    db_user = await get_user_by_email(db, verify.email)

    # OTP verified, generate new token pair with user data for optimized auth
    access_token = create_access_token(
        data={"sub": verify.email},
        user_id=str(db_user.id) if db_user else None,
        full_name=db_user.full_name if db_user else None,
    )
    refresh_token = create_refresh_token(data={"sub": verify.email})

    # Clear OTP after use
    del otp_store[verify.email]

    # Publish verification event to NATS with context
    # Include user info for welcome email if this is account verification
    import json

    message_data = {
        "email": verify.email,
        "is_account_verification": True,  # This is account verification
        "user_full_name": str(db_user.full_name) if db_user else None,
    }
    try:
        await publish_message_background("user.otp_verified", json.dumps(message_data))
    except Exception as e:
        logger.warning("Failed to publish OTP verification event to NATS: %s", e)
        # Continue even if NATS fails

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }


@router.post("/welcome")
async def trigger_welcome_email(user: UserModel = Depends(get_current_user)):
    """Trigger the welcome email after successful Supabase verification"""
    import json

    from app.utils.nats_client import publish_message_background

    # Check if we should send welcome email (only if user is active)
    if not user.is_active:
        return {"message": "User not active, skipping welcome email"}

    message_data = {
        "email": user.email,
        "is_account_verification": True,
        "user_full_name": user.full_name,
    }

    # This matches the format the NATS worker in main.py expects
    try:
        await publish_message_background("user.otp_verified", json.dumps(message_data))
        logger.debug("Welcome email event published via /welcome for %s", user.email)
    except Exception as e:
        logger.error("Failed to publish welcome email event: %s", e, exc_info=True)
        # We don't raise an exception here to avoid breaking the frontend flow

    return {"message": "Welcome email triggered"}


# OAuth endpoints
PROVIDER_CONFIGS = {
    "google": {
        "client_id": settings.oauth_providers["google"]["client_id"],
        "client_secret": settings.oauth_providers["google"]["client_secret"],
        "authorize_url": "https://accounts.google.com/o/oauth2/auth",
        "access_token_url": "https://oauth2.googleapis.com/token",
        "userinfo_url": "https://openidconnect.googleapis.com/v1/userinfo",
        "scopes": ["openid", "email", "profile"],
        "redirect_uri": settings.oauth_providers["google"]["redirect_uri"],
    },
    "github": {
        "client_id": settings.oauth_providers["github"]["client_id"],
        "client_secret": settings.oauth_providers["github"]["client_secret"],
        "authorize_url": "https://github.com/login/oauth/authorize",
        "access_token_url": "https://github.com/login/oauth/access_token",
        "userinfo_url": "https://api.github.com/user",
        "scopes": ["user:email"],
        "redirect_uri": settings.oauth_providers["github"]["redirect_uri"],
    },
    "gitlab": {
        "client_id": settings.oauth_providers["gitlab"]["client_id"],
        "client_secret": settings.oauth_providers["gitlab"]["client_secret"],
        "authorize_url": "https://gitlab.com/oauth/authorize",
        "access_token_url": "https://gitlab.com/oauth/token",
        "userinfo_url": "https://gitlab.com/api/v4/user",
        "scopes": ["read_user"],
        "redirect_uri": settings.oauth_providers["gitlab"]["redirect_uri"],
    },
    "bitbucket": {
        "client_id": settings.oauth_providers["bitbucket"]["client_id"],
        "client_secret": settings.oauth_providers["bitbucket"]["client_secret"],
        "authorize_url": "https://bitbucket.org/site/oauth2/authorize",
        "access_token_url": "https://bitbucket.org/site/oauth2/access_token",
        "userinfo_url": "https://api.bitbucket.org/2.0/user",
        "scopes": ["account"],
        "redirect_uri": settings.oauth_providers["bitbucket"]["redirect_uri"],
    },
}


@router.get("/oauth/{provider}/login", response_model=OAuthLoginResponse)
async def oauth_login(provider: str):
    """Initiate OAuth login flow"""
    if provider not in PROVIDER_CONFIGS:
        raise HTTPException(status_code=400, detail=f"Unsupported OAuth provider: {provider}")

    config = PROVIDER_CONFIGS[provider]
    state = generate_oauth_state()

    # Build authorization URL
    params = {
        "client_id": config["client_id"],
        "redirect_uri": config["redirect_uri"],
        "scope": " ".join(config["scopes"]),
        "response_type": "code",
        "state": state,
    }

    if provider == "google":
        params["access_type"] = "offline"
        params["prompt"] = "consent"

    # Build query string
    query_params = "&".join([f"{k}={v}" for k, v in params.items()])
    authorization_url = f"{config['authorize_url']}?{query_params}"

    return OAuthLoginResponse(authorization_url=authorization_url, state=state)


@router.get("/oauth/{provider}/callback")
async def oauth_callback(
    provider: str,
    code: str = Query(...),
    state: str = Query(...),
    db: Session = Depends(get_db),
):
    """Handle OAuth callback"""
    if provider not in PROVIDER_CONFIGS:
        raise HTTPException(status_code=400, detail=f"Unsupported OAuth provider: {provider}")

    # Verify state
    if not verify_oauth_state(state):
        raise HTTPException(status_code=400, detail="Invalid or expired state")

    config = PROVIDER_CONFIGS[provider]

    try:
        # OAuth functionality temporarily disabled due to missing httpx dependency
        # TODO: Re-enable once httpx is properly installed
        raise HTTPException(status_code=400, detail="OAuth functionality temporarily disabled")
        """
        # Exchange code for access token
        async with AsyncOAuth2Client(
            client_id=config["client_id"],
            client_secret=config["client_secret"],
            token_endpoint=config["access_token_url"],
        ) as client:
            token = await client.fetch_token(
                url=config["access_token_url"],
                code=code,
                redirect_uri=config["redirect_uri"],
            )

        # Get user info from provider
        async with AsyncOAuth2Client(
            client_id=config["client_id"],
            client_secret=config["client_secret"],
            token=token,
        ) as client:
            user_info = await client.get(config["userinfo_url"])
            user_info = user_info.json()

            # For GitHub, get primary email
            if provider == "github" and not user_info.get("email"):
                emails = await client.get("https://api.github.com/user/emails")
                emails = emails.json()
                primary_email = next((e for e in emails if e.get("primary")), None)
                if primary_email:
                    user_info["email"] = primary_email["email"]
        """

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"OAuth error: {str(e)}")

    # Handle user creation/authentication - DISABLED (OAuth temporarily disabled)
    # result = handle_oauth_callback(provider, user_info, db)
    result = None  # Placeholder

    # Publish OAuth login event
    try:
        await publish_message_background(
            "user.oauth_login",
            f"User logged in via {provider}: {result['user']['email']}",
        )
    except Exception as e:
        logger.warning("Failed to publish OAuth login event to NATS: %s", e)
        # Continue even if NATS fails

    # For now, return JSON response. In production, you'd redirect to frontend
    return result


@router.post("/refresh", response_model=TokenPair)
@limiter.limit(RATE_LIMITS["auth_refresh"])
async def refresh_access_token(request: Request, refresh_request: TokenRefresh, db=Depends(get_db)):
    """Refresh access token using refresh token"""
    import time

    start_time = time.time()

    logger.debug("Token refresh request started at %s", start_time)

    try:
        # Validate refresh token
        payload = validate_refresh_token(refresh_request.refresh_token)
        email = payload.get("sub")

        if not email:
            logger.debug("No email in refresh token payload")
            raise HTTPException(status_code=401, detail="Invalid refresh token")

        logger.debug("Refreshing token for email: %s", email)

        # Verify user still exists in database and get their info
        db_user = await get_user_by_email(db, email)
        if not db_user:
            logger.debug("User not found during refresh: %s", email)
            raise HTTPException(status_code=401, detail="User not found")

        # Generate new token pair with user data for optimized auth
        new_access_token = create_access_token(data={"sub": email}, user_id=str(db_user.id), full_name=db_user.full_name)
        new_refresh_token = create_refresh_token(data={"sub": email})

        total_time = time.time() - start_time
        logger.debug("Token refresh completed successfully in %.2fs for %s", total_time, email)

        return {
            "access_token": new_access_token,
            "refresh_token": new_refresh_token,
            "token_type": "bearer",
        }

    except Exception as e:
        total_time = time.time() - start_time
        logger.debug("Token refresh failed after %.2fs: %s", total_time, e)
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=401, detail="Invalid refresh token")


@router.get("/debug-token")
async def debug_token(request: Request):
    """Debug endpoint to test token validation"""
    auth_header = request.headers.get("authorization")

    if not auth_header or not auth_header.startswith("Bearer "):
        return {"error": "No auth header", "header": auth_header}

    token = auth_header.split(" ")[1]

    try:
        payload = decode_access_token(token)
        return {
            "success": True,
            "email": payload.get("sub"),
            "type": payload.get("type"),
            "exp": payload.get("exp"),
            "token_length": len(token) if token else 0,
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "token_length": len(token) if token else 0,
            "header": auth_header[:50] + "..." if auth_header else None,
        }


from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class UserResponse(BaseModel):
    id: UUID
    email: str
    fullName: str
    provider: Optional[str] = None
    profileImageUrl: Optional[str] = None


@router.get("/me", response_model=UserResponse)
async def get_me(user: UserModel = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Get current user information using refactored dependency"""
    # Get user settings for profile image if available
    from sqlalchemy import select

    from app.models.user import UserSettings

    stmt = select(UserSettings).where(UserSettings.user_id == user.id)
    result = await db.execute(stmt)
    settings_obj = result.scalar_one_or_none()

    return {
        "id": user.id,
        "email": user.email,
        "fullName": user.full_name,
        "provider": user.provider,
        "profileImageUrl": settings_obj.profile_image_url if settings_obj else None,
    }
