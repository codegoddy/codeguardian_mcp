from pathlib import Path

from jinja2 import Template

from app.core.config import settings

# Get the directory where this file is located
BASE_DIR = Path(__file__).parent
TEMPLATES_DIR = BASE_DIR / "email_templates"


def _load_template(template_name: str) -> Template:
    """Load an HTML template from file."""
    template_path = TEMPLATES_DIR / template_name
    with open(template_path, "r", encoding="utf-8") as file:
        template_content = file.read()
    return Template(template_content)


def render_otp_email(otp: str, app_name: str = "DevHQ") -> str:
    """Render OTP verification email template."""
    template = _load_template("otp_verification.html")
    return template.render(otp=otp, app_name=app_name)


def render_welcome_email(username: str, app_name: str = "DevHQ", login_url: str = "https://devhq.com/login") -> str:
    """Render welcome email template for new users."""
    template = _load_template("welcome_email.html")
    return template.render(username=username, app_name=app_name, login_url=login_url)


def render_password_reset_email(otp: str, app_name: str = "DevHQ") -> str:
    """Render password reset email template with OTP."""
    template = _load_template("password_reset.html")
    return template.render(otp=otp, app_name=app_name)


def render_password_reset_link_email(reset_url: str, app_name: str = "DevHQ") -> str:
    """Render password reset email template with magic link (for Supabase integration)."""
    template = _load_template("password_reset_link.html")
    return template.render(reset_url=reset_url, app_name=app_name)


def render_contract_signing_invitation(
    client_name: str,
    developer_name: str,
    developer_email: str,
    project_name: str,
    project_budget: str,
    currency: str,
    signing_url: str,
    app_name: str = "DevHQ",
) -> str:
    """Render contract signing invitation email template."""
    template = _load_template("contract_signing_invitation.html")
    return template.render(
        client_name=client_name,
        developer_name=developer_name,
        developer_email=developer_email,
        project_name=project_name,
        project_budget=project_budget,
        currency=currency,
        signing_url=signing_url,
        app_name=app_name,
    )


def render_contract_signed_confirmation(
    recipient_name: str,
    project_name: str,
    signer_name: str,
    signed_date: str,
    is_developer: bool,
    project_url: str = "",
    app_name: str = "DevHQ",
    app_url: str = None,
) -> str:
    """Render contract signed confirmation email template."""
    if app_url is None:
        app_url = settings.frontend_url
    template = _load_template("contract_signed_confirmation.html")
    return template.render(
        recipient_name=recipient_name,
        project_name=project_name,
        signer_name=signer_name,
        signed_date=signed_date,
        is_developer=is_developer,
        project_url=project_url,
        app_name=app_name,
        app_url=app_url,
    )


def render_contract_declined(
    developer_name: str,
    project_name: str,
    client_name: str,
    client_email: str,
    declined_date: str,
    app_name: str = "DevHQ",
) -> str:
    """Render contract declined notification email template."""
    template = _load_template("contract_declined.html")
    return template.render(
        developer_name=developer_name,
        project_name=project_name,
        client_name=client_name,
        client_email=client_email,
        declined_date=declined_date,
        app_name=app_name,
    )


def render_deliverable_completed_email(
    client_name: str,
    deliverable_title: str,
    task_reference: str,
    project_name: str,
    preview_url: str = "",
    pr_url: str = "",
    portal_url: str = "",
    app_name: str = "DevHQ",
    app_url: str = None,
) -> str:
    """Render deliverable completed notification email template."""
    if app_url is None:
        app_url = settings.frontend_url
    template = _load_template("deliverable_completed.html")
    return template.render(
        client_name=client_name,
        deliverable_title=deliverable_title,
        task_reference=task_reference,
        project_name=project_name,
        preview_url=preview_url,
        pr_url=pr_url,
        portal_url=portal_url,
        app_name=app_name,
        app_url=app_url,
    )


def render_payment_verification_request(
    developer_name: str,
    client_name: str,
    invoice_number: str,
    project_name: str,
    payment_gateway_name: str,
    currency: str,
    total_amount: str,
    verification_url: str,
    app_name: str = "DevHQ",
) -> str:
    """Render payment verification request email template."""
    template = _load_template("payment_verification_request.html")
    return template.render(
        developer_name=developer_name,
        client_name=client_name,
        invoice_number=invoice_number,
        project_name=project_name,
        payment_gateway_name=payment_gateway_name,
        currency=currency,
        total_amount=total_amount,
        verification_url=verification_url,
        app_name=app_name,
    )


def render_payment_confirmed(
    recipient_name: str,
    invoice_number: str,
    project_name: str,
    payment_gateway_name: str,
    currency: str,
    total_amount: str,
    verified_date: str,
    is_client: bool,
    project_url: str = "",
    app_name: str = "DevHQ",
) -> str:
    """Render payment confirmed email template."""
    template = _load_template("payment_confirmed.html")
    return template.render(
        recipient_name=recipient_name,
        invoice_number=invoice_number,
        project_name=project_name,
        payment_gateway_name=payment_gateway_name,
        currency=currency,
        total_amount=total_amount,
        verified_date=verified_date,
        is_client=is_client,
        project_url=project_url,
        app_name=app_name,
    )


def render_invoice_sent(
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
    current_year: int = 2024,
    app_name: str = "DevHQ",
) -> str:
    """Render invoice sent email template."""
    template = _load_template("invoice_sent.html")
    return template.render(
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
        current_year=current_year,
        app_name=app_name,
    )


def render_change_request_notification(
    client_name: str,
    project_name: str,
    title: str,
    description: str,
    estimated_hours: str,
    hourly_rate: str,
    total_cost: str,
    currency: str,
    portal_url: str,
    app_name: str = "DevHQ",
) -> str:
    """Render change request notification email template."""
    template = _load_template("change_request_notification.html")
    return template.render(
        client_name=client_name,
        project_name=project_name,
        title=title,
        description=description,
        estimated_hours=estimated_hours,
        hourly_rate=hourly_rate,
        total_cost=total_cost,
        currency=currency,
        portal_url=portal_url,
        app_name=app_name,
    )


def render_change_request_approved(
    developer_name: str,
    project_name: str,
    title: str,
    total_cost: str,
    currency: str,
    project_url: str,
    app_name: str = "DevHQ",
) -> str:
    """Render change request approved email template."""
    template = _load_template("change_request_approved.html")
    return template.render(
        developer_name=developer_name,
        project_name=project_name,
        title=title,
        total_cost=total_cost,
        currency=currency,
        project_url=project_url,
        app_name=app_name,
    )


def render_change_request_rejected(
    developer_name: str,
    project_name: str,
    title: str,
    project_url: str,
    app_name: str = "DevHQ",
) -> str:
    """Render change request rejected email template."""
    template = _load_template("change_request_rejected.html")
    return template.render(
        developer_name=developer_name,
        project_name=project_name,
        title=title,
        project_url=project_url,
        app_name=app_name,
    )


def render_auto_pause_warning(
    developer_name: str,
    project_name: str,
    budget_remaining: str,
    budget_percentage: str,
    project_budget: str,
    currency: str,
    auto_pause_threshold: str,
    project_url: str,
    app_name: str = "DevHQ",
) -> str:
    """Render auto-pause warning email template."""
    template = _load_template("auto_pause_warning.html")
    return template.render(
        developer_name=developer_name,
        project_name=project_name,
        budget_remaining=budget_remaining,
        budget_percentage=budget_percentage,
        project_budget=project_budget,
        currency=currency,
        auto_pause_threshold=auto_pause_threshold,
        project_url=project_url,
        app_name=app_name,
    )


def render_auto_pause_triggered(
    recipient_name: str,
    project_name: str,
    budget_remaining: str,
    currency: str,
    auto_pause_threshold: str,
    triggered_at: str,
    is_developer: bool,
    project_url: str,
    developer_name: str = "",
    app_name: str = "DevHQ",
) -> str:
    """Render auto-pause triggered email template."""
    template = _load_template("auto_pause_triggered.html")
    return template.render(
        recipient_name=recipient_name,
        project_name=project_name,
        budget_remaining=budget_remaining,
        currency=currency,
        auto_pause_threshold=auto_pause_threshold,
        triggered_at=triggered_at,
        is_developer=is_developer,
        project_url=project_url,
        developer_name=developer_name,
        app_name=app_name,
    )


def render_payment_received(
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
    app_name: str = "DevHQ",
) -> str:
    """Render payment received email template."""
    template = _load_template("payment_received.html")
    return template.render(
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
        app_name=app_name,
    )


def render_commit_review_notification(
    developer_name: str,
    project_name: str,
    commit_count: int,
    commits: list,
    review_url: str,
    app_name: str = "DevHQ",
) -> str:
    """Render commit review notification email template."""
    template = _load_template("commit_review_notification.html")
    return template.render(
        developer_name=developer_name,
        project_name=project_name,
        commit_count=commit_count,
        commits=commits,
        review_url=review_url,
        app_name=app_name,
    )


def render_budget_alert(
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
    app_name: str = "DevHQ",
) -> str:
    """Render budget alert email template."""
    template = _load_template("budget_alert.html")
    return template.render(
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
        app_name=app_name,
    )


def render_review_reminder(
    developer_name: str,
    pending_count: int,
    projects: list,
    total_estimated_hours: float = None,
    review_url: str = "",
    app_name: str = "DevHQ",
) -> str:
    """Render review reminder email template."""
    template = _load_template("review_reminder.html")
    return template.render(
        developer_name=developer_name,
        pending_count=pending_count,
        projects=projects,
        total_estimated_hours=total_estimated_hours,
        review_url=review_url,
        app_name=app_name,
    )


def render_client_portal_welcome(
    client_name: str,
    developer_name: str,
    project_name: str,
    magic_link: str,
    app_name: str = "DevHQ",
) -> str:
    """Render client portal welcome email template."""
    from datetime import datetime

    template = _load_template("client_portal_welcome.html")
    return template.render(
        client_name=client_name,
        developer_name=developer_name,
        project_name=project_name,
        magic_link=magic_link,
        current_year=datetime.now().year,
        app_name=app_name,
    )


def render_client_portal_access_link(
    client_name: str,
    developer_name: str,
    project_name: str,
    magic_link: str,
    app_name: str = "DevHQ",
) -> str:
    """Render client portal access link email template."""
    from datetime import datetime

    template = _load_template("client_portal_access_link.html")
    return template.render(
        client_name=client_name,
        developer_name=developer_name,
        project_name=project_name,
        magic_link=magic_link,
        current_year=datetime.now().year,
        app_name=app_name,
    )


def render_support_request_notification(
    sender_name: str,
    sender_email: str,
    subject: str,
    message: str,
    submitted_at: str,
    app_name: str = "DevHQ",
) -> str:
    """Render support request notification email template (sent to support team)."""
    from datetime import datetime

    template = _load_template("support_request_notification.html")
    return template.render(
        sender_name=sender_name,
        sender_email=sender_email,
        subject=subject,
        message=message,
        submitted_at=submitted_at,
        current_year=datetime.now().year,
        app_name=app_name,
    )


def render_support_reply(
    recipient_name: str,
    subject: str,
    reply_message: str,
    original_message: str,
    app_name: str = "DevHQ",
):
    """Render support reply email template (sent to user)."""
    from datetime import datetime

    template = _load_template("support_reply.html")
    return template.render(
        recipient_name=recipient_name,
        subject=subject,
        reply_message=reply_message,
        original_message=original_message,
        current_year=datetime.now().year,
        app_name=app_name,
    )


def render_waitlist_confirmation(
    full_name: str,
    app_name: str = "DevHQ",
) -> str:
    """Render waitlist confirmation email template."""
    from datetime import datetime

    template = _load_template("waitlist_confirmation.html")
    return template.render(
        full_name=full_name,
        current_year=datetime.now().year,
        app_name=app_name,
    )
