"""
CSRF Protection Middleware

Protects against Cross-Site Request Forgery attacks when using cookies.
Uses Double Submit Cookie pattern.
"""

import hashlib
import hmac
import secrets
from typing import Callable

from fastapi import HTTPException, Request, status
from fastapi.responses import Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings

CSRF_TOKEN_COOKIE = "devhq_csrf_token"
CSRF_TOKEN_HEADER = "X-CSRF-Token"


class CSRFMiddleware(BaseHTTPMiddleware):
    """
    CSRF protection middleware using Double Submit Cookie pattern.

    How it works:
    1. Server generates a random CSRF token
    2. Token is sent as both a cookie and returned in response
    3. Frontend includes token in X-CSRF-Token header
    4. Server validates that header matches cookie
    """

    def __init__(self, app):
        super().__init__(app)
        self.safe_methods = {"GET", "HEAD", "OPTIONS", "TRACE"}
        self.excluded_paths = {
            "/api/auth/login",
            "/api/auth/register",
            "/api/auth/verify",
            "/api/auth/forgot-password",
            "/api/auth/reset-password",
            "/api/auth/oauth",
            "/api/client-portal",
            "/api/settings/profile-image",  # File uploads handle auth separately
            "/health",
            "/metrics",
            "/docs",
            "/openapi.json",
        }

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Skip CSRF check for safe methods
        if request.method in self.safe_methods:
            response = await call_next(request)
            # Set CSRF token cookie for future requests
            self._set_csrf_token(response)
            return response

        # Skip CSRF check for excluded paths
        if any(request.url.path.startswith(path) for path in self.excluded_paths):
            return await call_next(request)

        # Only check CSRF for cookie-based authentication
        # (Skip if using Authorization header for backward compatibility)
        has_cookie = request.cookies.get("devhq_access_token")
        has_auth_header = request.headers.get("authorization")

        if has_cookie and not has_auth_header:
            # Verify CSRF token
            csrf_cookie = request.cookies.get(CSRF_TOKEN_COOKIE)
            csrf_header = request.headers.get(CSRF_TOKEN_HEADER)

            if not csrf_cookie or not csrf_header:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="CSRF token missing")

            if not self._verify_csrf_token(csrf_cookie, csrf_header):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="CSRF token invalid")

        # Process request
        response = await call_next(request)

        # Refresh CSRF token in response
        self._set_csrf_token(response)

        return response

    def _generate_csrf_token(self) -> str:
        """Generate a random CSRF token"""
        return secrets.token_urlsafe(32)

    def _set_csrf_token(self, response: Response) -> None:
        """Set CSRF token cookie and header"""
        # Check if token already exists in response
        existing_token = response.headers.get(CSRF_TOKEN_HEADER)
        if existing_token:
            return

        # Generate new token
        token = self._generate_csrf_token()

        # Set as cookie
        is_production = settings.environment == "production"
        cookie_domain = ".devhq.site" if is_production else None
        secure = is_production

        # Use SameSite=None in production to allow cross-site requests (e.g. from frontend on different domain)
        # Use SameSite=Lax in development (HTTP) as None requires Secure=True
        samesite = "none" if is_production else "lax"

        response.set_cookie(
            key=CSRF_TOKEN_COOKIE,
            value=token,
            max_age=86400,  # 24 hours
            httponly=False,  # Must be readable by JavaScript
            secure=secure,
            samesite=samesite,
            domain=cookie_domain,
            path="/",
        )

        # Also send in header for immediate use
        response.headers[CSRF_TOKEN_HEADER] = token

    def _verify_csrf_token(self, cookie_token: str, header_token: str) -> bool:
        """
        Verify CSRF token using constant-time comparison.

        Args:
            cookie_token: Token from cookie
            header_token: Token from X-CSRF-Token header

        Returns:
            True if tokens match
        """
        return hmac.compare_digest(cookie_token, header_token)
