import secrets
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging_config import get_logger
from app.db.database import get_db
from app.models.change_request import ChangeRequest
from app.models.client import Client
from app.models.client_portal_session import ClientPortalAccessLog, ClientPortalSession
from app.models.deliverable import Deliverable
from app.models.git_commit import GitCommit
from app.models.invoice import Invoice
from app.models.milestone import Milestone
from app.models.project import Project
from app.models.time_tracking import TimeEntry
from app.schemas.client_portal import (
    ActivityMetrics,
    ClientPortalAccessRequest,
    ClientPortalAccessResponse,
    ClientPortalDashboard,
    ClientPortalLogout,
    ClientPortalProjectResponse,
    ClientPortalTokenValidation,
    DeliverableActivityResponse,
    TimelineEvent,
    TimelineValidationResponse,
)
from app.services.activity_metrics import ActivityMetricsService
from app.services.timeline_validator import TimelineValidator
from app.utils.email import send_email
from app.utils.nats_client import publish_message
from app.utils.rate_limiter import check_rate_limit as redis_check_rate_limit
from app.utils.redis_client import RedisCache

router = APIRouter()
logger = get_logger(__name__)


async def check_rate_limit(email: str, max_requests: int = 5, window_hours: int = 1) -> bool:
    """
    Check if email has exceeded rate limit using Redis.
    Returns True if within limit, False if exceeded.
    """
    window_seconds = window_hours * 3600
    allowed, current_count = await redis_check_rate_limit(
        identifier=email,
        limit=max_requests,
        window_seconds=window_seconds,
        prefix="ratelimit:client_portal",
    )
    return allowed


def get_client_ip(request: Request) -> str:
    """Extract client IP address from request"""
    # Check for X-Forwarded-For header (proxy/load balancer)
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()

    # Check for X-Real-IP header
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip

    # Fall back to direct client
    if request.client:
        return request.client.host

    return "unknown"


def get_user_agent(request: Request) -> str:
    """Extract user agent from request"""
    return request.headers.get("User-Agent", "unknown")


async def send_magic_link_email(to_email: str, client_name: str, magic_link: str):
    """Send magic link email to client"""
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Client Portal Access</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #f8f9fa; border-radius: 10px; padding: 30px; margin-bottom: 20px;">
            <h1 style="color: #2c3e50; margin-bottom: 20px;">Access Your Client Portal</h1>
            <p style="font-size: 16px; margin-bottom: 20px;">Hello {client_name},</p>
            <p style="font-size: 16px; margin-bottom: 20px;">
                Click the button below to access your client portal. This link will expire in 24 hours.
            </p>
            <div style="text-align: center; margin: 30px 0;">
                <a href="{magic_link}" 
                   style="background-color: #3498db; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-size: 16px; font-weight: bold;">
                    Access Portal
                </a>
            </div>
            <p style="font-size: 14px; color: #7f8c8d; margin-top: 30px;">
                If you didn't request this link, you can safely ignore this email.
            </p>
            <p style="font-size: 14px; color: #7f8c8d;">
                For security reasons, this link will expire in 24 hours.
            </p>
        </div>
        <div style="text-align: center; color: #95a5a6; font-size: 12px; margin-top: 20px;">
            <p>&copy; {datetime.now().year} {settings.app_name}. All rights reserved.</p>
        </div>
    </body>
    </html>
    """

    return await send_email(
        to_email=to_email,
        subject=f"Access Your {settings.app_name} Client Portal",
        html_content=html_content,
    )


async def log_access_attempt(
    db: AsyncSession,
    client_id: UUID,
    session_id: Optional[UUID],
    action: str,
    ip_address: str,
    user_agent: str,
    success: bool,
    failure_reason: Optional[str] = None,
):
    """Log client portal access attempt"""
    access_log = ClientPortalAccessLog(
        client_id=client_id,
        session_id=session_id,
        action=action,
        ip_address=ip_address,
        user_agent=user_agent,
        success=success,
        failure_reason=failure_reason,
    )
    db.add(access_log)
    await db.commit()


async def authenticate_client_portal(request: Request, db: AsyncSession) -> tuple[ClientPortalSession, Client]:
    """
    Authenticate client portal request using X-Client-Token header.
    Returns (session, client) tuple if valid, raises HTTPException otherwise.
    Uses Redis caching for performance.
    """
    import time

    auth_start = time.time()

    ip_address = get_client_ip(request)
    user_agent = get_user_agent(request)

    # Get magic token from header
    magic_token = request.headers.get("X-Client-Token")

    if not magic_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated. X-Client-Token header required.",
        )

    # Try Redis cache first
    cached_session = await RedisCache.get_cached_client_portal_session(magic_token)
    logger.debug("Redis cache lookup: %.0fms", (time.time() - auth_start) * 1000)

    if cached_session and cached_session.get("valid"):
        # Get session and client from database (we need the actual objects, not just data)
        # But we know they exist from cache, so this should be fast with proper indexing
        query_start = time.time()
        stmt = select(ClientPortalSession).where(ClientPortalSession.id == cached_session["session_id"])
        result = await db.execute(stmt)
        session = result.scalar_one()

        stmt = select(Client).where(Client.id == cached_session["client_id"])
        result = await db.execute(stmt)
        client = result.scalar_one()
        logger.debug("Cached auth DB fetch: %.0fms", (time.time() - query_start) * 1000)
        logger.debug("Total auth (cached): %.0fms", (time.time() - auth_start) * 1000)

        return session, client

    # Not in cache, do full lookup
    logger.debug("Cache miss, doing full lookup")
    query_start = time.time()
    stmt = select(ClientPortalSession).where(ClientPortalSession.magic_token == magic_token)
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    logger.debug("Session query: %.0fms", (time.time() - query_start) * 1000)

    if not session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session token")

    # Check if session is valid
    if not session.is_valid():
        reason = "revoked" if session.is_revoked else "expired"
        logger.warning("Session %s for client_id=%s", reason, session.client_id)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Session {reason}")

    # Get client
    stmt = select(Client).where(Client.id == session.client_id)
    result = await db.execute(stmt)
    client = result.scalar_one_or_none()

    if not client or not client.is_active:
        logger.warning("Client inactive: client_id=%s", session.client_id)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Client account is inactive")

    # Skip updating accessed_at here to avoid slow commit (will be updated by background task in endpoint)
    logger.debug("Total auth (full lookup): %.0fms", (time.time() - auth_start) * 1000)

    return session, client


@router.post("/request-access", response_model=ClientPortalAccessResponse)
async def request_access(
    request_data: ClientPortalAccessRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Request magic link for client portal access (Requirement 11.1, 11.2).
    Implements rate limiting (max 5 requests per hour per email).
    """
    email = request_data.email
    ip_address = get_client_ip(request)
    user_agent = get_user_agent(request)

    # Check rate limit (Requirement 11.9) - now uses Redis
    if not await check_rate_limit(email, max_requests=5, window_hours=1):
        logger.warning("Rate limit exceeded for %s from %s", email, ip_address)

        # Log failed attempt
        # Try to find client for logging, but don't reveal if they exist
        stmt = select(Client).where(Client.email == email)
        result = await db.execute(stmt)
        client = result.scalar_one_or_none()

        if client:
            await log_access_attempt(
                db=db,
                client_id=client.id,
                session_id=None,
                action="request_access",
                ip_address=ip_address,
                user_agent=user_agent,
                success=False,
                failure_reason="rate_limit_exceeded",
            )

        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please try again later.",
        )

    # Find client by email
    stmt = select(Client).where(and_(Client.email == email, Client.is_active == True))
    result = await db.execute(stmt)
    client = result.scalar_one_or_none()

    if not client:
        # Don't reveal if client exists (security best practice)
        logger.debug("Access request for non-existent client: %s", email)
        return ClientPortalAccessResponse(
            message="If a client account exists with this email, a magic link has been sent.",
            success=True,
        )

    # Generate magic token (24-hour expiry) (Requirement 11.3)
    magic_token = ClientPortalSession.generate_magic_token()
    expires_at = datetime.utcnow() + timedelta(hours=24)

    # Create session
    session = ClientPortalSession(
        client_id=client.id,
        magic_token=magic_token,
        ip_address=ip_address,
        user_agent=user_agent,
        expires_at=expires_at,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    # Log successful request
    await log_access_attempt(
        db=db,
        client_id=client.id,
        session_id=session.id,
        action="request_access",
        ip_address=ip_address,
        user_agent=user_agent,
        success=True,
    )

    # Generate magic link
    magic_link = f"{settings.frontend_url}/client-portal/{magic_token}"

    # Send magic link email
    try:
        await send_magic_link_email(to_email=client.email, client_name=client.name, magic_link=magic_link)
        logger.info("Magic link sent to %s", client.email)
    except Exception as e:
        logger.error("Failed to send magic link email: %s", e, exc_info=True)
        # Continue even if email fails

    # Publish event to NATS
    try:
        await publish_message(
            "client_portal.access_requested",
            f"Client portal access requested: {client.email}",
        )
    except Exception as e:
        logger.warning("Failed to publish client portal access event to NATS: %s", e)

    return ClientPortalAccessResponse(
        message="If a client account exists with this email, a magic link has been sent.",
        success=True,
    )


@router.get("/validate-token/{magic_token}", response_model=ClientPortalTokenValidation)
async def validate_token(
    magic_token: str,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """
    Validate magic link token and return client info (Requirement 11.3).
    Records IP address and user agent for security (Requirement 11.9, 11.10).
    Uses Redis caching for performance optimization.
    """
    import time

    start_time = time.time()
    logger.debug("validate_token started")

    ip_address = get_client_ip(request)
    user_agent = get_user_agent(request)
    logger.debug("Got IP/UA in %.0fms", (time.time() - start_time) * 1000)

    # Try to get from Redis cache first
    cache_start = time.time()
    cached_session = await RedisCache.get_cached_client_portal_session(magic_token)
    logger.debug("Redis cache lookup took %.0fms", (time.time() - cache_start) * 1000)

    if cached_session:
        logger.debug("Session found in cache! Total: %.0fms", (time.time() - start_time) * 1000)
        # Return cached data
        return ClientPortalTokenValidation(
            valid=cached_session["valid"],
            client_id=cached_session.get("client_id"),
            client_name=cached_session.get("client_name"),
            client_email=cached_session.get("client_email"),
            session_id=cached_session.get("session_id"),
            expires_at=cached_session.get("expires_at"),
        )

    # Not in cache, query database
    stmt = select(ClientPortalSession).where(ClientPortalSession.magic_token == magic_token)
    query_start = time.time()
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    logger.debug("Session query took %.0fms", (time.time() - query_start) * 1000)

    if not session:
        logger.debug("Invalid magic token attempted from %s", ip_address)
        return ClientPortalTokenValidation(valid=False)

    # Check if session is valid
    if not session.is_valid():
        reason = "revoked" if session.is_revoked else "expired"
        logger.warning(
            "%s token attempted for client_id=%s",
            reason.capitalize(),
            session.client_id,
        )

        # Log failed attempt
        await log_access_attempt(
            db=db,
            client_id=session.client_id,
            session_id=session.id,
            action="validate_token",
            ip_address=ip_address,
            user_agent=user_agent,
            success=False,
            failure_reason=f"token_{reason}",
        )

        return ClientPortalTokenValidation(valid=False)

    # Get client info
    stmt = select(Client).where(Client.id == session.client_id)
    query_start = time.time()
    result = await db.execute(stmt)
    client = result.scalar_one_or_none()
    logger.debug("Client query took %.0fms", (time.time() - query_start) * 1000)

    if not client or not client.is_active:
        logger.warning("Token valid but client inactive: client_id=%s", session.client_id)

        # Log failed attempt
        await log_access_attempt(
            db=db,
            client_id=session.client_id,
            session_id=session.id,
            action="validate_token",
            ip_address=ip_address,
            user_agent=user_agent,
            success=False,
            failure_reason="client_inactive",
        )

        return ClientPortalTokenValidation(valid=False)

    # Update session accessed_at timestamp
    session.accessed_at = datetime.utcnow()
    commit_start = time.time()
    await db.commit()
    logger.debug("Session update commit took %.0fms", (time.time() - commit_start) * 1000)

    # Prepare response data
    response_data = {
        "valid": True,
        "client_id": client.id,
        "client_name": client.name,
        "client_email": client.email,
        "session_id": session.id,
        "expires_at": session.expires_at.isoformat() if session.expires_at else None,
    }

    # Cache the session data in Redis for subsequent requests
    cache_start = time.time()
    await RedisCache.cache_client_portal_session(magic_token, response_data)
    logger.debug("Redis cache write took %.0fms", (time.time() - cache_start) * 1000)

    # Run logging and NATS publishing in background (non-blocking)
    async def background_logging():
        """Background task for logging - won't block response"""
        from app.db.database import get_async_session

        try:
            session_maker = get_async_session()
            async with session_maker() as bg_db:
                await log_access_attempt(
                    db=bg_db,
                    client_id=client.id,
                    session_id=session.id,
                    action="validate_token",
                    ip_address=ip_address,
                    user_agent=user_agent,
                    success=True,
                )
                await bg_db.commit()
                logger.debug("Access log completed")
        except Exception as e:
            logger.error("Failed to log access: %s", e, exc_info=True)

    async def background_nats():
        """Background task for NATS publishing"""
        try:
            await publish_message("client_portal.login_success", f"Client logged in: {client.email}")
            logger.debug("NATS publish completed")
        except Exception as e:
            logger.warning("Failed to publish to NATS: %s", e)

    # Add background tasks (will run after response is sent)
    background_tasks.add_task(background_logging)
    background_tasks.add_task(background_nats)

    logger.info("Successful login for %s from %s", client.email, ip_address)
    logger.debug("validate_token TOTAL: %.0fms", (time.time() - start_time) * 1000)

    return ClientPortalTokenValidation(
        valid=True,
        client_id=client.id,
        client_name=client.name,
        client_email=client.email,
        session_id=session.id,
        expires_at=session.expires_at,
    )


@router.post("/logout", response_model=ClientPortalLogout)
async def logout(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Revoke current client portal session (Requirement 11.4).
    Requires X-Client-Token header with magic token.
    """
    ip_address = get_client_ip(request)
    user_agent = get_user_agent(request)

    # Get magic token from header
    magic_token = request.headers.get("X-Client-Token")

    if not magic_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    # Find session
    stmt = select(ClientPortalSession).where(ClientPortalSession.magic_token == magic_token)
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")

    # Revoke session
    session.is_revoked = True
    await db.commit()

    # Log logout
    await log_access_attempt(
        db=db,
        client_id=session.client_id,
        session_id=session.id,
        action="logout",
        ip_address=ip_address,
        user_agent=user_agent,
        success=True,
    )

    logger.info("Client logged out: client_id=%s", session.client_id)

    return ClientPortalLogout(message="Successfully logged out", success=True)


@router.get("/dashboard", response_model=ClientPortalDashboard)
async def get_dashboard(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """
    Get client portal dashboard data (Requirement 11.4).
    Requires X-Client-Token header for authentication.
    Returns all projects for the client with summary data.
    Uses Redis caching for performance optimization.
    """
    import time

    start_time = time.time()
    logger.debug("get_dashboard started")

    ip_address = get_client_ip(request)
    user_agent = get_user_agent(request)
    logger.debug("Got IP/UA in %.0fms", (time.time() - start_time) * 1000)

    # Authenticate client (uses Redis cache internally)
    auth_start = time.time()
    session, client = await authenticate_client_portal(request, db)
    logger.debug("Authentication took %.0fms", (time.time() - auth_start) * 1000)

    # Get all projects for this client
    projects_start = time.time()
    stmt = select(Project).where(Project.client_id == client.id)
    result = await db.execute(stmt)
    projects = result.scalars().all()
    logger.debug(
        "Projects query took %.0fms, found %d projects",
        (time.time() - projects_start) * 1000,
        len(projects),
    )

    # Get developer's currency setting (from the first project's user)
    currency = "USD"  # default
    if projects:
        from app.models.user import UserSettings

        settings_stmt = select(UserSettings).where(UserSettings.user_id == projects[0].user_id)
        settings_result = await db.execute(settings_stmt)
        user_settings = settings_result.scalar_one_or_none()
        if user_settings and user_settings.default_currency:
            currency = user_settings.default_currency

    project_summaries = []

    if projects:
        project_ids = [project.id for project in projects]

        # Prefetch deliverable counts
        deliverable_stats_start = time.time()
        deliverable_stmt = (
            select(
                Deliverable.project_id,
                func.count().label("total_deliverables"),
                func.count()
                .filter(Deliverable.status.in_(["completed", "verified", "billed"]))
                .label("completed_deliverables"),
            )
            .where(Deliverable.project_id.in_(project_ids))
            .group_by(Deliverable.project_id)
        )
        deliverable_result = await db.execute(deliverable_stmt)
        deliverable_map = {
            row.project_id: {
                "total": row.total_deliverables,
                "completed": row.completed_deliverables,
            }
            for row in deliverable_result
        }
        logger.debug(
            "Deliverable stats query took %.0fms",
            (time.time() - deliverable_stats_start) * 1000,
        )

        # Prefetch pending change request counts
        cr_stats_start = time.time()
        cr_stmt = (
            select(
                ChangeRequest.project_id,
                func.count().label("pending_change_requests"),
            )
            .where(
                and_(
                    ChangeRequest.project_id.in_(project_ids),
                    ChangeRequest.status == "pending",
                )
            )
            .group_by(ChangeRequest.project_id)
        )
        cr_result = await db.execute(cr_stmt)
        cr_map = {row.project_id: row.pending_change_requests for row in cr_result}
        logger.debug(
            "Change request stats query took %.0fms",
            (time.time() - cr_stats_start) * 1000,
        )

        # Prefetch pending invoice counts
        invoice_stats_start = time.time()
        invoice_stmt = (
            select(
                Invoice.project_id,
                func.count().label("pending_invoices"),
            )
            .where(
                and_(
                    Invoice.project_id.in_(project_ids),
                    Invoice.status.in_(["sent", "awaiting_verification"]),
                )
            )
            .group_by(Invoice.project_id)
        )
        invoice_result = await db.execute(invoice_stmt)
        invoice_map = {row.project_id: row.pending_invoices for row in invoice_result}
        logger.debug(
            "Invoice stats query took %.0fms",
            (time.time() - invoice_stats_start) * 1000,
        )

        # Build project summaries
        summaries_start = time.time()
        for project in projects:
            deliverable_data = deliverable_map.get(project.id, {"total": 0, "completed": 0})
            pending_change_requests = cr_map.get(project.id, 0)
            pending_invoices = invoice_map.get(project.id, 0)

            project_summaries.append(
                {
                    "id": project.id,
                    "name": project.name,
                    "description": project.description,
                    "status": project.status,
                    "project_budget": float(project.project_budget),
                    "current_budget_remaining": float(project.current_budget_remaining),
                    "budget_percentage_remaining": float(
                        (project.current_budget_remaining / project.project_budget * 100) if project.project_budget > 0 else 0
                    ),
                    "total_deliverables": int(deliverable_data["total"]),
                    "completed_deliverables": int(deliverable_data["completed"]),
                    "pending_change_requests": int(pending_change_requests),
                    "pending_invoices": int(pending_invoices),
                    "created_at": (project.created_at.isoformat() if project.created_at else None),
                }
            )
        logger.debug("Project summaries built in %.0fms", (time.time() - summaries_start) * 1000)

    # Log dashboard access in background (non-blocking)
    async def background_dashboard_log():
        """Background task for logging - won't block response"""
        from app.db.database import get_async_session

        try:
            session_maker = get_async_session()
            async with session_maker() as bg_db:
                await log_access_attempt(
                    db=bg_db,
                    client_id=client.id,
                    session_id=session.id,
                    action="view_dashboard",
                    ip_address=ip_address,
                    user_agent=user_agent,
                    success=True,
                )
                await bg_db.commit()
                logger.debug("Dashboard access log completed")
        except Exception as e:
            logger.error("Failed to log dashboard access: %s", e, exc_info=True)

    background_tasks.add_task(background_dashboard_log)

    logger.info("Dashboard accessed by %s", client.email)
    logger.debug("get_dashboard TOTAL: %.0fms", (time.time() - start_time) * 1000)

    return ClientPortalDashboard(
        client_name=client.name,
        client_email=client.email,
        currency=currency,
        projects=project_summaries,
    )


@router.get("/projects/{project_id}", response_model=ClientPortalProjectResponse)
async def get_project(project_id: UUID, request: Request, db: AsyncSession = Depends(get_db)):
    """
    Get detailed project information for client portal (Requirement 11.4).
    Requires X-Client-Token header for authentication.
    Returns project details, deliverables, change requests, and invoices.
    """
    ip_address = get_client_ip(request)
    user_agent = get_user_agent(request)

    # Authenticate client
    session, client = await authenticate_client_portal(request, db)

    # Get project and verify it belongs to this client
    stmt = select(Project).where(and_(Project.id == project_id, Project.client_id == client.id))
    result = await db.execute(stmt)
    project = result.scalar_one_or_none()

    if not project:
        await log_access_attempt(
            db=db,
            client_id=client.id,
            session_id=session.id,
            action="view_project",
            ip_address=ip_address,
            user_agent=user_agent,
            success=False,
            failure_reason="project_not_found",
        )

        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    # Get milestones
    milestone_stmt = select(Milestone).where(Milestone.project_id == project.id).order_by(Milestone.order)
    milestones_result = await db.execute(milestone_stmt)
    milestones = milestones_result.scalars().all()

    milestone_list = [
        {
            "id": m.id,
            "name": m.name,
            "description": m.description,
            "order": m.order,
        }
        for m in milestones
    ]

    # Get deliverables
    deliverable_stmt = select(Deliverable).where(Deliverable.project_id == project.id)
    deliverables_result = await db.execute(deliverable_stmt)
    deliverables = deliverables_result.scalars().all()

    deliverable_list = [
        {
            "id": d.id,
            "title": d.title,
            "description": d.description,
            "status": d.status,
            "task_reference": d.task_reference,
            "preview_url": d.preview_url,
            "estimated_hours": float(d.estimated_hours) if d.estimated_hours else None,
            "actual_hours": float(d.actual_hours),
            "total_cost": float(d.total_cost),
            "milestone_id": str(d.milestone_id) if d.milestone_id else None,
            "created_at": d.created_at.isoformat() if d.created_at else None,
            "verified_at": d.verified_at.isoformat() if d.verified_at else None,
        }
        for d in deliverables
    ]

    # Get change requests
    cr_stmt = select(ChangeRequest).where(ChangeRequest.project_id == project.id)
    cr_result = await db.execute(cr_stmt)
    change_requests = cr_result.scalars().all()

    change_request_list = [
        {
            "id": cr.id,
            "title": cr.title,
            "description": cr.description,
            "status": cr.status,
            "estimated_hours": float(cr.estimated_hours),
            "hourly_rate": float(cr.hourly_rate),
            "total_cost": float(cr.total_cost),
            "payment_required": cr.payment_required,
            "payment_received": cr.payment_received,
            "created_at": cr.created_at.isoformat() if cr.created_at else None,
            "approved_at": cr.approved_at.isoformat() if cr.approved_at else None,
        }
        for cr in change_requests
    ]

    # Get invoices
    invoice_stmt = select(Invoice).where(Invoice.project_id == project.id)
    invoice_result = await db.execute(invoice_stmt)
    invoices = invoice_result.scalars().all()

    invoice_list = [
        {
            "id": inv.id,
            "invoice_number": inv.invoice_number,
            "status": inv.status,
            "subtotal": float(inv.subtotal),
            "platform_fee": float(inv.platform_fee),
            "tax_amount": float(inv.tax_amount),
            "total_amount": float(inv.total_amount),
            "payment_method": inv.payment_method,
            "payment_gateway_name": inv.payment_gateway_name,
            "invoice_pdf_url": inv.invoice_pdf_url,
            "due_date": inv.due_date.isoformat() if inv.due_date else None,
            "sent_at": inv.sent_at.isoformat() if inv.sent_at else None,
            "payment_received_at": (inv.payment_received_at.isoformat() if inv.payment_received_at else None),
            "client_marked_paid": inv.client_marked_paid,
            "developer_verified": inv.developer_verified,
            "created_at": inv.created_at.isoformat() if inv.created_at else None,
        }
        for inv in invoices
    ]

    # Log successful access
    await log_access_attempt(
        db=db,
        client_id=client.id,
        session_id=session.id,
        action="view_project",
        ip_address=ip_address,
        user_agent=user_agent,
        success=True,
    )

    logger.info("Project %s accessed by %s", project_id, client.email)

    return ClientPortalProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        status=project.status,
        project_budget=float(project.project_budget),
        current_budget_remaining=float(project.current_budget_remaining),
        budget_percentage_remaining=float(
            (project.current_budget_remaining / project.project_budget * 100) if project.project_budget > 0 else 0
        ),
        total_hours_tracked=float(project.total_hours_tracked),
        contract_signed=project.contract_signed,
        contract_pdf_url=project.contract_pdf_url,
        created_at=project.created_at.isoformat() if project.created_at else None,
        milestones=milestone_list,
        deliverables=deliverable_list,
        change_requests=change_request_list,
        invoices=invoice_list,
    )


@router.get(
    "/deliverables/{deliverable_id}/activity",
    response_model=DeliverableActivityResponse,
)
async def get_deliverable_activity(deliverable_id: UUID, request: Request, db: AsyncSession = Depends(get_db)):
    """
    Get detailed activity for a deliverable (Requirement Phase 2).
    Requires X-Client-Token header for authentication.
    """
    ip_address = get_client_ip(request)
    user_agent = get_user_agent(request)

    # Authenticate client
    session, client = await authenticate_client_portal(request, db)

    # Get deliverable and verify access
    stmt = select(Deliverable).join(Project).where(and_(Deliverable.id == deliverable_id, Project.client_id == client.id))
    result = await db.execute(stmt)
    deliverable = result.scalar_one_or_none()

    if not deliverable:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deliverable not found")

    # Get time entries
    time_stmt = select(TimeEntry).where(TimeEntry.deliverable_id == deliverable.id).order_by(TimeEntry.start_time)
    time_result = await db.execute(time_stmt)
    time_entries = time_result.scalars().all()

    # Get commits
    commit_stmt = select(GitCommit).where(GitCommit.deliverable_id == deliverable.id).order_by(GitCommit.committed_at)
    commit_result = await db.execute(commit_stmt)
    commits = commit_result.scalars().all()

    # Calculate metrics - pass commits directly to avoid lazy loading
    activity_score = ActivityMetricsService.calculate_activity_score(deliverable, commits=commits)
    fraud_risk = ActivityMetricsService.classify_fraud_risk(activity_score, float(deliverable.actual_hours or 0), len(commits))

    # Build timeline
    timeline = []

    for entry in time_entries:
        # Ensure timezone-naive timestamp
        timestamp = entry.start_time
        if timestamp and timestamp.tzinfo is not None:
            timestamp = timestamp.replace(tzinfo=None)

        timeline.append(
            TimelineEvent(
                type="time_entry",
                timestamp=timestamp,
                description=entry.description or "Time tracked",
                duration_hours=(float(entry.duration_minutes / 60) if entry.duration_minutes else 0),
            )
        )

    for commit in commits:
        # Ensure timezone-naive timestamp
        timestamp = commit.committed_at
        if timestamp and timestamp.tzinfo is not None:
            timestamp = timestamp.replace(tzinfo=None)

        timeline.append(
            TimelineEvent(
                type="commit",
                timestamp=timestamp,
                description=commit.message,
                files_changed=commit.files_changed,
                commit_sha=commit.commit_sha,
            )
        )

    # Sort timeline
    timeline.sort(key=lambda x: x.timestamp)

    # Calculate totals
    total_files = sum(c.files_changed or 0 for c in commits)
    total_insertions = sum(c.insertions or 0 for c in commits)
    total_deletions = sum(c.deletions or 0 for c in commits)
    hours = float(deliverable.actual_hours or 0)
    commit_density = len(commits) / hours if hours > 0 else 0

    metrics = ActivityMetrics(
        total_commits=len(commits),
        total_files_changed=total_files,
        total_insertions=total_insertions,
        total_deletions=total_deletions,
        commit_density=commit_density,
        activity_score=activity_score,
        fraud_risk=fraud_risk,
    )

    # Validate timeline - pass time_entries and commits directly to avoid lazy loading
    validation_results = TimelineValidator.validate_time_commit_correlation(
        deliverable, time_entries=time_entries, commits=commits
    )

    timeline_validation = TimelineValidationResponse(
        commits_outside=validation_results["commits_outside"],
        commits_in_grace_period=validation_results["commits_in_grace_period"],
        outside_percentage=validation_results["outside_percentage"],
        is_suspicious=validation_results["is_suspicious"],
        needs_review=validation_results["needs_review"],
        summary=validation_results["summary"],
    )

    # Format response
    return DeliverableActivityResponse(
        deliverable={
            "id": deliverable.id,
            "title": deliverable.title,
            "status": deliverable.status,
            "work_type": deliverable.work_type,
            "actual_hours": float(deliverable.actual_hours or 0),
            "total_cost": float(deliverable.total_cost or 0),
        },
        time_entries=[
            {
                "id": t.id,
                "start_time": t.start_time,
                "end_time": t.end_time,
                "duration_hours": (float(t.duration_minutes / 60) if t.duration_minutes else 0),
                "description": t.description,
                "developer_notes": (t.developer_notes if t.notes_visible_to_client else None),
            }
            for t in time_entries
        ],
        commits=[
            {
                "sha": c.commit_sha,
                "message": c.message,
                "author": c.author_email,
                "committed_at": c.committed_at,
                "files_changed": c.files_changed,
                "insertions": c.insertions,
                "deletions": c.deletions,
            }
            for c in commits
        ],
        activity_metrics=metrics,
        timeline=timeline,
        timeline_validation=timeline_validation,
    )


# ============= CLIENT PORTAL INVOICES =============


@router.get("/invoices")
async def get_client_invoices(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Get all invoices for the authenticated client across all projects.
    Requires X-Client-Token header.
    """
    # Authenticate client
    session, client = await authenticate_client_portal(request, db)

    # Get all projects for this client
    project_stmt = select(Project).where(Project.client_id == client.id)
    project_result = await db.execute(project_stmt)
    projects = project_result.scalars().all()
    project_ids = [p.id for p in projects]
    project_map = {p.id: p.name for p in projects}

    if not project_ids:
        return {"invoices": [], "currency": "USD"}

    # Get all invoices for these projects
    invoice_stmt = select(Invoice).where(Invoice.project_id.in_(project_ids)).order_by(Invoice.created_at.desc())
    invoice_result = await db.execute(invoice_stmt)
    invoices = invoice_result.scalars().all()

    # Get developer's currency setting
    currency = "USD"
    if projects:
        from app.models.user import UserSettings

        settings_stmt = select(UserSettings).where(UserSettings.user_id == projects[0].user_id)
        settings_result = await db.execute(settings_stmt)
        user_settings = settings_result.scalar_one_or_none()
        if user_settings and user_settings.default_currency:
            currency = user_settings.default_currency

    invoice_list = [
        {
            "id": str(inv.id),
            "invoice_number": inv.invoice_number,
            "project_id": str(inv.project_id),
            "project_name": project_map.get(inv.project_id, "Unknown"),
            "status": inv.status,
            "subtotal": float(inv.subtotal),
            "platform_fee": float(inv.platform_fee),
            "tax_amount": float(inv.tax_amount),
            "total_amount": float(inv.total_amount),
            "payment_method": inv.payment_method,
            "invoice_pdf_url": inv.invoice_pdf_url,
            "due_date": inv.due_date.isoformat() if inv.due_date else None,
            "sent_at": inv.sent_at.isoformat() if inv.sent_at else None,
            "client_marked_paid": inv.client_marked_paid,
            "developer_verified": inv.developer_verified,
            "created_at": inv.created_at.isoformat() if inv.created_at else None,
        }
        for inv in invoices
    ]

    return {"invoices": invoice_list, "currency": currency}


@router.get("/invoices/{invoice_id}")
async def get_client_invoice_detail(invoice_id: UUID, request: Request, db: AsyncSession = Depends(get_db)):
    """
    Get single invoice with full payment details for client portal.
    Includes payment_gateway_name, payment_instructions, and detailed
    payment method info (mobile money, bank transfer, etc.) for manual payments.
    Requires X-Client-Token header.
    """
    # Authenticate client
    session, client = await authenticate_client_portal(request, db)

    # Get invoice
    invoice_stmt = select(Invoice).where(Invoice.id == invoice_id)
    invoice_result = await db.execute(invoice_stmt)
    invoice = invoice_result.scalar_one_or_none()

    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Verify the invoice belongs to one of client's projects
    project_stmt = select(Project).where(and_(Project.id == invoice.project_id, Project.client_id == client.id))
    project_result = await db.execute(project_stmt)
    project = project_result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=403, detail="Not authorized to view this invoice")

    # Get developer's currency setting
    from app.models.user import UserSettings

    settings_stmt = select(UserSettings).where(UserSettings.user_id == project.user_id)
    settings_result = await db.execute(settings_stmt)
    user_settings = settings_result.scalar_one_or_none()
    currency = user_settings.default_currency if user_settings else "USD"

    # Initialize payment details from client (fallback)
    payment_gateway_name = client.payment_gateway_name
    payment_instructions = client.payment_instructions

    # For manual payments, fetch detailed payment method info from payment_methods table
    payment_details = {}
    if invoice.payment_method == "manual":
        from app.models.payment_method import PaymentMethod

        # Get the default manual payment method for the developer
        payment_method_stmt = (
            select(PaymentMethod)
            .where(
                and_(
                    PaymentMethod.user_id == project.user_id,
                    PaymentMethod.method_type == "manual",
                    PaymentMethod.is_active == True,
                )
            )
            .order_by(PaymentMethod.is_default.desc())
        )

        payment_method_result = await db.execute(payment_method_stmt)
        payment_method = payment_method_result.scalar_one_or_none()

        if payment_method:
            # Use payment method details if available
            payment_gateway_name = payment_method.payment_gateway_name or payment_gateway_name
            payment_instructions = payment_method.payment_instructions or payment_instructions

            # Add specific payment type details
            payment_details = {
                "manual_payment_type": payment_method.manual_payment_type,
                # Mobile Money
                "mobile_money_provider": payment_method.mobile_money_provider,
                "mobile_money_number": payment_method.mobile_money_number,
                "mobile_money_name": payment_method.mobile_money_name,
                # Bank Transfer
                "bank_name": payment_method.bank_name,
                "account_name": payment_method.account_name,
                "account_number": payment_method.account_number,
                "swift_code": payment_method.swift_code,
                "branch_code": payment_method.branch_code,
                # PayPal
                "paypal_email": payment_method.paypal_email,
                # Wise
                "wise_email": payment_method.wise_email,
                # Cryptocurrency
                "crypto_wallet_address": payment_method.crypto_wallet_address,
                "crypto_network": payment_method.crypto_network,
                # Other
                "other_gateway_name": payment_method.other_gateway_name,
                "additional_info": payment_method.additional_info,
            }

    response = {
        "id": str(invoice.id),
        "invoice_number": invoice.invoice_number,
        "project_id": str(invoice.project_id),
        "project_name": project.name,
        "status": invoice.status,
        "subtotal": float(invoice.subtotal),
        "platform_fee": float(invoice.platform_fee),
        "tax_amount": float(invoice.tax_amount),
        "total_amount": float(invoice.total_amount),
        "payment_method": invoice.payment_method,
        "payment_gateway_name": payment_gateway_name,
        "payment_instructions": payment_instructions,
        "payment_details": payment_details,
        "invoice_pdf_url": invoice.invoice_pdf_url,
        "due_date": invoice.due_date.isoformat() if invoice.due_date else None,
        "sent_at": invoice.sent_at.isoformat() if invoice.sent_at else None,
        "client_marked_paid": invoice.client_marked_paid,
        "developer_verified": invoice.developer_verified,
        "notes": invoice.notes,
        "created_at": invoice.created_at.isoformat() if invoice.created_at else None,
        "currency": currency,
    }

    return response


@router.post("/invoices/{invoice_id}/mark-paid")
async def client_mark_invoice_paid_portal(invoice_id: UUID, request: Request, db: AsyncSession = Depends(get_db)):
    """
    Client marks manual payment as paid via client portal.
    Requires X-Client-Token header.
    """
    # Authenticate client
    session, client = await authenticate_client_portal(request, db)

    # Get invoice
    invoice_stmt = select(Invoice).where(Invoice.id == invoice_id)
    invoice_result = await db.execute(invoice_stmt)
    invoice = invoice_result.scalar_one_or_none()

    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Verify the invoice belongs to one of client's projects
    project_stmt = select(Project).where(and_(Project.id == invoice.project_id, Project.client_id == client.id))
    project_result = await db.execute(project_stmt)
    project = project_result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=403, detail="Not authorized to modify this invoice")

    # Verify this is a manual payment invoice
    if invoice.payment_method != "manual":
        raise HTTPException(status_code=400, detail="This action is only for manual payment invoices")

    # Check if already marked as paid
    if invoice.client_marked_paid:
        raise HTTPException(status_code=400, detail="Invoice has already been marked as paid")

    # Mark invoice as paid by client
    invoice.client_marked_paid = True
    invoice.client_marked_paid_at = datetime.utcnow()
    invoice.status = "awaiting_verification"

    await db.commit()
    await db.refresh(invoice)

    logger.info("Invoice %s marked as paid by client %s", invoice.invoice_number, client.email)

    return {
        "success": True,
        "message": "Invoice marked as paid. Developer will verify your payment.",
        "invoice_id": str(invoice.id),
        "status": invoice.status,
    }
