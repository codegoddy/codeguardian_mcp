"""Google Calendar integration API endpoints."""

import os
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.logging_config import get_logger
from app.db.database import get_db
from app.models.google_calendar_integration import GoogleCalendarIntegration
from app.models.user import User
from app.services.google_calendar_service import GoogleCalendarService

logger = get_logger(__name__)
router = APIRouter(prefix="/api/integrations/google-calendar", tags=["google-calendar"])


@router.get("/auth")
async def get_auth_url(current_user: User = Depends(get_current_user)):
    """Get Google Calendar OAuth authorization URL."""
    try:
        # Use user ID as state for security
        state = str(current_user.id)
        auth_url = GoogleCalendarService.get_auth_url(state=state)

        return {"auth_url": auth_url}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate auth URL: {str(e)}",
        )


@router.get("/callback")
async def oauth_callback(
    code: str = Query(..., description="Authorization code from Google"),
    state: str = Query(..., description="State parameter (user ID) for security"),
    db: AsyncSession = Depends(get_db),
):
    """Handle Google Calendar OAuth callback."""
    try:
        # Get user from state parameter (no auth required for OAuth callback)
        try:
            user_id = UUID(state)
        except (ValueError, AttributeError):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid state parameter",
            )

        # Get user from database
        user_result = await db.execute(select(User).where(User.id == user_id))
        current_user = user_result.scalar_one_or_none()

        if not current_user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        # Exchange code for tokens
        token_data = await GoogleCalendarService.exchange_code_for_tokens(code)

        # Get user info
        user_info = await GoogleCalendarService.get_user_info(token_data["access_token"])

        # Check if integration already exists
        result = await db.execute(
            select(GoogleCalendarIntegration).where(GoogleCalendarIntegration.user_id == current_user.id)
        )
        integration = result.scalar_one_or_none()

        if integration:
            # Update existing integration
            integration.google_user_id = user_info["id"]
            integration.google_email = user_info["email"]
            integration.access_token = token_data["access_token"]
            integration.refresh_token = token_data.get("refresh_token", integration.refresh_token)
            integration.token_expiry = datetime.now(timezone.utc) + timedelta(seconds=token_data.get("expires_in", 3600))
            integration.sync_enabled = True
            integration.updated_at = datetime.now(timezone.utc)
        else:
            # Create new integration
            # Get or create DevHQ calendar
            temp_integration = GoogleCalendarIntegration(
                user_id=current_user.id,
                google_user_id=user_info["id"],
                google_email=user_info["email"],
                access_token=token_data["access_token"],
                refresh_token=token_data.get("refresh_token", ""),
                token_expiry=datetime.now(timezone.utc) + timedelta(seconds=token_data.get("expires_in", 3600)),
                calendar_id="primary",  # Temporary
                sync_enabled=True,
            )

            db.add(temp_integration)
            await db.flush()

            # Get or create dedicated calendar
            calendar_id = await GoogleCalendarService.get_or_create_devhq_calendar(temp_integration, db)

            temp_integration.calendar_id = calendar_id
            integration = temp_integration

        await db.commit()
        await db.refresh(integration)

        # Redirect to frontend with success
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
        return RedirectResponse(url=f"{frontend_url}/integrations?success=google_calendar_connected")

    except HTTPException:
        raise
    except Exception as e:
        logger.error("OAuth callback error: %s", e, exc_info=True)

        # Redirect to frontend with error
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
        error_message = str(e).replace(" ", "_")
        return RedirectResponse(url=f"{frontend_url}/integrations?error={error_message}")


@router.get("/status")
async def get_integration_status(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get Google Calendar integration status."""
    try:
        result = await db.execute(
            select(GoogleCalendarIntegration).where(GoogleCalendarIntegration.user_id == current_user.id)
        )
        integration = result.scalar_one_or_none()

        if not integration:
            return {"connected": False}

        return {
            "connected": True,
            "google_email": integration.google_email,
            "calendar_id": integration.calendar_id,
            "sync_enabled": integration.sync_enabled,
            "last_sync_at": (integration.last_sync_at.isoformat() if integration.last_sync_at else None),
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get integration status: {str(e)}",
        )


@router.delete("")
async def disconnect_google_calendar(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Disconnect Google Calendar integration."""
    try:
        result = await db.execute(
            select(GoogleCalendarIntegration).where(GoogleCalendarIntegration.user_id == current_user.id)
        )
        integration = result.scalar_one_or_none()

        if not integration:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No Google Calendar integration found",
            )

        await db.delete(integration)
        await db.commit()

        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to disconnect Google Calendar: {str(e)}",
        )


@router.post("/sync")
async def manual_sync(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Manually sync planned blocks to Google Calendar."""
    try:
        result = await GoogleCalendarService.sync_all_planned_blocks(user_id=current_user.id, db=db)

        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to sync to Google Calendar: {str(e)}",
        )
