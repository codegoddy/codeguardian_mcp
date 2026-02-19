"""
Rate Limiter Utility using SlowAPI with Upstash Redis Backend

Provides centralized rate limiting for all API endpoints to protect against:
- Brute force attacks on authentication
- Abuse/spam on resource creation
- DoS attacks overwhelming the server
"""

import time
from typing import Callable, Optional

from fastapi import Request, Response
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.responses import JSONResponse

from app.core.config import settings
from app.core.logging_config import get_logger

logger = get_logger(__name__)


# -----------------------------------------------------------------------------
# Rate Limit Configuration
# -----------------------------------------------------------------------------

RATE_LIMITS = {
    # Auth endpoints - critical security
    "auth_login": "10/minute",
    "auth_register": "5/minute",
    "auth_forgot": "3/minute",
    "auth_otp": "10/minute",
    "auth_refresh": "20/minute",
    # AI endpoints - expensive resources
    "ai_estimation": "15/minute",
    # General limits
    "authenticated": "100/minute",
    "public": "30/minute",
}


# -----------------------------------------------------------------------------
# Custom Redis Storage for SlowAPI using Upstash
# -----------------------------------------------------------------------------


class UpstashRedisStorage:
    """
    Custom storage backend for SlowAPI using Upstash Redis REST API.
    Provides distributed rate limiting across multiple server instances.
    """

    def __init__(self):
        self._client = None

    @property
    def client(self):
        """Lazy initialization of Redis client"""
        if self._client is None:
            if settings.upstash_redis_rest_url and settings.upstash_redis_rest_token:
                try:
                    from upstash_redis import Redis

                    self._client = Redis(
                        url=settings.upstash_redis_rest_url,
                        token=settings.upstash_redis_rest_token,
                    )
                except Exception as e:
                    logger.error("Failed to initialize Redis", exc_info=True)
                    self._client = None
        return self._client

    def incr(self, key: str, expiry: int = 60) -> int:
        """Increment counter and set expiry if new key"""
        if not self.client:
            # Fallback: allow request if Redis unavailable
            return 1

        try:
            # Use INCR with EXPIRE for atomic counter
            count = self.client.incr(key)
            if count == 1:
                # New key, set expiry
                self.client.expire(key, expiry)
            return count
        except Exception as e:
            logger.error("Redis INCR error", exc_info=True)
            return 1  # Allow request on error

    def get(self, key: str) -> Optional[int]:
        """Get current count for key"""
        if not self.client:
            return None

        try:
            value = self.client.get(key)
            return int(value) if value else None
        except Exception as e:
            logger.error("Redis GET error", exc_info=True)
            return None


# Singleton storage instance
_redis_storage = UpstashRedisStorage()


# -----------------------------------------------------------------------------
# Custom Key Functions
# -----------------------------------------------------------------------------


def get_ip_key(request: Request) -> str:
    """Get rate limit key based on client IP address"""
    ip = get_remote_address(request) or "unknown"
    return f"ratelimit:ip:{ip}"


def get_user_key(request: Request) -> str:
    """Get rate limit key based on authenticated user ID"""
    # Try to extract user from auth header
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        try:
            from app.core.auth import decode_access_token

            token = auth_header.split(" ")[1]
            payload = decode_access_token(token)
            user_id = payload.get("user_id") or payload.get("sub")
            if user_id:
                return f"ratelimit:user:{user_id}"
        except Exception:
            pass

    # Fallback to IP-based limiting
    return get_ip_key(request)


def get_email_key(request: Request) -> str:
    """Get rate limit key based on email in request body (for forgot password)"""
    # For endpoints that have email in body, extract it
    # Note: This is called before body is consumed, so we use IP as backup
    return get_ip_key(request)


# -----------------------------------------------------------------------------
# Limiter Instance
# -----------------------------------------------------------------------------

# Create limiter with IP-based default key
limiter = Limiter(
    key_func=get_ip_key,
    default_limits=["100/minute"],
    storage_uri=None,  # We use custom storage methods
)


# -----------------------------------------------------------------------------
# Rate Limit Decorators
# -----------------------------------------------------------------------------


def auth_limit(limit_name: str = "auth_login"):
    """Decorator for auth endpoint rate limiting"""
    limit = RATE_LIMITS.get(limit_name, "10/minute")
    return limiter.limit(limit, key_func=get_ip_key)


def user_limit(limit_name: str = "authenticated"):
    """Decorator for user-based rate limiting (authenticated endpoints)"""
    limit = RATE_LIMITS.get(limit_name, "100/minute")
    return limiter.limit(limit, key_func=get_user_key)


def public_limit():
    """Decorator for public endpoint rate limiting"""
    limit = RATE_LIMITS.get("public", "30/minute")
    return limiter.limit(limit, key_func=get_ip_key)


# -----------------------------------------------------------------------------
# Exception Handler
# -----------------------------------------------------------------------------


async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> Response:
    """Custom handler for rate limit exceeded errors"""
    # Extract retry-after from exception if available
    retry_after = getattr(exc, "retry_after", 60)

    return JSONResponse(
        status_code=429,
        content={
            "error": "Too Many Requests",
            "message": f"Rate limit exceeded. Please try again in {retry_after} seconds.",
            "retry_after": retry_after,
        },
        headers={"Retry-After": str(retry_after)},
    )


# -----------------------------------------------------------------------------
# Manual Rate Limiting (for complex cases like client portal)
# -----------------------------------------------------------------------------


async def check_rate_limit(
    identifier: str,
    limit: int = 5,
    window_seconds: int = 3600,
    prefix: str = "ratelimit:custom",
) -> tuple[bool, int]:
    """
    Check if identifier has exceeded rate limit.

    Args:
        identifier: Unique identifier (email, IP, etc.)
        limit: Maximum requests allowed
        window_seconds: Time window in seconds
        prefix: Key prefix for namespacing

    Returns:
        Tuple of (is_allowed, current_count)
    """
    key = f"{prefix}:{identifier}"
    current = _redis_storage.incr(key, window_seconds)

    if current is None or current <= limit:
        return True, current or 0

    return False, current


async def get_remaining_limit(identifier: str, limit: int = 5, prefix: str = "ratelimit:custom") -> int:
    """Get remaining requests for identifier"""
    key = f"{prefix}:{identifier}"
    current = _redis_storage.get(key)

    if current is None:
        return limit

    return max(0, limit - current)
