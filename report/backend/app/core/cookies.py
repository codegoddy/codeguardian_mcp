"""
Cookie Authentication Utilities

Secure httpOnly cookie management for JWT tokens.
This replaces localStorage with secure cookies to prevent XSS attacks.
"""

from datetime import timedelta

from fastapi import Request, Response

from app.core.config import settings
from app.core.logging_config import get_logger

logger = get_logger(__name__)


# Cookie names
ACCESS_TOKEN_COOKIE = "devhq_access_token"
REFRESH_TOKEN_COOKIE = "devhq_refresh_token"


def set_auth_cookies(
    response: Response,
    access_token: str,
    refresh_token: str,
    access_token_expires: timedelta = None,
    refresh_token_expires: timedelta = None,
) -> None:
    """
    Set authentication cookies (httpOnly for security).

    Args:
        response: FastAPI Response object
        access_token: JWT access token
        refresh_token: JWT refresh token
        access_token_expires: Expiration time for access token
        refresh_token_expires: Expiration time for refresh token

    Security Features:
        - httponly=True: Prevents JavaScript access (XSS protection)
        - secure=True: Only sent over HTTPS (production)
        - samesite="lax": CSRF protection while allowing OAuth redirects
        - domain: Set to allow subdomain access (.devhq.site)
    """
    # Get cookie settings
    # Intelligent domain handling based on Frontend URL
    frontend_host = settings.frontend_url.replace("https://", "").replace("http://", "").split("/")[0]
    is_localhost = "localhost" in frontend_host or "127.0.0.1" in frontend_host

    if is_localhost:
        # Local Development
        cookie_domain = None
        secure = False
        samesite = "lax"
        logger.info("Configured for Localhost: secure=%s, domain=%s", secure, cookie_domain)
    elif "devhq.site" in frontend_host:
        # Production Domain (e.g. devhq.site or www.devhq.site)
        # We MUST set the domain to .devhq.site so both api.devhq.site and devhq.site can share it
        cookie_domain = ".devhq.site"
        secure = True
        samesite = "lax"  # Lax is sufficient for subdomain sharing and preferred for security
        logger.info(
            "Configured for Production Domain: secure=%s, domain=%s",
            secure,
            cookie_domain,
        )
    else:
        # Vercel Previews or other domains
        # Fallback to HostOnly cookie (no domain set)
        cookie_domain = None
        secure = True
        samesite = "none"  # Allow cross-site usage if needed (requires Secure)
        logger.info(
            "Configured for External/Preview Domain: secure=%s, domain=%s",
            secure,
            cookie_domain,
        )

    # Default expiration times
    if not access_token_expires:
        access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    if not refresh_token_expires:
        refresh_token_expires = timedelta(days=settings.refresh_token_expire_days)

    # Set access token cookie
    response.set_cookie(
        key=ACCESS_TOKEN_COOKIE,
        value=access_token,
        max_age=int(access_token_expires.total_seconds()),
        httponly=True,  # Cannot be accessed by JavaScript
        secure=secure,  # Only sent over HTTPS in production
        samesite=samesite,  # CSRF protection, allows OAuth redirects
        domain=cookie_domain,  # Shared domain or HostOnly
        path="/",
    )

    # Set refresh token cookie
    response.set_cookie(
        key=REFRESH_TOKEN_COOKIE,
        value=refresh_token,
        max_age=int(refresh_token_expires.total_seconds()),
        httponly=True,
        secure=secure,
        samesite=samesite,
        domain=cookie_domain,
        path="/",
    )

    logger.info("Set auth cookies (domain=%s, secure=%s)", cookie_domain, secure)


def clear_auth_cookies(response: Response) -> None:
    """
    Clear authentication cookies (logout).

    Args:
        response: FastAPI Response object
    """
    is_production = settings.environment == "production"
    cookie_domain = ".devhq.site" if is_production else None

    response.delete_cookie(
        key=ACCESS_TOKEN_COOKIE,
        domain=cookie_domain,
        path="/",
    )

    response.delete_cookie(
        key=REFRESH_TOKEN_COOKIE,
        domain=cookie_domain,
        path="/",
    )

    logger.info("Cleared auth cookies (domain=%s)", cookie_domain)


def get_access_token_from_cookie(request: Request) -> str | None:
    """
    Get access token from cookie.

    Args:
        request: FastAPI Request object

    Returns:
        Access token string or None if not found
    """
    return request.cookies.get(ACCESS_TOKEN_COOKIE)


def get_refresh_token_from_cookie(request: Request) -> str | None:
    """
    Get refresh token from cookie.

    Args:
        request: FastAPI Request object

    Returns:
        Refresh token string or None if not found
    """
    return request.cookies.get(REFRESH_TOKEN_COOKIE)


def get_tokens_from_request(request: Request) -> tuple[str | None, str | None]:
    """
    Get access and refresh tokens from request.
    Supports both cookies (preferred) and Authorization header (backward compatibility).
    Also checks for Supabase auth cookies.

    Args:
        request: FastAPI Request object

    Returns:
        Tuple of (access_token, refresh_token) or (None, None)
    """
    # Try our custom cookies first (preferred method)
    access_token = get_access_token_from_cookie(request)
    refresh_token = get_refresh_token_from_cookie(request)

    if access_token:
        return access_token, refresh_token

    # Check for Supabase auth cookies (sb-<project-ref>-auth-token)
    # Supabase stores the session in a cookie named like "sb-useaycltzicsnpkjmdej-auth-token"
    for cookie_name in request.cookies:
        if cookie_name.startswith("sb-") and cookie_name.endswith("-auth-token"):
            try:
                import json

                # Supabase cookie contains a JSON object with access_token and refresh_token
                cookie_value = request.cookies[cookie_name]
                session_data = json.loads(cookie_value)
                access_token = session_data.get("access_token")
                refresh_token = session_data.get("refresh_token")
                if access_token:
                    logger.debug("Found Supabase auth cookie: %s", cookie_name)
                    return access_token, refresh_token
            except (json.JSONDecodeError, AttributeError) as e:
                logger.warning("Failed to parse Supabase cookie %s: %s", cookie_name, e)
                continue

    # Fallback to Authorization header (backward compatibility)
    auth_header = request.headers.get("authorization")
    if auth_header and auth_header.startswith("Bearer "):
        access_token = auth_header.split(" ")[1]
        refresh_token = request.headers.get("x-refresh-token")
        return access_token, refresh_token

    return None, None
