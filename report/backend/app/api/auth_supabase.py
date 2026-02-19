"""
Supabase Auth with Custom Brevo Emails
All emails go through YOUR Brevo service with YOUR templates
"""

import hashlib
import os
import random
import secrets
import string
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession
from supabase import Client, create_client

from app.core.auth import get_current_user
from app.core.config import settings
from app.core.logging_config import get_logger
from app.db.database import get_db
from app.models.user import User
from app.utils.email import send_otp_email, send_password_reset_email, send_welcome_email

logger = get_logger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Initialize Supabase
supabase_url = os.getenv("SUPABASE_URL", "")
supabase_service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")  # Use service role for admin operations
supabase: Client = create_client(supabase_url, supabase_service_key)

# In-memory token store (use Redis in production)
verification_tokens = {}
password_reset_tokens = {}


class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str


class VerifyRequest(BaseModel):
    email: EmailStr
    otp: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    token: str
    new_password: str


def generate_secure_token() -> str:
    """Generate secure random token"""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """Hash token for storage"""
    return hashlib.sha256(token.encode()).hexdigest()


@router.post("/signup")
async def signup(data: SignupRequest, response: Response):
    """
    Sign up user with Supabase Auth but send verification email via YOUR Brevo
    """
    try:
        # 1. Create user in Supabase (email unconfirmed)
        auth_response = supabase.auth.admin.create_user(
            {
                "email": data.email,
                "password": data.password,
                "email_confirm": False,  # Don't auto-confirm
                "user_metadata": {"full_name": data.full_name},
            }
        )

        user_id = auth_response.user.id

        # 2. Generate OTP (6-digit code)
        otp = "".join(random.choices(string.digits, k=6))

        # Store OTP and password temporarily (expires in 24 hours)
        # Password is needed for auto-login after verification
        verification_tokens[otp] = {
            "email": data.email,
            "user_id": user_id,
            "full_name": data.full_name,
            "password": data.password,  # Temporarily store for auto-login
            "expires": datetime.utcnow() + timedelta(hours=24),
        }

        # 3. Send YOUR custom OTP email via Brevo
        await send_custom_verification_email(to_email=data.email, full_name=data.full_name, otp=otp)

        logger.info(f"Signup initiated for {data.email}, verification email sent")

        return {"success": True, "message": "Check your email to verify your account"}

    except Exception as e:
        logger.error(f"Signup error: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/verify")
async def verify_email(data: VerifyRequest):
    """
    Verify email using OTP, then confirm in Supabase
    """
    try:
        logger.info(f"Verifying OTP for {data.email}, otp: {data.otp}")

        # 1. Look up OTP
        token_data = verification_tokens.get(data.otp)

        if not token_data:
            logger.warning(f"OTP not found for {data.email}. Available tokens: {list(verification_tokens.keys())}")
            raise HTTPException(status_code=400, detail="Invalid or expired code")

        logger.info(f"Found token data: {token_data}")

        if token_data["email"] != data.email:
            logger.warning(f"Email mismatch: expected {token_data['email']}, got {data.email}")
            raise HTTPException(status_code=400, detail="Email mismatch")

        if datetime.utcnow() > token_data["expires"]:
            # Clean up expired token
            del verification_tokens[data.otp]
            raise HTTPException(status_code=400, detail="Code expired")

        # 2. Confirm user in Supabase
        user_id = token_data["user_id"]
        password = token_data.get("password")  # Get temporarily stored password

        supabase.auth.admin.update_user_by_id(user_id, {"email_confirm": True})

        # 3. Clean up OTP
        del verification_tokens[data.otp]

        # 4. Send welcome email via YOUR Brevo
        await send_welcome_email(
            to_email=data.email,
            username=token_data.get("full_name", data.email.split("@")[0]),
        )

        logger.info(f"Email verified for {data.email}")

        # 5. Auto-login: Sign in with Supabase to get valid session tokens
        if password:
            try:
                auth_response = supabase.auth.sign_in_with_password({"email": data.email, "password": password})
                session = auth_response.session

                return {
                    "success": True,
                    "message": "Email verified successfully. Welcome to DevHQ!",
                    "access_token": session.access_token,
                    "refresh_token": session.refresh_token,
                    "token_type": "bearer",
                }
            except Exception as e:
                logger.error(f"Auto-login failed after verification: {e}")
                # If auto-login fails, still return success but without tokens
                return {
                    "success": True,
                    "message": "Email verified successfully. Please log in.",
                }
        else:
            # No password stored (shouldn't happen), return success without tokens
            return {
                "success": True,
                "message": "Email verified successfully. Please log in.",
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Verification error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Verification failed")


@router.post("/login")
async def login(data: LoginRequest, response: Response):
    """
    Login with Supabase Auth - sets cookies automatically
    """
    try:
        # Sign in with Supabase
        auth_response = supabase.auth.sign_in_with_password({"email": data.email, "password": data.password})

        # Supabase JS client handles cookies automatically on frontend
        # For backend, we return the session data
        session = auth_response.session

        return {
            "access_token": session.access_token,
            "refresh_token": session.refresh_token,
            "token_type": "bearer",
        }

    except Exception as e:
        logger.error(f"Login error: {e}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")


@router.post("/forgot-password")
async def forgot_password(data: ForgotPasswordRequest):
    """
    Send password reset OTP via YOUR Brevo
    Uses OTP (not magic link) - consistent with your existing email flow
    """
    try:
        # Check if user exists in Supabase (don't reveal if not)
        try:
            user = supabase.auth.admin.get_user_by_email(data.email)
            if not user:
                return {
                    "success": True,
                    "message": "If an account exists, a reset email will be sent",
                }
        except:
            # Don't reveal if email exists
            return {
                "success": True,
                "message": "If an account exists, a reset email will be sent",
            }

        # Generate OTP (consistent with your existing flow)
        otp = "".join(random.choices(string.digits, k=6))

        # Store OTP hashed
        hashed_otp = hashlib.sha256(otp.encode()).hexdigest()
        password_reset_tokens[hashed_otp] = {
            "email": data.email,
            "user_id": user.id,
            "expires": datetime.utcnow() + timedelta(minutes=10),
        }

        # Send YOUR custom OTP email via Brevo
        await send_password_reset_email(to_email=data.email, otp=otp)

        logger.info(f"Password reset OTP sent to {data.email}")

        return {
            "success": True,
            "message": "If an account exists, a reset email will be sent",
        }

    except Exception as e:
        logger.error(f"Forgot password error: {e}", exc_info=True)
        # Don't reveal errors
        return {
            "success": True,
            "message": "If an account exists, a reset email will be sent",
        }


@router.post("/reset-password")
async def reset_password(data: ResetPasswordRequest):
    """
    Reset password using OTP verification
    Consistent with your existing OTP-based flow
    """
    try:
        # Verify OTP
        hashed_otp = hashlib.sha256(data.token.encode()).hexdigest()
        token_data = password_reset_tokens.get(hashed_otp)

        if not token_data or token_data["email"] != data.email:
            raise HTTPException(status_code=400, detail="Invalid or expired code")

        if datetime.utcnow() > token_data["expires"]:
            del password_reset_tokens[hashed_otp]
            raise HTTPException(status_code=400, detail="Code expired. Please request a new one.")

        # Update password in Supabase using Admin API
        supabase.auth.admin.update_user_by_id(token_data["user_id"], {"password": data.new_password})

        # Clean up used OTP
        del password_reset_tokens[hashed_otp]

        logger.info(f"Password reset successful for {data.email}")

        return {"success": True, "message": "Password updated successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Reset password error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Password reset failed")


@router.post("/logout")
async def logout(request: Request):
    """
    Logout - clear Supabase session
    """
    try:
        # Get token from cookie or header
        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
            supabase.auth.sign_out(token)

        return {"success": True, "message": "Logged out"}
    except:
        # Ignore errors on logout
        return {"success": True, "message": "Logged out"}


class GitHubAutoSetupRequest(BaseModel):
    """Request to auto-setup GitHub integration after OAuth signup"""

    github_access_token: str
    github_username: str


@router.post("/github-auto-setup")
async def github_auto_setup(
    data: GitHubAutoSetupRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Auto-setup GitHub integration when user signs up with GitHub OAuth.
    This is called automatically after GitHub OAuth signup to pre-configure
    the GitHub integration without requiring manual setup.
    """
    from datetime import datetime

    from sqlalchemy import select

    from app.core.security import encrypt_token
    from app.models.git_integration import GitIntegration
    from app.services.activity_service import create_activity

    try:
        # Check if user already has a GitHub integration
        result = await db.execute(
            select(GitIntegration).where(
                GitIntegration.user_id == current_user.id,
                GitIntegration.platform == "github",
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            # Update existing integration with new token
            existing.access_token = encrypt_token(data.github_access_token)
            existing.username = data.github_username
            existing.is_active = True
            existing.connected_at = datetime.utcnow()
            await db.commit()
            await db.refresh(existing)
            logger.info(f"Updated GitHub integration for user {current_user.id}")
            return {
                "status": "success",
                "message": "GitHub integration updated",
                "integration_id": str(existing.id),
                "username": data.github_username,
            }

        # Create new GitHub integration
        integration = GitIntegration(
            user_id=current_user.id,
            platform="github",
            username=data.github_username,
            access_token=encrypt_token(data.github_access_token),
            is_active=True,
            connected_at=datetime.utcnow(),
        )

        db.add(integration)
        await db.commit()
        await db.refresh(integration)

        logger.info(f"Auto-created GitHub integration for user {current_user.id}")

        # Log activity for GitHub connection
        try:
            await create_activity(
                db=db,
                user_id=current_user.id,
                entity_type="integration",
                entity_id=integration.id,
                action="connected",
                title="Connected GitHub",
                description=f"Auto-configured via GitHub OAuth signup. Username: {data.github_username}",
            )
        except Exception as e:
            logger.warning("Failed to log GitHub auto-setup activity: %s", e)

        return {
            "status": "success",
            "message": "GitHub integration auto-configured",
            "integration_id": str(integration.id),
            "username": data.github_username,
        }

    except Exception as e:
        logger.error(f"GitHub auto-setup error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to setup GitHub integration: {str(e)}",
        )


class GoogleCalendarAutoSetupRequest(BaseModel):
    """Request to auto-setup Google Calendar integration after OAuth signup"""

    google_access_token: str
    google_refresh_token: Optional[str] = None
    google_user_id: str
    google_email: str
    expires_at: Optional[int] = None  # Unix timestamp


@router.post("/google-calendar-auto-setup")
async def google_calendar_auto_setup(
    data: GoogleCalendarAutoSetupRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Auto-setup Google Calendar integration when user signs up with Google OAuth.
    This is called automatically after Google OAuth signup to pre-configure
    the Google Calendar integration without requiring manual setup.
    """
    from datetime import datetime, timedelta, timezone
    from uuid import uuid4

    from sqlalchemy import select

    from app.models.google_calendar_integration import GoogleCalendarIntegration
    from app.services.activity_service import create_activity
    from app.services.google_calendar_service import GoogleCalendarService

    try:
        # Check if user already has a Google Calendar integration
        result = await db.execute(
            select(GoogleCalendarIntegration).where(GoogleCalendarIntegration.user_id == current_user.id)
        )
        existing = result.scalar_one_or_none()

        # Calculate token expiry
        if data.expires_at:
            token_expiry = datetime.fromtimestamp(data.expires_at, tz=timezone.utc)
        else:
            token_expiry = datetime.now(timezone.utc) + timedelta(hours=1)

        if existing:
            # Update existing integration
            existing.google_user_id = data.google_user_id
            existing.google_email = data.google_email
            existing.access_token = data.google_access_token
            if data.google_refresh_token:
                existing.refresh_token = data.google_refresh_token
            existing.token_expiry = token_expiry
            existing.sync_enabled = True
            existing.updated_at = datetime.now(timezone.utc)
            await db.commit()
            await db.refresh(existing)
            logger.info(f"Updated Google Calendar integration for user {current_user.id}")
            return {
                "status": "success",
                "message": "Google Calendar integration updated",
                "integration_id": str(existing.id),
                "google_email": data.google_email,
            }

        # Create new integration
        # Note: We set calendar_id to "primary" temporarily, user can configure later
        # The full calendar creation requires additional OAuth scopes
        integration = GoogleCalendarIntegration(
            user_id=current_user.id,
            google_user_id=data.google_user_id,
            google_email=data.google_email,
            access_token=data.google_access_token,
            refresh_token=data.google_refresh_token or "",  # May be empty for implicit flow
            token_expiry=token_expiry,
            calendar_id="primary",  # Default to primary calendar
            sync_enabled=True,
        )

        db.add(integration)
        await db.commit()
        await db.refresh(integration)

        logger.info(f"Auto-created Google Calendar integration for user {current_user.id}")

        # Log activity for Google Calendar connection
        try:
            await create_activity(
                db=db,
                user_id=current_user.id,
                entity_type="integration",
                entity_id=integration.id,
                action="connected",
                title="Connected Google Calendar",
                description=f"Auto-configured via Google OAuth signup. Email: {data.google_email}",
            )
        except Exception as e:
            logger.warning("Failed to log Google Calendar auto-setup activity: %s", e)

        return {
            "status": "success",
            "message": "Google Calendar integration auto-configured",
            "integration_id": str(integration.id),
            "google_email": data.google_email,
        }

    except Exception as e:
        logger.error(f"Google Calendar auto-setup error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to setup Google Calendar integration: {str(e)}",
        )


# Helper function for your custom verification email
async def send_custom_verification_email(to_email: str, full_name: str, otp: str):
    """
    Send YOUR custom verification email via Brevo
    Uses the existing OTP verification template
    """
    from app.utils.email import send_email
    from app.utils.email_templates import render_otp_email

    # Use OTP verification template
    html_content = render_otp_email(otp=otp, app_name=settings.app_name)

    await send_email(
        to_email=to_email,
        subject="Verify your DevHQ account",
        html_content=html_content,
    )
