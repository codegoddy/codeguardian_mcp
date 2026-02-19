"""
CORS Validation Middleware

Validates CORS origins and adds security headers for cross-origin requests.
"""

import logging
import re
from typing import Callable, Optional, Set

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger(__name__)


class CORSValidationMiddleware(BaseHTTPMiddleware):
    """
    Middleware to validate CORS origins and add security headers.

    Features:
    - Validates origin against allowed list
    - Logs CORS violations
    - Adds security headers for cross-origin requests
    - Handles preflight requests properly
    """

    # Allowed schemes
    ALLOWED_SCHEMES = {"http", "https"}

    # Wildcard pattern for subdomains
    SUBDOMAIN_WILDCARD = re.compile(r"^\*\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$")

    # Pattern to match IP addresses
    IP_PATTERN = re.compile(r"^(\d{1,3}\.){3}\d{1,3}$")

    def __init__(self, app, allowed_origins: Set[str], allow_credentials: bool = True):
        super().__init__(app)
        self.allowed_origins = allowed_origins
        self.allow_credentials = allow_credentials
        self._compiled_patterns = self._compile_patterns()

    def _compile_patterns(self) -> dict:
        """Compile regex patterns for fast matching."""
        patterns = {}
        for origin in self.allowed_origins:
            if "*" in origin:
                # Convert wildcard pattern to regex
                escaped = re.escape(origin)
                regex_str = escaped.replace(r"\*", r"[a-zA-Z0-9-]+")
                patterns[origin] = re.compile(f"^{regex_str}$")
        return patterns

    def _is_valid_origin(self, origin: str) -> bool:
        """Validate an origin against allowed origins."""
        if not origin:
            return False

        # Parse origin
        try:
            from urllib.parse import urlparse

            parsed = urlparse(origin)

            # Check scheme
            if parsed.scheme.lower() not in self.ALLOWED_SCHEMES:
                logger.debug("CORS origin rejected: invalid scheme %s", parsed.scheme)
                return False

            # Check hostname
            hostname = parsed.hostname
            if not hostname:
                logger.debug("CORS origin rejected: no hostname")
                return False

            # Check if exact match
            if origin in self.allowed_origins:
                return True

            # Check wildcard patterns
            for wildcard, pattern in self._compiled_patterns.items():
                if pattern.match(hostname):
                    return True

            # Check if origin is in allowed_origins (even with port)
            if origin in self.allowed_origins:
                return True

            logger.debug("CORS origin rejected: %s not in allowed list", origin)
            return False

        except Exception as e:
            logger.error("Error validating CORS origin: %s", e)
            return False

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Get origin header
        origin = request.headers.get("origin")

        # Handle preflight requests
        if request.method == "OPTIONS" and origin:
            if not self._is_valid_origin(origin):
                logger.warning(
                    "CORS preflight rejected - Origin: %s, Path: %s",
                    origin,
                    request.url.path,
                )
                return Response(status_code=403, content="CORS origin not allowed")

            # Build preflight response
            response = Response(
                status_code=204,
                headers={
                    "Access-Control-Allow-Origin": origin,
                    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-CSRF-Token, X-Requested-With",
                    "Access-Control-Allow-Credentials": ("true" if self.allow_credentials else "false"),
                    "Access-Control-Max-Age": "86400",
                },
            )
            return response

        # Process request
        response = await call_next(request)

        # Add CORS headers to response
        if origin and self._is_valid_origin(origin):
            response.headers["Access-Control-Allow-Origin"] = origin
            if self.allow_credentials:
                response.headers["Access-Control-Allow-Credentials"] = "true"

        return response


def validate_cors_origin(origin: str, allowed_origins: Set[str]) -> bool:
    """
    Validate a single CORS origin.

    Args:
        origin: The origin to validate
        allowed_origins: Set of allowed origins

    Returns:
        True if origin is valid, False otherwise
    """
    if not origin:
        return False

    try:
        from urllib.parse import urlparse

        parsed = urlparse(origin)

        # Must have valid scheme
        if parsed.scheme not in ("http", "https"):
            return False

        # Must have hostname
        if not parsed.hostname:
            return False

        # Check exact match
        if origin in allowed_origins:
            return True

        # Check wildcard patterns
        for allowed in allowed_origins:
            if "*" in allowed:
                escaped = re.escape(allowed)
                regex_str = escaped.replace(r"\*", r"[a-zA-Z0-9-]+")
                if re.match(f"^{regex_str}$", parsed.hostname):
                    return True

        return False

    except Exception:
        return False


def get_allowed_origins(environment: str, frontend_url: str) -> set:
    """
    Get the set of allowed CORS origins based on environment.

    Args:
        environment: Current environment (development, staging, production)
        frontend_url: Frontend URL

    Returns:
        Set of allowed origins
    """
    origins = set()

    # Always add frontend URL
    if frontend_url:
        origins.add(frontend_url)

    if environment == "production":
        # Production: strict origin list
        origins.update(
            [
                "https://www.devhq.site",
                "https://devhq.site",
                "https://api.devhq.site",
            ]
        )
    else:
        # Development: allow localhost
        origins.update(
            [
                "http://localhost:3000",
                "http://127.0.0.1:3000",
                "http://localhost:8000",
                "http://127.0.0.1:8000",
            ]
        )

    return origins
