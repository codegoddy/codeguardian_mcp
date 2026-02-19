"""
Google Calendar Service

Handles Google Calendar OAuth integration and event synchronization.
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
from uuid import UUID

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging_config import get_logger
from app.models.deliverable import Deliverable
from app.models.google_calendar_integration import GoogleCalendarIntegration
from app.models.planned_time_block import PlannedTimeBlock
from app.models.project import Project

logger = get_logger(__name__)


class GoogleCalendarService:
    """Service for Google Calendar integration"""

    GOOGLE_OAUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
    GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
    GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3"

    @staticmethod
    def get_auth_url(state: str = None) -> str:
        """Generate Google OAuth authorization URL"""
        params = {
            "client_id": settings.GOOGLE_CLIENT_ID,
            "redirect_uri": settings.GOOGLE_REDIRECT_URI,
            "response_type": "code",
            "scope": "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events",
            "access_type": "offline",
            "prompt": "consent",
        }

        if state:
            params["state"] = state

        query_string = "&".join([f"{k}={v}" for k, v in params.items()])
        return f"{GoogleCalendarService.GOOGLE_OAUTH_URL}?{query_string}"

    @staticmethod
    async def exchange_code_for_tokens(code: str) -> Dict[str, Any]:
        """Exchange authorization code for access and refresh tokens"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                GoogleCalendarService.GOOGLE_TOKEN_URL,
                data={
                    "code": code,
                    "client_id": settings.GOOGLE_CLIENT_ID,
                    "client_secret": settings.GOOGLE_CLIENT_SECRET,
                    "redirect_uri": settings.GOOGLE_REDIRECT_URI,
                    "grant_type": "authorization_code",
                },
            )

            if response.status_code != 200:
                raise ValueError(f"Failed to exchange code: {response.text}")

            return response.json()

    @staticmethod
    async def get_user_info(access_token: str) -> Dict[str, Any]:
        """Get Google user information from Calendar API settings"""
        async with httpx.AsyncClient() as client:
            # Get primary calendar to extract email and timezone
            cal_response = await client.get(
                f"{GoogleCalendarService.GOOGLE_CALENDAR_API}/calendars/primary",
                headers={"Authorization": f"Bearer {access_token}"},
            )

            if cal_response.status_code != 200:
                raise ValueError(f"Failed to get calendar info: {cal_response.text}")

            cal_data = cal_response.json()
            # Return format compatible with existing code
            return {
                "id": cal_data.get("id", ""),
                "email": cal_data.get("id", ""),  # Primary calendar ID is the user's email
                "timezone": cal_data.get("timeZone", "UTC"),  # Get user's timezone
            }

    @staticmethod
    async def refresh_access_token(integration: GoogleCalendarIntegration, db: AsyncSession) -> str:
        """Refresh the access token using refresh token"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                GoogleCalendarService.GOOGLE_TOKEN_URL,
                data={
                    "refresh_token": integration.refresh_token,
                    "client_id": settings.GOOGLE_CLIENT_ID,
                    "client_secret": settings.GOOGLE_CLIENT_SECRET,
                    "grant_type": "refresh_token",
                },
            )

            if response.status_code != 200:
                raise ValueError(f"Failed to refresh token: {response.text}")

            token_data = response.json()

            # Update integration
            integration.access_token = token_data["access_token"]
            integration.token_expiry = datetime.now(timezone.utc) + timedelta(seconds=token_data.get("expires_in", 3600))
            integration.updated_at = datetime.now(timezone.utc)

            await db.commit()
            await db.refresh(integration)

            return integration.access_token

    @staticmethod
    async def get_valid_access_token(integration: GoogleCalendarIntegration, db: AsyncSession) -> str:
        """Get a valid access token, refreshing if necessary"""
        # Check if token is expired or will expire in next 5 minutes
        if integration.token_expiry and integration.token_expiry <= datetime.now(timezone.utc) + timedelta(minutes=5):
            return await GoogleCalendarService.refresh_access_token(integration, db)

        return integration.access_token

    @staticmethod
    async def get_or_create_devhq_calendar(integration: GoogleCalendarIntegration, db: AsyncSession) -> str:
        """Get or create a dedicated DevHQ calendar"""
        access_token = await GoogleCalendarService.get_valid_access_token(integration, db)

        async with httpx.AsyncClient() as client:
            # List calendars to check if DevHQ calendar exists
            response = await client.get(
                f"{GoogleCalendarService.GOOGLE_CALENDAR_API}/users/me/calendarList",
                headers={"Authorization": f"Bearer {access_token}"},
            )

            if response.status_code == 200:
                calendars = response.json().get("items", [])
                for calendar in calendars:
                    if calendar.get("summary") == "DevHQ Work Planning":
                        return calendar["id"]

            # Create new calendar
            response = await client.post(
                f"{GoogleCalendarService.GOOGLE_CALENDAR_API}/calendars",
                headers={"Authorization": f"Bearer {access_token}"},
                json={
                    "summary": "DevHQ Work Planning",
                    "description": "Planned work sessions from DevHQ",
                    "timeZone": "UTC",
                },
            )

            if response.status_code != 200:
                raise ValueError(f"Failed to create calendar: {response.text}")

            calendar_data = response.json()
            return calendar_data["id"]

    @staticmethod
    async def create_event(
        integration: GoogleCalendarIntegration,
        planned_block: PlannedTimeBlock,
        db: AsyncSession,
    ) -> str:
        """Create a Google Calendar event for a planned block"""
        access_token = await GoogleCalendarService.get_valid_access_token(integration, db)

        # Get deliverable and project info
        deliverable_result = await db.execute(select(Deliverable).where(Deliverable.id == planned_block.deliverable_id))
        deliverable = deliverable_result.scalar_one_or_none()

        project_result = await db.execute(select(Project).where(Project.id == planned_block.project_id))
        project = project_result.scalar_one_or_none()

        if not deliverable or not project:
            raise ValueError("Deliverable or project not found")

        # Build event - use calendar's timezone from integration
        start_datetime = datetime.combine(planned_block.planned_date, planned_block.start_time or datetime.min.time())
        end_datetime = datetime.combine(
            planned_block.planned_date,
            planned_block.end_time or (datetime.min + timedelta(hours=float(planned_block.planned_hours))).time(),
        )

        # Get calendar info to get timezone
        cal_response = await httpx.AsyncClient().get(
            f"{GoogleCalendarService.GOOGLE_CALENDAR_API}/calendars/{integration.calendar_id}",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        user_timezone = "UTC"
        if cal_response.status_code == 200:
            user_timezone = cal_response.json().get("timeZone", "UTC")

        event = {
            "summary": f"DevHQ: {deliverable.title}",
            "description": f"Work on {deliverable.title} for {project.name}\n\nTracking Code: {deliverable.tracking_code}\n\nPlanned: {planned_block.planned_hours}h\n\n{planned_block.description or ''}",
            "start": {
                "dateTime": start_datetime.isoformat(),
                "timeZone": user_timezone,
            },
            "end": {"dateTime": end_datetime.isoformat(), "timeZone": user_timezone},
            "reminders": {
                "useDefault": False,
                "overrides": [
                    {"method": "popup", "minutes": 15},
                    {"method": "email", "minutes": 60},
                ],
            },
            "colorId": "9",  # Blue
            "extendedProperties": {
                "private": {
                    "devhq_block_id": str(planned_block.id),
                    "devhq_deliverable_id": str(deliverable.id),
                }
            },
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{GoogleCalendarService.GOOGLE_CALENDAR_API}/calendars/{integration.calendar_id}/events",
                headers={"Authorization": f"Bearer {access_token}"},
                json=event,
            )

            if response.status_code not in [200, 201]:
                raise ValueError(f"Failed to create event: {response.text}")

            event_data = response.json()
            return event_data["id"]

    @staticmethod
    async def update_event(
        integration: GoogleCalendarIntegration,
        planned_block: PlannedTimeBlock,
        db: AsyncSession,
    ) -> bool:
        """Update a Google Calendar event"""
        if not planned_block.google_calendar_event_id:
            return False

        access_token = await GoogleCalendarService.get_valid_access_token(integration, db)

        # Get deliverable and project info
        deliverable_result = await db.execute(select(Deliverable).where(Deliverable.id == planned_block.deliverable_id))
        deliverable = deliverable_result.scalar_one_or_none()

        project_result = await db.execute(select(Project).where(Project.id == planned_block.project_id))
        project = project_result.scalar_one_or_none()

        if not deliverable or not project:
            return False

        # Build updated event - use calendar's timezone from integration
        start_datetime = datetime.combine(planned_block.planned_date, planned_block.start_time or datetime.min.time())
        end_datetime = datetime.combine(
            planned_block.planned_date,
            planned_block.end_time or (datetime.min + timedelta(hours=float(planned_block.planned_hours))).time(),
        )

        # Get calendar info to get timezone
        cal_response = await httpx.AsyncClient().get(
            f"{GoogleCalendarService.GOOGLE_CALENDAR_API}/calendars/{integration.calendar_id}",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        user_timezone = "UTC"
        if cal_response.status_code == 200:
            user_timezone = cal_response.json().get("timeZone", "UTC")

        event = {
            "summary": f"DevHQ: {deliverable.title}",
            "description": f"Work on {deliverable.title} for {project.name}\n\nTracking Code: {deliverable.tracking_code}\n\nPlanned: {planned_block.planned_hours}h\n\n{planned_block.description or ''}",
            "start": {
                "dateTime": start_datetime.isoformat(),
                "timeZone": user_timezone,
            },
            "end": {"dateTime": end_datetime.isoformat(), "timeZone": user_timezone},
        }

        async with httpx.AsyncClient() as client:
            response = await client.patch(
                f"{GoogleCalendarService.GOOGLE_CALENDAR_API}/calendars/{integration.calendar_id}/events/{planned_block.google_calendar_event_id}",
                headers={"Authorization": f"Bearer {access_token}"},
                json=event,
            )

            return response.status_code == 200

    @staticmethod
    async def delete_event(integration: GoogleCalendarIntegration, event_id: str, db: AsyncSession) -> bool:
        """Delete a Google Calendar event"""
        access_token = await GoogleCalendarService.get_valid_access_token(integration, db)

        async with httpx.AsyncClient() as client:
            response = await client.delete(
                f"{GoogleCalendarService.GOOGLE_CALENDAR_API}/calendars/{integration.calendar_id}/events/{event_id}",
                headers={"Authorization": f"Bearer {access_token}"},
            )

            return response.status_code == 204

    @staticmethod
    async def sync_all_planned_blocks(user_id: UUID, db: AsyncSession) -> Dict[str, int]:
        """Sync all planned blocks to Google Calendar"""
        # Get integration
        integration_result = await db.execute(
            select(GoogleCalendarIntegration).where(GoogleCalendarIntegration.user_id == user_id)
        )
        integration = integration_result.scalar_one_or_none()

        if not integration or not integration.sync_enabled:
            return {"synced_events": 0, "created": 0, "updated": 0, "deleted": 0}

        # Get all planned blocks
        blocks_result = await db.execute(select(PlannedTimeBlock).where(PlannedTimeBlock.user_id == user_id))
        blocks = blocks_result.scalars().all()

        created = 0
        updated = 0

        for block in blocks:
            if block.google_calendar_event_id:
                # Update existing event
                success = await GoogleCalendarService.update_event(integration, block, db)
                if success:
                    updated += 1
            else:
                # Create new event
                try:
                    event_id = await GoogleCalendarService.create_event(integration, block, db)
                    block.google_calendar_event_id = event_id
                    created += 1
                except Exception as e:
                    logger.error("Error creating event for block %s: %s", block.id, e)

        if created > 0:
            await db.commit()

        # Update last sync time
        integration.last_sync_at = datetime.now(timezone.utc)
        await db.commit()

        return {
            "synced_events": created + updated,
            "created": created,
            "updated": updated,
            "deleted": 0,
        }
