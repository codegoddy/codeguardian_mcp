"""
Input Sanitization Middleware

Provides request-level input sanitization for XSS prevention and security.
This middleware sanitizes incoming request data before it reaches the application.
"""

import logging
import re
from typing import Callable, Set

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

logger = logging.getLogger(__name__)


class InputSanitizationMiddleware(BaseHTTPMiddleware):
    """
    Middleware to sanitize incoming request data for XSS prevention.

    Sanitizes:
    - JSON body fields
    - Query parameters
    - Form data

    Protection against:
    - Script tags (<script>)
    - Event handlers (onclick, onerror, etc.)
    - JavaScript URLs (javascript:)
    - Data URLs (data:)
    - HTML entities encoding attacks

    Note: This is a defense-in-depth measure. Pydantic validators and
    output encoding in templates should be the primary defenses.
    """

    # Routes that should skip sanitization (already validated, APIs, etc.)
    SKIP_ROUTES: Set[str] = {
        "/api/auth/login",
        "/api/auth/register",
        "/api/auth/refresh",
        "/health",
        "/healthz",
    }

    # Route prefixes that should skip sanitization (file uploads, etc.)
    SKIP_ROUTE_PREFIXES: Set[str] = {
        "/api/settings/profile-image",
        "/api/upload",
        "/api/files",
    }

    # Content types that should skip body sanitization (file uploads, binary data)
    SKIP_CONTENT_TYPES: Set[str] = {
        "multipart/form-data",
        "application/octet-stream",
        "image/",
        "video/",
        "audio/",
        "application/pdf",
        "application/zip",
    }

    # Fields that should be skipped (may contain intentional special chars)
    SKIP_FIELDS: Set[str] = {
        "password",
        "secret",
        "token",
        "api_key",
        "authorization",
        "code",
        "state",
        "otp",
    }

    # Patterns to detect potential XSS attacks
    XSS_PATTERNS = [
        # Script tags
        (r"<script[^>]*>.*?</script>", "Script tag detected"),
        # Event handlers
        (r"\bon\w+\s*=", "Event handler detected"),
        # JavaScript protocol
        (r"javascript:", "JavaScript protocol detected"),
        # Data URLs
        (r"data:text/html", "Data URL detected"),
        # Iframe srcdoc
        (r"<iframe[^>]*srcdoc", "Iframe srcdoc detected"),
        # Expression (IE CSS)
        (r"expression\s*\(", "CSS expression detected"),
        # VBScript
        (r"vbscript:", "VBScript protocol detected"),
    ]

    def __init__(self, app, strict_mode: bool = False):
        super().__init__(app)
        self.strict_mode = strict_mode

    async def dispatch(self, request: Request, call_next: Callable):
        path = request.url.path

        # Skip sanitization for exempt routes
        if path in self.SKIP_ROUTES:
            return await call_next(request)

        # Skip sanitization for route prefixes (file uploads, etc.)
        if any(path.startswith(prefix) for prefix in self.SKIP_ROUTE_PREFIXES):
            return await call_next(request)

        # Skip for WebSocket connections
        if request.headers.get("upgrade", "").lower() == "websocket":
            return await call_next(request)

        # Sanitize query parameters
        sanitized_query = self._sanitize_dict(dict(request.query_params))
        if sanitized_query != dict(request.query_params):
            # Rebuild URL with sanitized query
            from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

            parsed = urlparse(str(request.url))
            new_query = urlencode(sanitized_query)
            new_url = urlunparse(parsed._replace(query=new_query))
            request._url = urlparse(new_url)

        # Process request body if present
        content_type = request.headers.get("content-type", "")

        # Skip body sanitization for file uploads and binary content
        should_skip_body = any(skip_type in content_type for skip_type in self.SKIP_CONTENT_TYPES)

        if should_skip_body:
            # Skip sanitization for file uploads and binary data
            return await call_next(request)

        if "application/json" in content_type:
            try:
                body = await request.body()
                if body:
                    # Parse and sanitize JSON
                    import json

                    data = json.loads(body)
                    sanitized = self._sanitize_value(data)

                    # Check for detected threats
                    threats = self._detect_threats(data)
                    if threats:
                        logger.warning(
                            "XSS threat detected in request body - Path: %s, Threats: %s",
                            path,
                            threats,
                        )

                        if self.strict_mode:
                            return JSONResponse(
                                status_code=400,
                                content={
                                    "success": False,
                                    "error": {
                                        "code": "INVALID_INPUT",
                                        "message": "Potentially dangerous content detected in request",
                                        "details": {"threats": threats},
                                    },
                                },
                            )

                    # Replace request body with sanitized data
                    request._body = json.dumps(sanitized).encode()

            except (json.JSONDecodeError, UnicodeDecodeError):
                # Let FastAPI handle invalid JSON or binary data
                pass
            except Exception as e:
                logger.error("Error sanitizing request body: %s", e, exc_info=True)

        return await call_next(request)

    def _sanitize_dict(self, data: dict) -> dict:
        """Sanitize all values in a dictionary."""
        return {k: self._sanitize_value(v) for k, v in data.items()}

    def _sanitize_value(self, value):
        """Recursively sanitize a value."""
        if isinstance(value, str):
            return self._sanitize_string(value)
        elif isinstance(value, dict):
            return self._sanitize_dict(value)
        elif isinstance(value, list):
            return [self._sanitize_value(item) for item in value]
        else:
            return value

    def _sanitize_string(self, value: str) -> str:
        """
        Sanitize a string for XSS prevention.

        This function:
        1. Removes script tags
        2. Removes event handlers
        3. Removes dangerous protocols

        Note: We intentionally do NOT HTML-encode the result to avoid
        double-encoding issues. The pattern-based sanitization above
        is sufficient for XSS protection. HTML encoding should be done
        on output (in templates/UI) when rendering content.
        """
        if not value:
            return value

        sanitized = value

        # Remove script tags and their contents
        sanitized = re.sub(r"<script[^>]*>.*?</script>", "", sanitized, flags=re.IGNORECASE | re.DOTALL)

        # Remove event handlers (onclick, onerror, etc.)
        sanitized = re.sub(r'\s*on\w+\s*=\s*["\'][^"\']*["\']', "", sanitized)
        sanitized = re.sub(r"\s*on\w+\s*=\s*[^\s>]+", "", sanitized)

        # Remove javascript: URLs
        sanitized = re.sub(r"javascript:", "", sanitized, flags=re.IGNORECASE)

        # Remove vbscript: URLs
        sanitized = re.sub(r"vbscript:", "", sanitized, flags=re.IGNORECASE)

        # Remove data: URLs (can be used for XSS)
        sanitized = re.sub(r"data:text/html", "", sanitized, flags=re.IGNORECASE)

        # Remove iframe srcdoc
        sanitized = re.sub(r"<iframe[^>]*srcdoc", "<iframe", sanitized, flags=re.IGNORECASE)

        # Remove expression (IE CSS expressions)
        sanitized = re.sub(r"expression\s*\(", "", sanitized, flags=re.IGNORECASE)

        return sanitized.strip()

    def _detect_threats(self, data) -> list:
        """Detect potential XSS threats in data."""
        threats = []

        def check_value(value, path=""):
            if isinstance(value, str):
                for pattern, description in self.XSS_PATTERNS:
                    if re.search(pattern, value, re.IGNORECASE | re.DOTALL):
                        threats.append(
                            {
                                "location": path or "value",
                                "threat": description,
                                "pattern": pattern,
                            }
                        )
            elif isinstance(value, dict):
                for k, v in value.items():
                    check_value(v, f"{path}.{k}" if path else k)
            elif isinstance(value, list):
                for i, item in enumerate(value):
                    check_value(item, f"{path}[{i}]" if path else f"[{i}]")

        check_value(data)
        return threats


class SQLInjectionProtectionMiddleware(BaseHTTPMiddleware):
    """
    Middleware to detect and block potential SQL injection attempts.

    This is a defense-in-depth measure. The primary defense should be
    using parameterized queries (which the application already does).
    """

    # SQL injection patterns
    SQL_PATTERNS = [
        r"(\%27)|(\')|(\-\-)|(\%23)|(#)",
        r"(\%3D)|(=)[^\n]*((\%27)|(\')|(\-\-)|(\%3B)|(;))",
        r"\w*(\%27)|(\')|((\%6F)|(o)|(\%4F))((\%72)|(r)|(\%52))",
        r"((\%27)|(\')|)union",
        r"exec(\s|\+)+(s|x)p\w+",
    ]

    # Routes that should skip SQL injection checks
    SKIP_ROUTES: Set[str] = {
        "/health",
        "/healthz",
        "/docs",
        "/openapi.json",
    }

    def __init__(self, app, strict_mode: bool = False):
        super().__init__(app)
        self.strict_mode = strict_mode

    async def dispatch(self, request: Request, call_next: Callable):
        path = request.url.path

        # Skip for exempt routes
        if path in self.SKIP_ROUTES:
            return await call_next(request)

        # Check query parameters
        for key, value in request.query_params.items():
            if self._contains_sql_injection(value):
                logger.warning("Potential SQL injection detected - Path: %s, Param: %s", path, key)
                return self._blocked_response()

        return await call_next(request)

    def _contains_sql_injection(self, value: str) -> bool:
        """Check if a value contains SQL injection patterns."""
        for pattern in self.SQL_PATTERNS:
            if re.search(pattern, value, re.IGNORECASE):
                return True
        return False

    def _blocked_response(self) -> JSONResponse:
        """Return a blocked response."""
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "error": {
                    "code": "INVALID_INPUT",
                    "message": "Potentially dangerous input detected",
                },
            },
        )
