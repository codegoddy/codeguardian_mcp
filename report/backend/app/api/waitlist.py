from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.logging_config import get_logger
from app.db.database import get_db
from app.models.user import User
from app.models.waitlist import Waitlist
from app.schemas.waitlist import WaitlistCountResponse, WaitlistCreate, WaitlistResponse
from app.utils.nats_client import publish_event

router = APIRouter(prefix="/api/waitlist", tags=["waitlist"])
logger = get_logger(__name__)


@router.post("", response_model=WaitlistResponse, status_code=status.HTTP_201_CREATED)
async def add_to_waitlist(waitlist_data: WaitlistCreate, db: AsyncSession = Depends(get_db)):
    """
    Add a new user to the waitlist.
    Public endpoint - no authentication required.
    """
    try:
        # Check if email already exists
        result = await db.execute(select(Waitlist).filter(Waitlist.email == waitlist_data.email))
        existing = result.scalar_one_or_none()

        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This email is already on the waitlist",
            )

        # Create new waitlist entry
        waitlist_entry = Waitlist(
            email=waitlist_data.email,
            full_name=waitlist_data.full_name,
            company=waitlist_data.company,
        )

        db.add(waitlist_entry)
        await db.commit()
        await db.refresh(waitlist_entry)

        # Publish NATS event to send confirmation email
        try:
            await publish_event(
                "email.waitlist_confirmation",
                {
                    "email": waitlist_entry.email,
                    "full_name": waitlist_entry.full_name,
                },
                background=True,
            )
            logger.info("Published waitlist confirmation event for %s", waitlist_entry.email)
        except Exception as e:
            # Log but don't fail the request if NATS is unavailable
            logger.warning("Failed to publish waitlist confirmation event: %s", e)

        return waitlist_entry

    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This email is already on the waitlist",
        )
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to add to waitlist: {str(e)}",
        )


@router.get("", response_model=List[WaitlistResponse])
async def get_waitlist(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get all waitlist entries.
    Requires authentication - admin only.
    """
    result = await db.execute(select(Waitlist).order_by(Waitlist.created_at.desc()).offset(skip).limit(limit))
    waitlist_entries = result.scalars().all()
    return waitlist_entries


@router.get("/count", response_model=WaitlistCountResponse)
async def get_waitlist_count(db: AsyncSession = Depends(get_db)):
    """
    Get waitlist statistics.
    Public endpoint - no authentication required.
    """
    total_count = await db.scalar(select(func.count()).select_from(Waitlist))
    notified_count = await db.scalar(select(func.count()).select_from(Waitlist).filter(Waitlist.notified == True))

    # Handle None results if table is empty (though count usually returns 0)
    total_count = total_count or 0
    notified_count = notified_count or 0

    pending_count = total_count - notified_count

    return WaitlistCountResponse(count=total_count, notified_count=notified_count, pending_count=pending_count)
