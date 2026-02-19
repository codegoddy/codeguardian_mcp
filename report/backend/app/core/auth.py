import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import bcrypt
from authlib.integrations.base_client import OAuthError
from fastapi import Depends, HTTPException, Request, status
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging_config import get_logger
from app.db.database import get_db
from app.models.user import User as UserModel

logger = get_logger(__name__)


# Use bcrypt directly to avoid passlib initialization issues
class PasswordHasher:
    def __init__(self):
        self.salt_rounds = 12

    def hash(self, password: str) -> str:
        # Truncate password to 72 bytes for bcrypt compatibility
        password_bytes = password[:72].encode("utf-8")
        salt = bcrypt.gensalt(rounds=self.salt_rounds)
        hashed = bcrypt.hashpw(password_bytes, salt)
        return hashed.decode("utf-8")

    def verify(self, password: str, hashed: str) -> bool:
        # Truncate password to 72 bytes for bcrypt compatibility
        password_bytes = password[:72].encode("utf-8")
        hashed_bytes = hashed.encode("utf-8")
        return bcrypt.checkpw(password_bytes, hashed_bytes)


# Global password hasher instance
pwd_hasher = PasswordHasher()

# OAuth state management - now handled by OAuth State Manager with Redis backend
# See: app/utils/oauth_state_manager.py


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_hasher.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    # Truncate password to 72 bytes for bcrypt compatibility
    return pwd_hasher.hash(password)


def create_access_token(
    data: dict,
    expires_delta: Optional[timedelta] = None,
    user_id: Optional[str] = None,
    full_name: Optional[str] = None,
):
    """Create access token with optional user data embedded.

    Embedding user_id and full_name reduces Redis lookups for basic auth.
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)

    # Include user data in token to reduce Redis/DB lookups
    if user_id:
        to_encode["user_id"] = user_id
    if full_name:
        to_encode["full_name"] = full_name

    to_encode.update({"exp": expire, "type": "access"})
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
    return encoded_jwt


def create_refresh_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(days=settings.refresh_token_expire_days)
    to_encode.update({"exp": expire, "type": "refresh"})
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
    return encoded_jwt


def decode_access_token(token: str):
    """Decode an internal access token."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        if payload.get("type") != "access":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return payload
    except JWTError as e:
        logger.error("JWT decode failed: %s", e, exc_info=True)
        logger.error("Secret key length: %s", len(settings.secret_key))
        logger.error("Algorithm: %s", settings.algorithm)
        logger.error("Token length: %s", len(token) if token else 0)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


def decode_supabase_token(token: str) -> dict:
    """
    Decode a Supabase JWT token using the Supabase JWT secret.

    Requires SUPABASE_JWT_SECRET environment variable to be set.
    This is found in your Supabase project settings under API > JWT Settings.
    """
    supabase_jwt_secret = os.getenv("SUPABASE_JWT_SECRET", "")

    if not supabase_jwt_secret:
        logger.error("SUPABASE_JWT_SECRET environment variable is not set")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server configuration error: Supabase JWT secret not configured",
        )

    try:
        payload = jwt.decode(token, supabase_jwt_secret, algorithms=["HS256"])
        logger.debug("Token decoded successfully with SUPABASE_JWT_SECRET")
        return payload
    except JWTError as e:
        logger.debug("Failed to decode Supabase token: %s", e)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Supabase token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def decode_refresh_token(token: str):
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        if payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def validate_refresh_token(refresh_token: str) -> Dict[str, Any]:
    """Validate refresh token and return payload"""
    payload = decode_refresh_token(refresh_token)
    return payload


def generate_oauth_state(provider: str = "generic") -> str:
    """
    Generate a unique OAuth state string.
    Now uses Redis-backed storage for multi-instance support.
    """
    from app.utils.oauth_state_manager import generate_oauth_state as _generate

    return _generate(provider)


def verify_oauth_state(state: str, provider: Optional[str] = None) -> bool:
    """
    Verify that OAuth state is valid and not expired.
    Now uses Redis-backed storage for multi-instance support.
    """
    from app.utils.oauth_state_manager import verify_oauth_state as _verify

    return _verify(state, provider)


def handle_oauth_callback(provider: str, user_info: Dict[str, Any], db_session) -> Dict[str, Any]:
    """Handle OAuth callback and user creation/authentication"""
    from app.utils.crud import create_oauth_user, get_user_by_email, get_user_by_oauth_provider

    provider_id = str(user_info.get("id", user_info.get("sub", "")))
    email = user_info.get("email", "")
    name = user_info.get("name", user_info.get("login", ""))  # GitHub uses 'login'

    if not email or not provider_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid OAuth user information",
        )

    # Check if user exists with this OAuth provider
    oauth_user = get_user_by_oauth_provider(db_session, provider, provider_id)

    if oauth_user:
        # Existing OAuth user - return token pair
        access_token = create_access_token(data={"sub": oauth_user.email})
        refresh_token = create_refresh_token(data={"sub": oauth_user.email})
        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "user": {
                "email": oauth_user.email,
                "full_name": oauth_user.full_name,
                "is_oauth": True,
                "provider": provider,
            },
        }

    # Check if user exists with same email but different auth method
    existing_user = get_user_by_email(db_session, email)

    if existing_user:
        # User exists with email/password - link the OAuth account
        existing_user.provider = provider
        existing_user.provider_id = provider_id
        existing_user.provider_data = user_info

        db_session.commit()
        db_session.refresh(existing_user)

        access_token = create_access_token(data={"sub": existing_user.email})
        refresh_token = create_refresh_token(data={"sub": existing_user.email})
        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "user": {
                "email": existing_user.email,
                "full_name": existing_user.full_name,
                "is_oauth": True,
                "provider": provider,
                "linked_account": True,
            },
        }

    # New OAuth user - create account
    new_user = create_oauth_user(
        db_session,
        email=email,
        full_name=name,
        provider=provider,
        provider_id=provider_id,
        provider_data=user_info,
    )

    access_token = create_access_token(data={"sub": new_user.email})
    refresh_token = create_refresh_token(data={"sub": new_user.email})
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "email": new_user.email,
            "full_name": new_user.full_name,
            "is_oauth": True,
            "provider": provider,
            "new_account": True,
        },
    }


from app.core.cookies import get_tokens_from_request
from app.utils.crud import get_user_by_email

# Initialize Supabase Client
try:
    from supabase import Client, create_client

    supabase_url = os.getenv("SUPABASE_URL", "")
    supabase_key = os.getenv("SUPABASE_KEY", "")
    if supabase_url and supabase_key:
        supabase: Client = create_client(supabase_url, supabase_key)
    else:
        supabase = None
except Exception as e:
    logger.warning("Failed to initialize Supabase client: %s", e)
    supabase = None


async def get_current_user(request: Request, db: AsyncSession = Depends(get_db)) -> UserModel:
    # Local import to avoid UnboundLocalError during exception handling
    from sqlalchemy import select as sql_select

    # Check for CLI token first (often in Authorization header without Bearer or with a different format)
    auth_header = request.headers.get("authorization")
    token = None

    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
    else:
        # Try cookies for browser-based requests
        from app.core.cookies import get_tokens_from_request

        cookie_token, _ = get_tokens_from_request(request)
        if cookie_token:
            token = cookie_token

    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    # Check if this is a JWT (Supabase) or a CLI token
    is_jwt = token.count(".") == 2

    if is_jwt:
        # First, try to decode without verification to check token type/issuer
        try:
            unverified_payload = jwt.decode(
                token,
                "",
                options={
                    "verify_signature": False,
                    "verify_aud": False,
                    "verify_exp": False,
                    "verify_iat": False,
                    "verify_iss": False,
                    "verify_sub": False,
                    "verify_jti": False,
                    "verify_at_hash": False,
                },
            )

            # If it has our custom "type" field, it's an internal token - verify with local secret
            if unverified_payload.get("type") in ("access", "refresh"):
                payload = decode_access_token(token)
                email = payload.get("sub")
                if not email:
                    raise HTTPException(status_code=401, detail="Invalid token payload")

                # Get user by email
                from app.utils.crud import get_user_by_email

                user = await get_user_by_email(db, email)
                if not user:
                    raise HTTPException(status_code=401, detail="User not found")
                return user

            # Check if it's a Supabase token by looking at the issuer
            issuer = unverified_payload.get("iss", "")
            is_supabase_token = "supabase" in issuer or not unverified_payload.get("type")

            if is_supabase_token:
                # Try to verify as Supabase token locally first (using JWT secret)
                # This is more reliable than API calls and works offline
                try:
                    supabase_payload = decode_supabase_token(token)
                    # Supabase tokens use 'sub' for user ID
                    supabase_user_id = supabase_payload.get("sub")
                    email = supabase_payload.get("email", "")

                    if not supabase_user_id:
                        raise HTTPException(status_code=401, detail="Invalid Supabase token payload")

                    logger.debug(
                        "Supabase token decoded locally - User ID: %s, Email: %s",
                        supabase_user_id,
                        email,
                    )

                    # Lookup user by Supabase Auth ID
                    from uuid import UUID

                    try:
                        user_uuid = UUID(supabase_user_id)
                    except ValueError:
                        raise HTTPException(status_code=401, detail="Invalid user ID format")

                    result = await db.execute(sql_select(UserModel).where(UserModel.id == user_uuid))
                    user = result.scalar_one_or_none()

                    # If not found by ID, try by email
                    if not user and email:
                        result = await db.execute(sql_select(UserModel).where(UserModel.email == email))
                        user = result.scalar_one_or_none()

                    if user:
                        return user

                    # User not found - try to sync from Supabase
                    logger.info(
                        "User %s not found in public.users, attempting Supabase API sync",
                        supabase_user_id,
                    )

                except HTTPException:
                    # Local decode failed, will try Supabase API below
                    pass

                # Fall back to Supabase API verification
                try:
                    if not supabase:
                        raise HTTPException(
                            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                            detail="Supabase client not initialized",
                        )

                    # Verify Supabase token via API
                    user_response = supabase.auth.get_user(token)

                    if not user_response or not user_response.user:
                        raise HTTPException(
                            status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Invalid Supabase token",
                        )

                    supabase_user_id = user_response.user.id
                    email = user_response.user.email

                    logger.debug(
                        "Supabase User verified via API - ID: %s, Email: %s",
                        supabase_user_id,
                        email,
                    )

                    # Lookup or create user
                    from uuid import UUID

                    try:
                        user_uuid = UUID(supabase_user_id)
                    except ValueError:
                        raise HTTPException(status_code=401, detail="Invalid user ID format")

                    result = await db.execute(sql_select(UserModel).where(UserModel.id == user_uuid))
                    user = result.scalar_one_or_none()

                    if not user:
                        # Try to find by email
                        result = await db.execute(sql_select(UserModel).where(UserModel.email == email))
                        existing_user = result.scalar_one_or_none()

                        if existing_user:
                            return existing_user

                        # Create new user from Supabase data
                        user_metadata = user_response.user.user_metadata or {}
                        full_name = user_metadata.get("full_name") or user_metadata.get("name") or email.split("@")[0]

                        new_user = UserModel(
                            id=user_uuid,
                            email=email,
                            full_name=full_name,
                            is_active=True,
                            created_at=datetime.now(timezone.utc),
                            updated_at=datetime.now(timezone.utc),
                        )
                        db.add(new_user)
                        await db.commit()
                        await db.refresh(new_user)
                        user = new_user

                    return user

                except HTTPException:
                    raise
                except Exception as e:
                    logger.error("Supabase API verification failed: %s", e, exc_info=True)
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Invalid Supabase token",
                    )

            # Unknown token type
            logger.error(
                "Unknown token type - issuer: %s, has type field: %s",
                issuer,
                bool(unverified_payload.get("type")),
            )
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

        except HTTPException:
            raise
        except Exception as e:
            logger.error("Token validation failed: %s", e, exc_info=True)
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    else:
        # Try CLI token validation
        logger.debug("Attempting CLI token validation")
        try:
            import hashlib

            from sqlalchemy import and_, select

            # Import CLIToken model
            from app.api.cli_tokens import CLIToken

            # Hash the provided token
            token_hash = hashlib.sha256(token.encode()).hexdigest()

            # Find the token
            result = await db.execute(
                select(CLIToken, UserModel)
                .join(UserModel, CLIToken.user_id == UserModel.id)
                .where(and_(CLIToken.token_hash == token_hash, CLIToken.is_active == True))
            )

            row = result.first()

            if row:
                cli_token, user = row

                # Update last used timestamp
                cli_token.last_used_at = datetime.now(timezone.utc)
                await db.commit()

                logger.debug("CLI token validated for user: %s", user.email)
                return user
            else:
                logger.error("CLI token not found in database")
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

        except HTTPException:
            raise
        except Exception as cli_error:
            logger.error("CLI token validation failed: %s", cli_error, exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
            )


def check_token_expiration(token: str) -> dict:
    """Check if token is expired and return expiration status"""
    try:
        # try decoding with Supabase secret first if available
        supabase_jwt_secret = os.getenv("SUPABASE_JWT_SECRET", "")
        secret = supabase_jwt_secret or settings.secret_key

        # Decode without verifying expiration first to get payload
        # We need to know which secret to use ideally, but trying Supabase first is a good heuristic
        # If Supabase secret is set, we try proper verification
        if supabase_jwt_secret:
            try:
                payload = jwt.decode(
                    token,
                    supabase_jwt_secret,
                    algorithms=["HS256"],
                    options={"verify_exp": False},
                )
            except JWTError:
                # Fallback to local secret
                payload = jwt.decode(
                    token,
                    settings.secret_key,
                    algorithms=[settings.algorithm],
                    options={"verify_exp": False},
                )
        else:
            payload = jwt.decode(
                token,
                settings.secret_key,
                algorithms=[settings.algorithm],
                options={"verify_exp": False},
            )

        exp = payload.get("exp")
        current_time = datetime.utcnow().timestamp()

        if exp:
            is_expired = current_time >= exp
            time_until_expiry = max(0, exp - current_time)
            return {
                "expired": is_expired,
                "expires_in_seconds": time_until_expiry,
                "expires_at": datetime.fromtimestamp(exp).isoformat(),
                "token_type": payload.get("type", "unknown"),
            }
        else:
            return {"expired": True, "error": "No expiration in token"}
    except JWTError as e:
        # logger.error("check_token_expiration failed: %s", e, exc_info=True)
        return {"expired": True, "error": "Invalid token"}
    except Exception as e:
        logger.error("check_token_expiration unexpected error: %s", e, exc_info=True)
        return {"expired": True, "error": "Token validation error"}


def should_refresh_token(token: str) -> bool:
    """Check if token should be refreshed (expires within next 5 minutes)"""
    expiration_info = check_token_expiration(token)
    if expiration_info.get("expired"):
        return False

    # Refresh if expires in less than 5 minutes
    return expiration_info.get("expires_in_seconds", 0) < 300


def extract_user_id_from_token(token: str) -> str | None:
    """
    Extract user ID from a JWT token without full verification.
    Works with both internal tokens and Supabase tokens.

    This is useful for middleware that needs to identify the user
    without fully validating the token (e.g., rate limiting).

    Returns:
        User ID (sub claim) or None if extraction fails
    """
    try:
        # Decode without any verification to extract claims
        payload = jwt.decode(
            token,
            "",
            options={
                "verify_signature": False,
                "verify_aud": False,
                "verify_exp": False,
                "verify_iat": False,
                "verify_iss": False,
                "verify_sub": False,
                "verify_jti": False,
                "verify_at_hash": False,
            },
        )

        # Try to get user_id from various claim locations
        # Internal tokens: user_id or sub
        # Supabase tokens: sub
        user_id = payload.get("user_id") or payload.get("sub")
        return user_id
    except Exception:
        # If extraction fails, return None
        return None
