"""
Support API endpoints for contact form and support requests
"""

from datetime import datetime

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr

from app.core.logging_config import get_logger
from app.utils.email import send_support_request_notification

logger = get_logger(__name__)
router = APIRouter()


class SupportContactRequest(BaseModel):
    """Support contact form request model"""

    name: str
    email: EmailStr
    subject: str
    message: str


@router.post("/contact")
async def submit_support_request(request: SupportContactRequest):
    """
    Submit a support request from the contact form.
    Sends an email notification to support@devhq.site
    """
    try:
        # Format timestamp
        submitted_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S UTC")

        # Send notification to support team
        await send_support_request_notification(
            sender_name=request.name,
            sender_email=request.email,
            subject=request.subject,
            message=request.message,
            submitted_at=submitted_at,
        )

        return {
            "message": "Support request submitted successfully",
            "submitted_at": submitted_at,
        }

    except Exception as e:
        logger.error("[SUPPORT_API] Error submitting support request: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to submit support request. Please try again later.",
        )
