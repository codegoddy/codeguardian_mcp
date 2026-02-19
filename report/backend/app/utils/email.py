import asyncio
from typing import Optional

import brevo_python
import httpx

from app.core.config import settings
from app.core.logging_config import get_logger
from app.utils.email_templates import (
    render_otp_email,
    render_password_reset_email,
    render_welcome_email,
)

logger = get_logger(__name__)

# Global HTTP client for connection pooling and reuse
_http_client: Optional[httpx.AsyncClient] = None
_client_lock = asyncio.Lock()


async def get_http_client() -> httpx.AsyncClient:
    """Get or create a shared HTTP client with connection pooling."""
    global _http_client

    async with _client_lock:
        if _http_client is None or _http_client.is_closed:
            _http_client = httpx.AsyncClient(
                timeout=httpx.Timeout(10.0, connect=5.0),  # 10s total, 5s connect
                limits=httpx.Limits(
                    max_keepalive_connections=20,
                    max_connections=50,
                    keepalive_expiry=30.0,
                ),
                http2=True,  # Enable HTTP/2 for better performance
            )
        return _http_client


async def close_http_client():
    """Close the shared HTTP client."""
    global _http_client
    if _http_client and not _http_client.is_closed:
        await _http_client.aclose()
        _http_client = None


async def send_otp_email(to_email: str, otp: str):
    """Send OTP verification email using template."""
    return await send_email(
        to_email=to_email,
        subject="Your OTP Code",
        html_content=render_otp_email(otp=otp, app_name=settings.app_name),
    )


async def send_welcome_email(to_email: str, username: str, login_url: str = "https://devhq.com/login"):
    """Send welcome email to new users."""
    return await send_email(
        to_email=to_email,
        subject=f"Welcome to {settings.app_name}!",
        html_content=render_welcome_email(username=username, app_name=settings.app_name, login_url=login_url),
    )


async def send_password_reset_email(to_email: str, otp: str):
    """Send password reset email with OTP."""
    return await send_email(
        to_email=to_email,
        subject="Password Reset Code",
        html_content=render_password_reset_email(otp=otp, app_name=settings.app_name),
    )


async def send_password_reset_link_email(to_email: str, reset_url: str):
    """Send password reset email with magic link (for Supabase integration)."""
    from app.utils.email_templates import render_password_reset_link_email

    return await send_email(
        to_email=to_email,
        subject="Reset Your DevHQ Password",
        html_content=render_password_reset_link_email(reset_url=reset_url, app_name=settings.app_name),
    )


async def send_email(
    to_email: str,
    subject: str,
    html_content: str,
    attachment_url: Optional[str] = None,
    attachment_name: Optional[str] = None,
):
    """
    Generic email sending function using Brevo with async HTTP client.
    Uses connection pooling for faster email delivery.

    Args:
        to_email: Recipient email address
        subject: Email subject
        html_content: HTML email body
        attachment_url: Optional URL of file to attach (e.g., Cloudinary PDF URL)
        attachment_name: Optional name for the attachment file
    """
    if not settings.brevo_api_key:
        error_msg = "Brevo API key not configured. Email cannot be sent. Please set BREVO_API_KEY environment variable."
        logger.error(error_msg)
        raise Exception(error_msg)

    try:
        logger.info("Starting email send to %s - %s", to_email, subject)
        # Get shared HTTP client for connection reuse
        client = await get_http_client()
        logger.debug("HTTP client obtained")

        # Prepare email payload
        payload = {
            "sender": {"email": settings.email_from, "name": settings.email_from_name},
            "to": [{"email": to_email}],
            "subject": subject,
            "htmlContent": html_content,
        }

        # Add attachment if provided (Brevo supports attachments via URL)
        if attachment_url and attachment_name:
            payload["attachment"] = [{"url": attachment_url, "name": attachment_name}]
            logger.debug("Added attachment via URL: %s", attachment_name)

        logger.debug("Sending request to Brevo API...")
        # Send email via Brevo API with async HTTP (with 30 second timeout)
        response = await client.post(
            "https://api.brevo.com/v3/smtp/email",
            json=payload,
            headers={
                "api-key": settings.brevo_api_key,
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            timeout=30.0,  # 30 second timeout for Brevo API
        )
        logger.debug("Brevo API response received: %s", response.status_code)

        if response.status_code in (200, 201):
            attachment_log = f" with attachment: {attachment_name}" if attachment_url else ""
            logger.info("Email sent to %s - %s%s", to_email, subject, attachment_log)
            return response.json()
        else:
            logger.error(
                "Failed to send email to %s: %s - %s",
                to_email,
                response.status_code,
                response.text,
            )
            return None

    except httpx.TimeoutException as e:
        logger.warning("Timeout sending email to %s after 30 seconds", to_email)
        logger.info("Note: Email may still be queued by Brevo and could arrive later")
        return None
    except Exception as e:
        logger.error("Exception sending email to %s: %s", to_email, e, exc_info=True)
        return None


async def send_contract_signing_email(
    to_email: str,
    client_name: str,
    developer_name: str,
    developer_email: str,
    project_name: str,
    project_budget: str,
    currency: str,
    signing_url: str,
):
    """Send contract signing invitation email."""
    from app.utils.email_templates import render_contract_signing_invitation

    return await send_email(
        to_email=to_email,
        subject=f"Contract Ready for Signature - {project_name}",
        html_content=render_contract_signing_invitation(
            client_name=client_name,
            developer_name=developer_name,
            developer_email=developer_email,
            project_name=project_name,
            project_budget=project_budget,
            currency=currency,
            signing_url=signing_url,
            app_name=settings.app_name,
        ),
    )


async def send_contract_signed_email(
    to_email: str,
    recipient_name: str,
    project_name: str,
    signer_name: str,
    signed_date: str,
    is_developer: bool,
    project_url: str = "",
    pdf_url: str = None,
):
    """Send contract signed confirmation email with PDF attachment."""
    from app.utils.email_templates import render_contract_signed_confirmation

    # Note: PDF attachment functionality would require additional Brevo configuration
    # For now, we'll include the PDF URL in the email
    # TODO: Implement PDF attachment when Brevo supports it

    return await send_email(
        to_email=to_email,
        subject=f"Contract Signed - {project_name}",
        html_content=render_contract_signed_confirmation(
            recipient_name=recipient_name,
            project_name=project_name,
            signer_name=signer_name,
            signed_date=signed_date,
            is_developer=is_developer,
            project_url=project_url,
            app_name=settings.app_name,
        ),
    )


async def send_client_portal_welcome_email(
    to_email: str,
    client_name: str,
    developer_name: str,
    project_name: str,
    magic_link: str,
):
    """Send client portal welcome email with magic link access."""
    from app.utils.email_templates import render_client_portal_welcome

    return await send_email(
        to_email=to_email,
        subject=f"Welcome to {project_name} Client Portal - {settings.app_name}",
        html_content=render_client_portal_welcome(
            client_name=client_name,
            developer_name=developer_name,
            project_name=project_name,
            magic_link=magic_link,
            app_name=settings.app_name,
        ),
    )


async def send_client_portal_access_link_email(
    to_email: str,
    client_name: str,
    developer_name: str,
    project_name: str,
    magic_link: str,
):
    """Send client portal access link email."""
    from app.utils.email_templates import render_client_portal_access_link

    return await send_email(
        to_email=to_email,
        subject=f"Your Client Portal Access - {project_name}",
        html_content=render_client_portal_access_link(
            client_name=client_name,
            developer_name=developer_name,
            project_name=project_name,
            magic_link=magic_link,
            app_name=settings.app_name,
        ),
    )


async def send_payment_verification_request(
    to_email: str,
    developer_name: str,
    client_name: str,
    invoice_number: str,
    project_name: str,
    payment_gateway_name: str,
    currency: str,
    total_amount: str,
    verification_url: str,
):
    """Send payment verification request email to developer."""
    from app.utils.email_templates import render_payment_verification_request

    return await send_email(
        to_email=to_email,
        subject=f"Payment Verification Required - Invoice {invoice_number}",
        html_content=render_payment_verification_request(
            developer_name=developer_name,
            client_name=client_name,
            invoice_number=invoice_number,
            project_name=project_name,
            payment_gateway_name=payment_gateway_name,
            currency=currency,
            total_amount=total_amount,
            verification_url=verification_url,
            app_name=settings.app_name,
        ),
    )


async def send_payment_confirmed(
    to_email: str,
    recipient_name: str,
    invoice_number: str,
    project_name: str,
    payment_gateway_name: str,
    currency: str,
    total_amount: str,
    verified_date: str,
    is_client: bool,
    project_url: str = "",
):
    """Send payment confirmed email after verification."""
    from app.utils.email_templates import render_payment_confirmed

    return await send_email(
        to_email=to_email,
        subject=f"Payment Confirmed - Invoice {invoice_number}",
        html_content=render_payment_confirmed(
            recipient_name=recipient_name,
            invoice_number=invoice_number,
            project_name=project_name,
            payment_gateway_name=payment_gateway_name,
            currency=currency,
            total_amount=total_amount,
            verified_date=verified_date,
            is_client=is_client,
            project_url=project_url,
            app_name=settings.app_name,
        ),
    )


async def send_invoice_email(
    to_email: str,
    client_name: str,
    developer_name: str,
    invoice_number: str,
    invoice_date: str,
    due_date: str,
    project_name: str,
    currency: str,
    total_amount: str,
    payment_method: str,
    payment_gateway_name: str = None,
    payment_instructions: str = None,
    invoice_url: str = "",
    pdf_url: str = None,
    notes: str = None,
):
    """
    Send invoice email to client (Requirement 9.5, 20.5).
    Includes PDF download link and payment instructions.
    """
    from datetime import datetime

    from app.utils.email_templates import render_invoice_sent

    return await send_email(
        to_email=to_email,
        subject=f"New Invoice {invoice_number} - {project_name}",
        html_content=render_invoice_sent(
            client_name=client_name,
            developer_name=developer_name,
            invoice_number=invoice_number,
            invoice_date=invoice_date,
            due_date=due_date,
            project_name=project_name,
            currency=currency,
            total_amount=total_amount,
            payment_method=payment_method,
            payment_gateway_name=payment_gateway_name,
            payment_instructions=payment_instructions,
            invoice_url=invoice_url,
            pdf_url=pdf_url,
            notes=notes,
            current_year=datetime.now().year,
            app_name=settings.app_name,
        ),
    )


async def send_auto_pause_warning_email(
    to_email: str,
    developer_name: str,
    project_name: str,
    budget_remaining: str,
    budget_percentage: str,
    project_budget: str,
    currency: str,
    auto_pause_threshold: str,
    project_url: str,
):
    """
    Send auto-pause warning email when budget falls below 20% threshold.
    """
    from app.utils.email_templates import render_auto_pause_warning

    return await send_email(
        to_email=to_email,
        subject=f"⚠️ Budget Warning - {project_name}",
        html_content=render_auto_pause_warning(
            developer_name=developer_name,
            project_name=project_name,
            budget_remaining=budget_remaining,
            budget_percentage=budget_percentage,
            project_budget=project_budget,
            currency=currency,
            auto_pause_threshold=auto_pause_threshold,
            project_url=project_url,
            app_name=settings.app_name,
        ),
    )


async def send_auto_pause_triggered_email(
    to_email: str,
    recipient_name: str,
    project_name: str,
    budget_remaining: str,
    currency: str,
    auto_pause_threshold: str,
    triggered_at: str,
    is_developer: bool,
    project_url: str,
    developer_name: str = "",
):
    """
    Send auto-pause triggered email to both developer and client.
    """
    from app.utils.email_templates import render_auto_pause_triggered

    return await send_email(
        to_email=to_email,
        subject=f"🛑 Auto-Pause Activated - {project_name}",
        html_content=render_auto_pause_triggered(
            recipient_name=recipient_name,
            project_name=project_name,
            budget_remaining=budget_remaining,
            currency=currency,
            auto_pause_threshold=auto_pause_threshold,
            triggered_at=triggered_at,
            is_developer=is_developer,
            project_url=project_url,
            developer_name=developer_name,
            app_name=settings.app_name,
        ),
    )


async def send_payment_received_email(
    to_email: str,
    recipient_name: str,
    invoice_number: str,
    project_name: str,
    total_amount: str,
    currency: str,
    payment_method: str,
    payment_date: str,
    is_developer: bool,
    project_url: str,
    transaction_id: str = "",
    developer_name: str = "",
    auto_pause_resolved: bool = False,
    new_budget_balance: str = "",
):
    """
    Send payment received confirmation email.
    Sent to both developer and client after successful payment.
    """
    from app.utils.email_templates import render_payment_received

    return await send_email(
        to_email=to_email,
        subject=f"✓ Payment Received - Invoice {invoice_number}",
        html_content=render_payment_received(
            recipient_name=recipient_name,
            invoice_number=invoice_number,
            project_name=project_name,
            total_amount=total_amount,
            currency=currency,
            payment_method=payment_method,
            payment_date=payment_date,
            is_developer=is_developer,
            project_url=project_url,
            transaction_id=transaction_id,
            developer_name=developer_name,
            auto_pause_resolved=auto_pause_resolved,
            new_budget_balance=new_budget_balance,
            app_name=settings.app_name,
        ),
    )


async def send_change_request_email(
    to_email: str,
    client_name: str,
    project_name: str,
    title: str,
    description: str,
    estimated_hours: str,
    hourly_rate: str,
    total_cost: str,
    currency: str,
    portal_url: str,
):
    """
    Send change request notification email to client.
    """
    from app.utils.email_templates import render_change_request_notification

    return await send_email(
        to_email=to_email,
        subject=f"New Change Request - {project_name}",
        html_content=render_change_request_notification(
            client_name=client_name,
            project_name=project_name,
            title=title,
            description=description,
            estimated_hours=estimated_hours,
            hourly_rate=hourly_rate,
            total_cost=total_cost,
            currency=currency,
            portal_url=portal_url,
            app_name=settings.app_name,
        ),
    )


async def send_change_request_approved_email(
    to_email: str,
    developer_name: str,
    project_name: str,
    title: str,
    total_cost: str,
    currency: str,
    project_url: str,
):
    """
    Send change request approved notification email to developer.
    """
    from app.utils.email_templates import render_change_request_approved

    return await send_email(
        to_email=to_email,
        subject=f"Change Request Approved - {project_name}",
        html_content=render_change_request_approved(
            developer_name=developer_name,
            project_name=project_name,
            title=title,
            total_cost=total_cost,
            currency=currency,
            project_url=project_url,
            app_name=settings.app_name,
        ),
    )


async def send_change_request_rejected_email(
    to_email: str, developer_name: str, project_name: str, title: str, project_url: str
):
    """
    Send change request rejected notification email to developer.
    """
    from app.utils.email_templates import render_change_request_rejected

    return await send_email(
        to_email=to_email,
        subject=f"Change Request Rejected - {project_name}",
        html_content=render_change_request_rejected(
            developer_name=developer_name,
            project_name=project_name,
            title=title,
            project_url=project_url,
            app_name=settings.app_name,
        ),
    )


async def send_deliverable_completed_email(
    to_email: str,
    client_name: str,
    deliverable_title: str,
    task_reference: str,
    project_name: str,
    preview_url: str = "",
    pr_url: str = "",
    portal_url: str = "",
):
    """
    Send deliverable completed notification email to client.
    """
    from app.utils.email_templates import render_deliverable_completed_email

    return await send_email(
        to_email=to_email,
        subject=f"Deliverable Completed - {project_name}",
        html_content=render_deliverable_completed_email(
            client_name=client_name,
            deliverable_title=deliverable_title,
            task_reference=task_reference,
            project_name=project_name,
            preview_url=preview_url,
            pr_url=pr_url,
            portal_url=portal_url,
            app_name=settings.app_name,
        ),
    )


async def send_commit_review_notification(
    to_email: str,
    developer_name: str,
    project_name: str,
    commit_count: int,
    commits: list,
    review_url: str,
):
    """
    Send email notification when new commits are ready for review.

    Args:
        to_email: Developer's email address
        developer_name: Developer's full name
        project_name: Project name
        commit_count: Number of commits pending review
        commits: List of commit dictionaries with keys:
            - hash: commit hash
            - message: commit message
            - author: commit author
            - timestamp: commit timestamp (formatted string)
            - estimated_hours: estimated hours from parsing
        review_url: URL to review commits
    """
    from app.utils.email_templates import render_commit_review_notification

    return await send_email(
        to_email=to_email,
        subject=f"Commits Ready for Review - {project_name}",
        html_content=render_commit_review_notification(
            developer_name=developer_name,
            project_name=project_name,
            commit_count=commit_count,
            commits=commits,
            review_url=review_url,
            app_name=settings.app_name,
        ),
    )


async def send_budget_alert(
    to_email: str,
    developer_name: str,
    project_name: str,
    deliverable_title: str,
    estimated_hours: float,
    actual_hours: float,
    variance_hours: float,
    variance_percentage: float,
    usage_percentage: float,
    alert_level: str,
    deliverable_url: str,
):
    """
    Send budget alert email when deliverable exceeds time budget threshold.

    Args:
        to_email: Developer's email address
        developer_name: Developer's full name
        project_name: Project name
        deliverable_title: Deliverable title
        estimated_hours: Estimated hours for deliverable
        actual_hours: Actual hours tracked
        variance_hours: Difference between actual and estimated
        variance_percentage: Variance as percentage
        usage_percentage: Percentage of budget used
        alert_level: Alert severity ('warning' or 'critical')
        deliverable_url: URL to view deliverable details
    """
    from app.utils.email_templates import render_budget_alert

    subject_prefix = "🚨" if alert_level == "critical" else "⚠️"

    return await send_email(
        to_email=to_email,
        subject=f"{subject_prefix} Budget Alert - {deliverable_title}",
        html_content=render_budget_alert(
            developer_name=developer_name,
            project_name=project_name,
            deliverable_title=deliverable_title,
            estimated_hours=estimated_hours,
            actual_hours=actual_hours,
            variance_hours=variance_hours,
            variance_percentage=variance_percentage,
            usage_percentage=usage_percentage,
            alert_level=alert_level,
            deliverable_url=deliverable_url,
            app_name=settings.app_name,
        ),
    )


async def send_review_reminder(
    to_email: str,
    developer_name: str,
    pending_count: int,
    projects: list,
    review_url: str,
    total_estimated_hours: float = None,
):
    """
    Send reminder email for pending commit reviews.

    Args:
        to_email: Developer's email address
        developer_name: Developer's full name
        pending_count: Total number of pending reviews
        projects: List of project dictionaries with keys:
            - name: project name
            - pending_count: number of pending reviews
            - oldest_commit_age: age of oldest commit (e.g., "2 days ago")
        review_url: URL to review commits
        total_estimated_hours: Optional total hours pending review
    """
    from app.utils.email_templates import render_review_reminder

    return await send_email(
        to_email=to_email,
        subject=f"Reminder: {pending_count} Pending Commit Review(s)",
        html_content=render_review_reminder(
            developer_name=developer_name,
            pending_count=pending_count,
            projects=projects,
            total_estimated_hours=total_estimated_hours,
            review_url=review_url,
            app_name=settings.app_name,
        ),
    )


async def send_support_request_notification(
    sender_name: str, sender_email: str, subject: str, message: str, submitted_at: str
):
    """
    Send support request notification to support team.

    Args:
        sender_name: Name of the person submitting the request
        sender_email: Email of the person submitting the request
        subject: Subject of the support request
        message: Message content
        submitted_at: Timestamp when request was submitted
    """
    from app.utils.email_templates import render_support_request_notification

    return await send_email(
        to_email="support@devhq.site",
        subject=f"New Support Request: {subject}",
        html_content=render_support_request_notification(
            sender_name=sender_name,
            sender_email=sender_email,
            subject=subject,
            message=message,
            submitted_at=submitted_at,
            app_name=settings.app_name,
        ),
    )


async def send_support_reply(
    to_email: str,
    recipient_name: str,
    subject: str,
    reply_message: str,
    original_message: str,
):
    """
    Send support reply to user.

    Args:
        to_email: User's email address
        recipient_name: User's name
        subject: Original subject of the support request
        reply_message: Support team's reply message
        original_message: Original message from the user
    """
    from app.utils.email_templates import render_support_reply

    return await send_email(
        to_email=to_email,
        subject=f"Re: {subject} - DevHQ Support",
        html_content=render_support_reply(
            recipient_name=recipient_name,
            subject=subject,
            reply_message=reply_message,
            original_message=original_message,
            app_name=settings.app_name,
        ),
    )


async def send_waitlist_confirmation_email(
    to_email: str,
    full_name: str,
):
    """
    Send waitlist confirmation email to user.

    Args:
        to_email: User's email address
        full_name: User's full name
    """
    from app.utils.email_templates import render_waitlist_confirmation

    return await send_email(
        to_email=to_email,
        subject=f"You're on the {settings.app_name} Waitlist!",
        html_content=render_waitlist_confirmation(
            full_name=full_name,
            app_name=settings.app_name,
        ),
    )
