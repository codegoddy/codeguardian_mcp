import json
import logging
from typing import Callable

from fastapi import HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.auth import check_token_expiration, create_access_token, create_refresh_token
from app.core.config import settings

logger = logging.getLogger(__name__)


class AuthMiddleware(BaseHTTPMiddleware):
    """Middleware for automatic token refresh and authentication"""

    def __init__(self, app: Callable):
        super().__init__(app)
        self.excluded_paths = {
            "/api/auth/login",
            "/api/auth/register",
            "/api/auth/verify",
            "/api/auth/verify-otp",
            "/api/auth/forgot-password",
            "/api/auth/reset-password",
            "/api/auth/refresh",
            "/api/auth/oauth",
            "/api/auth-cookies/login",
            "/api/auth-cookies/register",
            "/api/auth-cookies/verify-otp",
            "/api/auth-cookies/refresh",
            "/api/client-portal",
            "/api/support",
            "/api/ws/events",
            "/health",
            "/docs",
            "/openapi.json",
            "/",
        }

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Intercept requests and automatically refresh tokens if needed"""

        # Skip middleware for excluded paths
        if any(request.url.path.startswith(path) for path in self.excluded_paths):
            return await call_next(request)

        # Try to get tokens from cookies first (preferred for web)
        from app.core.cookies import ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, set_auth_cookies

        cookie_access_token = request.cookies.get(ACCESS_TOKEN_COOKIE)
        cookie_refresh_token = request.cookies.get(REFRESH_TOKEN_COOKIE)

        using_cookies = False
        token = None
        refresh_token_str = None

        if cookie_access_token:
            using_cookies = True
            token = cookie_access_token
            refresh_token_str = cookie_refresh_token
        else:
            # Fallback to headers
            auth_header = request.headers.get("authorization")
            if auth_header and auth_header.startswith("Bearer "):
                token = auth_header.split(" ")[1]
                refresh_token_str = request.headers.get("x-refresh-token")

        # Skip if no token found
        if not token:
            return await call_next(request)

        # Check if token is expired or about to expire
        try:
            expiration_info = check_token_expiration(token)
            # logger.debug(f"Token expiration check for {request.url.path}: expired={expiration_info.get('expired')}, expires_in={expiration_info.get('expires_in_seconds')}s")

            # Check if we should attempt token refresh (expired OR expires within 5 minutes)
            should_refresh = expiration_info.get("expired") or expiration_info.get("expires_in_seconds", 0) < 300

            if should_refresh:
                if expiration_info.get("expired") and not refresh_token_str:
                    try:
                        from jose import jwt

                        # Check for Supabase tokens which we can't refresh here
                        unverified_claims = jwt.get_unverified_claims(token)
                        issuer = unverified_claims.get("iss", "")

                        if "supabase" in issuer or "supabase" in str(unverified_claims):
                            # logger.debug(f"Detected Supabase token for {request.url.path}, bypassing middleware refresh check")
                            return await call_next(request)
                    except Exception:
                        # Not a valid JWT or other error, proceed with standard failure
                        pass
                if expiration_info.get("expired"):
                    logger.info(f"Token expired, checking for refresh token. Has refresh token: {bool(refresh_token_str)}")

                if refresh_token_str:
                    try:
                        # Validate refresh token and generate new access token
                        from app.core.auth import validate_refresh_token

                        refresh_payload = validate_refresh_token(refresh_token_str)
                        email = refresh_payload.get("sub")

                        if email:
                            # Try to get user_id and full_name from the old access token
                            jwt_user_id = None
                            jwt_full_name = None
                            try:
                                from jose import jwt

                                old_payload = jwt.decode(
                                    token,
                                    settings.secret_key,
                                    algorithms=[settings.algorithm],
                                    options={"verify_exp": False},
                                )
                                jwt_user_id = old_payload.get("user_id")
                                jwt_full_name = old_payload.get("full_name")
                            except Exception:
                                pass

                            # Generate new access token
                            new_access_token = create_access_token(
                                data={"sub": email},
                                user_id=jwt_user_id,
                                full_name=jwt_full_name,
                            )

                            # Generate new refresh token
                            new_refresh_token = create_refresh_token(data={"sub": email})

                            logger.info(
                                f"Auto-refreshed token for user: {email} (was_expired: {expiration_info.get('expired')})"
                            )

                            # Store the refreshed user info in request state
                            request.state.refreshed_user_email = email
                            request.state.auto_refreshed = True
                            if jwt_user_id:
                                request.state.refreshed_user_id = jwt_user_id
                            if jwt_full_name:
                                request.state.refreshed_full_name = jwt_full_name

                            # Proceed with request
                            response = await call_next(request)

                            # Return new tokens via cookies or headers
                            if using_cookies:
                                set_auth_cookies(response, new_access_token, new_refresh_token)
                            else:
                                response.headers["x-new-access-token"] = new_access_token
                                response.headers["x-new-refresh-token"] = new_refresh_token

                            return response
                        else:
                            logger.warning("Invalid refresh token during auto-refresh - no email in payload")

                    except Exception as e:
                        logger.error(f"Failed to auto-refresh token: {e}")
                        # If refresh failed and token is expired, return 401
                        if expiration_info.get("expired"):
                            return JSONResponse(
                                status_code=status.HTTP_401_UNAUTHORIZED,
                                content={
                                    "detail": "Token expired and refresh failed",
                                    "code": "token_expired",
                                },
                            )
                else:
                    # No refresh token provided and token is expired
                    if expiration_info.get("expired"):
                        return JSONResponse(
                            status_code=status.HTTP_401_UNAUTHORIZED,
                            content={
                                "detail": "Token expired",
                                "code": "token_expired",
                            },
                        )

        except Exception as e:
            logger.warning(f"Token validation failed in middleware: {e}")

        # Proceed with normal request
        return await call_next(request)
