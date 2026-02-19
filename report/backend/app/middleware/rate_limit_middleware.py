"""
Global Rate Limiting Middleware

Applies rate limiting to all API routes that don't have explicit rate limits.
- Authenticated routes: 100 requests/min per user
- Public routes: 30 requests/min per IP
"""

import time
from typing import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.config import settings
from app.core.logging_config import get_logger

logger = get_logger(__name__)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Global rate limiting middleware using Redis.
    Applies default limits to routes without explicit rate limits.
    """

    # Routes that already have explicit rate limiting (skip these)
    SKIP_ROUTES = {
        "/api/auth/login",
        "/api/auth/register",
        "/api/auth/verify",
        "/api/auth/forgot-password",
        "/api/auth/reset-password",
        "/api/auth/verify-otp",
        "/api/auth/refresh",
        "/api/ai/estimate-template",
        "/api/ai/estimate-deliverable",
        "/api/ai/generate-commit-message",
        "/api/ai/generate-template",
        "/api/client-portal/request-access",
    }

    # Public routes (use IP-based limiting at 30/min)
    PUBLIC_ROUTES = {
        "/api/version",
        "/api/waitlist",
        "/api/client-portal/validate-token",
        "/docs",
        "/openapi.json",
        "/",
    }

    # Routes to completely skip (health checks, etc.)
    EXEMPT_ROUTES = {
        "/health",
        "/healthz",
        "/favicon.ico",
    }

    def __init__(self, app, authenticated_limit: int = 100, public_limit: int = 30):
        super().__init__(app)
        self.authenticated_limit = authenticated_limit
        self.public_limit = public_limit
        self._storage = None

    @property
    def storage(self):
        """Lazy initialization of Redis storage"""
        if self._storage is None:
            if settings.upstash_redis_rest_url and settings.upstash_redis_rest_token:
                try:
                    from upstash_redis import Redis

                    self._storage = Redis(
                        url=settings.upstash_redis_rest_url,
                        token=settings.upstash_redis_rest_token,
                    )
                except Exception as e:
                    logger.error("Failed to initialize Redis", exc_info=True)
        return self._storage

    def _get_client_ip(self, request: Request) -> str:
        """Extract client IP address"""
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()

        real_ip = request.headers.get("x-real-ip")
        if real_ip:
            return real_ip

        if request.client:
            return request.client.host

        return "unknown"

    def _get_user_id(self, request: Request) -> str | None:
        """Extract user ID from auth token"""
        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            try:
                from app.core.auth import extract_user_id_from_token

                token = auth_header.split(" ")[1]
                return extract_user_id_from_token(token)
            except Exception:
                pass
        return None

    def _check_limit(self, key: str, limit: int, window: int = 60) -> tuple[bool, int]:
        """Check if rate limit exceeded. Returns (allowed, current_count)"""
        if not self.storage:
            return True, 0  # Allow if Redis unavailable

        try:
            count = self.storage.incr(key)
            if count == 1:
                self.storage.expire(key, window)
            return count <= limit, count
        except Exception as e:
            logger.error("Redis error", exc_info=True)
            return True, 0  # Allow on error

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        path = request.url.path

        # Skip exempt routes
        if path in self.EXEMPT_ROUTES:
            return await call_next(request)

        # Skip routes with explicit rate limiting
        if path in self.SKIP_ROUTES:
            return await call_next(request)

        # Skip WebSocket connections
        if request.headers.get("upgrade", "").lower() == "websocket":
            return await call_next(request)

        # Determine if authenticated or public
        user_id = self._get_user_id(request)
        client_ip = self._get_client_ip(request)

        if user_id:
            # Authenticated user - 100/min limit
            key = f"ratelimit:global:user:{user_id}"
            limit = self.authenticated_limit
        elif path in self.PUBLIC_ROUTES or path.startswith("/api/client-portal"):
            # Public route - 30/min limit per IP
            key = f"ratelimit:global:ip:{client_ip}"
            limit = self.public_limit
        else:
            # Other routes (likely authenticated) - use IP as fallback
            key = f"ratelimit:global:ip:{client_ip}"
            limit = self.authenticated_limit

        # Check rate limit
        allowed, current_count = self._check_limit(key, limit)

        if not allowed:
            return JSONResponse(
                status_code=429,
                content={
                    "error": "Too Many Requests",
                    "message": f"Rate limit exceeded ({limit}/minute). Please slow down.",
                    "retry_after": 60,
                },
                headers={"Retry-After": "60"},
            )

        # Add rate limit headers to response
        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(max(0, limit - current_count))

        return response
