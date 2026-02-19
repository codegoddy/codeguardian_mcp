import os

from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Import settings BEFORE initializing logging
from app.core.config import settings

# Initialize logging FIRST (before any other imports)
from app.core.logging_config import get_logger, log_shutdown_event, log_startup_event, setup_logging

# Configure logging based on environment
setup_logging(
    log_file=os.getenv("LOG_FILE", None),  # Optional: path to log file
    json_logs=settings.environment == "production",
)

# Get root logger
logger = get_logger(__name__)

import asyncio
import json

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware

from app.api import (
    ai_estimation,
    auth,
    auth_cookies,
    auth_supabase,
    change_requests,
    client_portal,
    clients,
    contracts,
    deliverables,
    git_integration,
    health,
    payment_methods,
    payments,
    paystack,
    projects,
)
from app.api import settings as settings_api
from app.api import (
    subscriptions,
    templates,
    version,
    waitlist,
)
from app.common.exception_handlers import register_exception_handlers
from app.core.config import settings
from app.event_handlers import register_all_event_handlers
from app.middleware.rate_limit_middleware import RateLimitMiddleware
from app.middleware.sanitization_middleware import InputSanitizationMiddleware, SQLInjectionProtectionMiddleware
from app.utils.nats_client import close_nats, init_nats
from app.utils.rate_limiter import limiter, rate_limit_exceeded_handler
from app.utils.supabase_storage import ensure_bucket_exists, init_supabase_storage

app = FastAPI(title="DevHQ Auth API", version="1.0.0")

# Initialize rate limiter
app.state.limiter = limiter

# Register rate limit exception handler
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

# Register exception handlers
register_exception_handlers(app)

# ============================================================================
# OBSERVABILITY SETUP (Must be before middleware)
# ============================================================================

# DISABLED: OpenTelemetry tracing to get cleaner error logs
# from app.observability import setup_tracing, setup_metrics
# logger.info("Initializing observability...")
# setup_tracing(app, service_name=settings.app_name)
# setup_metrics(app)
# logger.info("Observability initialized")
logger.info("OpenTelemetry tracing is DISABLED for debugging")


# ============================================================================
# SECURITY MIDDLEWARE
# ============================================================================


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Add security headers to all responses to protect against common web vulnerabilities.

    Headers added:
    - X-Content-Type-Options: Prevent MIME type sniffing
    - X-Frame-Options: Prevent clickjacking attacks
    - X-XSS-Protection: Enable browser XSS filtering (legacy support)
    - Strict-Transport-Security: Force HTTPS (production only)
    - Content-Security-Policy: Restrict resource loading
    """

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        # Prevent MIME type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"

        # Prevent clickjacking - don't allow embedding in iframes
        # Exception: Allow same origin for internal embeds
        response.headers["X-Frame-Options"] = "SAMEORIGIN"

        # Enable XSS filtering in older browsers (legacy support)
        response.headers["X-XSS-Protection"] = "1; mode=block"

        # Force HTTPS in production (HSTS)
        if settings.environment == "production":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

        # Content Security Policy - restrict resource loading
        # Note: This is a basic policy. Adjust based on your needs.
        csp_policy = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "  # Allow inline scripts for development
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https:; "  # Allow images from HTTPS and data URIs
            "font-src 'self' data:; "
            "connect-src 'self' https:; "  # Allow API calls to HTTPS endpoints
            "frame-ancestors 'self'; "
            "base-uri 'self'; "
            "form-action 'self'"
        )
        response.headers["Content-Security-Policy"] = csp_policy

        # Referrer policy - don't leak referrer information
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Permissions policy - disable unnecessary browser features
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"

        return response


class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    """
    Limit request body size to prevent DoS attacks via large payloads.
    Default: 10MB for regular requests, 50MB for file uploads.
    """

    def __init__(self, app, max_upload_size: int = 10 * 1024 * 1024):
        super().__init__(app)
        self.max_upload_size = max_upload_size
        self.file_upload_size = 50 * 1024 * 1024  # 50MB for file uploads

    async def dispatch(self, request: Request, call_next):
        if request.method in ["POST", "PUT", "PATCH"]:
            content_length = int(request.headers.get("content-length", 0))

            # Allow larger size for file upload endpoints
            is_file_upload = any(path in str(request.url.path) for path in ["/upload", "/attachment", "/import"])

            max_size = self.file_upload_size if is_file_upload else self.max_upload_size

            if content_length > max_size:
                return JSONResponse(
                    status_code=413,
                    content={
                        "error": "Request Entity Too Large",
                        "message": f"Request body too large. Maximum size: {max_size / (1024*1024):.1f}MB",
                        "max_size_bytes": max_size,
                    },
                )

        return await call_next(request)


# ============================================================================
# OBSERVABILITY MIDDLEWARE (Add before other middleware)
# ============================================================================

from app.middleware.correlation_middleware import CorrelationIdMiddleware

# Add Correlation ID middleware (FIRST - tracks requests across services)
app.add_middleware(CorrelationIdMiddleware)

# Add Security Headers middleware (first line of defense)
app.add_middleware(SecurityHeadersMiddleware)

# Add Request Size Limit middleware (prevent large payload attacks)
app.add_middleware(RequestSizeLimitMiddleware, max_upload_size=10 * 1024 * 1024)

# Add Input Sanitization middleware (XSS prevention)
app.add_middleware(InputSanitizationMiddleware, strict_mode=False)

# Add SQL Injection Protection middleware
app.add_middleware(SQLInjectionProtectionMiddleware, strict_mode=False)

# Add Trusted Host middleware for production (prevent host header attacks)
if settings.environment == "production":
    allowed_hosts = ["devhq.site", "*.devhq.site", "dev-hq-backend.onrender.com"]
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=allowed_hosts)

# Add Global Rate Limit middleware (first, so it runs on all requests)
app.add_middleware(RateLimitMiddleware, authenticated_limit=100, public_limit=30)

# CORS middleware (IMPORTANT: Must support credentials for cookies/headers)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "x-new-access-token",
        "x-new-refresh-token",
        "X-CSRF-Token",
    ],
)

# Auth routes - USING SUPABASE AUTH (commented out old auth routers)
# app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
# app.include_router(auth_cookies.router, prefix="/api/auth-cookies", tags=["auth-cookies"])
app.include_router(auth_supabase.router, tags=["auth-supabase"])  # Already has /api/auth prefix in router
app.include_router(settings_api.router, prefix="/api", tags=["settings"])
app.include_router(templates.router, prefix="/api", tags=["templates"])
app.include_router(clients.router, prefix="/api", tags=["clients"])
app.include_router(contracts.router, prefix="/api/contracts", tags=["contracts"])
app.include_router(projects.router, prefix="/api", tags=["projects"])
app.include_router(git_integration.router, prefix="/api", tags=["git-integration"])
app.include_router(deliverables.router, prefix="/api", tags=["deliverables"])
app.include_router(paystack.router, prefix="/api", tags=["paystack"])
app.include_router(payments.router, prefix="/api", tags=["payments"])
app.include_router(payment_methods.router, prefix="/api", tags=["payment-methods"])
app.include_router(subscriptions.router, prefix="/api", tags=["subscriptions"])
app.include_router(change_requests.router, prefix="/api", tags=["change-requests"])
app.include_router(client_portal.router, prefix="/api/client-portal", tags=["client-portal"])

# Import and register integrations router
from app.api import integrations

app.include_router(integrations.router, prefix="/api")

# Import and register time tracking routers
from app.api import cli_tokens, reviews, time_entries, time_sessions, webhooks

app.include_router(webhooks.router, prefix="/api", tags=["webhooks"])
app.include_router(reviews.router, prefix="/api", tags=["reviews"])
app.include_router(time_entries.router, prefix="/api", tags=["time-entries"])
app.include_router(time_sessions.router)  # Already has prefix in router definition
app.include_router(cli_tokens.router)  # Already has prefix in router definition
app.include_router(version.router)  # CLI version endpoint (public, no auth required)
app.include_router(waitlist.router)  # Waitlist endpoint (public, no auth required)

# Import and register WebSocket router for real-time NATS events
from app.api import websocket as websocket_router

app.include_router(websocket_router.router, prefix="/api", tags=["websocket"])

# Import and register planning and Google Calendar routers
from app.api import google_calendar, planning

app.include_router(planning.router)  # Already has prefix in router definition
app.include_router(google_calendar.router)  # Already has prefix in router definition

# Import and register dashboard bundle router
from app.api import dashboard

app.include_router(dashboard.router, prefix="/api", tags=["dashboard"])

# Import and register support router
from app.api import support

app.include_router(support.router, prefix="/api/support", tags=["support"])

# Import and register support chat router (AI-powered)
from app.api import support_chat

app.include_router(support_chat.router, prefix="/api/support", tags=["support-chat"])

# Import and register AI estimation router
app.include_router(ai_estimation.router)  # Already has prefix in router definition

# Import and register payment milestones router
from app.api import payment_milestones

app.include_router(payment_milestones.router, prefix="/api", tags=["payment-milestones"])

# Import and register activities and notifications routers
from app.api import activities, notifications

app.include_router(activities.router, prefix="/api", tags=["activities"])
app.include_router(notifications.router, prefix="/api", tags=["notifications"])

# Register health check endpoints
app.include_router(health.router, tags=["health"])

# Global task variable to keep email worker running
email_worker_task = None


async def start_email_worker():
    """
    Start background email worker that listens to NATS subjects.
    Delegates to consolidated event_handlers package.
    """
    await register_all_event_handlers()


@app.on_event("startup")
async def startup_event():
    """Initialize services on startup - optimized for fast cold starts"""
    global email_worker_task

    # Log startup event
    log_startup_event()

    # Note: Observability (tracing and metrics) was already initialized before middleware

    # Initialize Supabase storage
    try:
        init_supabase_storage()
        # Ensure profile-images bucket exists
        bucket_name = settings.supabase_profile_images_bucket
        if ensure_bucket_exists(bucket_name, public=True):
            logger.info(f"Supabase storage initialized, bucket '{bucket_name}' ready")
        else:
            logger.warning(f"Supabase storage initialized but bucket '{bucket_name}' may not exist")
    except Exception as e:
        logger.error(f"Supabase storage initialization failed: {e}", exc_info=True)
        # App can still work without storage (profile images won't work)

    # Run async initializations in parallel for faster startup
    async def init_nats_safe():
        try:
            await init_nats()
        except Exception as e:
            logger.warning("NATS initialization failed (app will work without NATS)", exc_info=True)

    async def init_session_monitor_safe():
        try:
            from app.workers.session_monitor import start_session_monitor

            await start_session_monitor()
            logger.info("Session monitor started")
        except Exception as e:
            logger.error("Session monitor failed to start", exc_info=True)

    async def init_redis_cache_safe():
        try:
            from app.utils.redis_client import initialize_static_cache

            await initialize_static_cache()
            logger.info("Redis cache initialized with static data")
        except Exception as e:
            logger.warning(
                "Redis cache initialization failed (app will work without caching)",
                exc_info=True,
            )

    # Run all initializations in parallel
    await asyncio.gather(
        init_nats_safe(),
        init_session_monitor_safe(),
        init_redis_cache_safe(),
        return_exceptions=True,
    )

    # Start the email worker in background (don't wait for it)
    logger.debug("Starting email worker in background...")
    email_worker_task = asyncio.create_task(start_email_worker())

    # No need to wait - API is ready immediately
    logger.info("Startup complete - API ready to accept requests")


@app.on_event("shutdown")
async def shutdown_event():
    log_shutdown_event()

    if email_worker_task and not email_worker_task.done():
        email_worker_task.cancel()
        try:
            await email_worker_task
        except asyncio.CancelledError:
            pass

    await close_nats()
    logger.info("Shutdown complete")


@app.get("/")
async def root():
    return {"message": "DevHQ Auth API"}


@app.get("/test-auth")
async def test_auth(request: Request):
    """Test endpoint to check authentication headers"""
    auth_header = request.headers.get("authorization")
    return {
        "auth_header": auth_header,
        "auth_header_length": len(auth_header) if auth_header else 0,
        "user_agent": request.headers.get("user-agent"),
        "all_headers": dict(request.headers),
    }
