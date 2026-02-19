import asyncio
from typing import Any, Dict, Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import pwd_hasher
from app.core.logging_config import get_logger
from app.models.user import User as UserModel
from app.schemas.auth import UserCreate, UserLogin

logger = get_logger(__name__)


async def create_user(db: AsyncSession, user: UserCreate) -> UserModel:
    """Create a new user in the database"""
    # Hash password with bcrypt (limited to 72 bytes)
    hashed_password = pwd_hasher.hash(user.password)

    db_user = UserModel(email=user.email, full_name=user.full_name, hashed_password=hashed_password)

    try:
        db.add(db_user)
        await db.commit()
        await db.refresh(db_user)
        return db_user
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User already exists")


async def get_user_by_email(db: AsyncSession, email: str | None, use_cache: bool = True) -> UserModel | None:
    """Get user by email from database with Redis caching

    Uses Redis to cache serialized user data (not the SQLAlchemy model).
    Cache key format: user:email:{email}
    """
    # Try to get from cache first
    if use_cache:
        try:
            from datetime import datetime
            from uuid import UUID

            from app.utils.redis_client import RedisCache

            cache_key = f"user:email:{email}"
            cached_data = await RedisCache.get(cache_key)

            if cached_data:
                # Reconstruct User model from cached data
                user = UserModel(
                    id=(UUID(cached_data["id"]) if isinstance(cached_data["id"], str) else cached_data["id"]),
                    email=cached_data["email"],
                    full_name=cached_data["full_name"],
                    hashed_password=cached_data.get("hashed_password"),
                    is_active=cached_data.get("is_active", True),
                    created_at=(datetime.fromisoformat(cached_data["created_at"]) if cached_data.get("created_at") else None),
                    provider=cached_data.get("provider"),
                    is_oauth_user=cached_data.get("is_oauth_user", False),
                )
                return user
        except Exception as e:
            # Silently fail cache lookups, fall through to DB query
            pass

    # Fetch from database
    stmt = select(UserModel).where(UserModel.email == email)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    # Cache the user data if found
    if user and use_cache:
        try:
            from app.utils.redis_client import RedisCache

            cache_key = f"user:email:{email}"
            user_data = {
                "id": str(user.id),
                "email": user.email,
                "full_name": user.full_name,
                "hashed_password": user.hashed_password,
                "is_active": user.is_active,
                "created_at": user.created_at.isoformat() if user.created_at else None,
                "provider": user.provider,
                "is_oauth_user": user.is_oauth_user,
            }
            await RedisCache.set(cache_key, user_data, ttl=1800)  # 30 minutes (was 5 min)
        except Exception:
            # Silently fail cache writes
            pass

    return user


async def authenticate_user(db: AsyncSession, user: UserLogin) -> UserModel | None:
    """Authenticate user by checking email and password"""
    import time

    start_time = time.time()

    logger.debug("Starting authentication for user: %s", user.email)
    db_user = await get_user_by_email(db, user.email)
    if not db_user:
        logger.debug("User not found: %s (took %.2fs)", user.email, time.time() - start_time)
        return None

    logger.debug("User found, verifying password for: %s", user.email)
    # Verify password in thread pool with limited executor
    loop = asyncio.get_event_loop()

    # Create a limited thread pool executor to prevent exhaustion
    import concurrent.futures

    executor = concurrent.futures.ThreadPoolExecutor(max_workers=2)

    try:
        logger.debug("Starting password verification for: %s", user.email)
        is_valid = pwd_hasher.verify(user.password, str(db_user.hashed_password))
        logger.debug("Password verification completed for: %s - Valid: %s", user.email, is_valid)
    except Exception as e:
        logger.error("Password verification failed for %s: %s", user.email, e, exc_info=True)
        return None
    finally:
        # Always shutdown the executor
        executor.shutdown(wait=True)

    total_time = time.time() - start_time
    if not is_valid:
        logger.debug("Invalid password for user: %s (took %.2fs)", user.email, total_time)
        return None

    logger.debug("Authentication successful for user: %s (took %.2fs)", user.email, total_time)
    return db_user


async def user_exists(db: AsyncSession, email: str | None) -> bool:
    """Check if user exists"""
    user = await get_user_by_email(db, email)
    return user is not None


async def get_user_by_oauth_provider(db: AsyncSession, provider: str, provider_id: str) -> UserModel | None:
    """Get user by OAuth provider and provider ID"""
    stmt = select(UserModel).where(UserModel.provider == provider, UserModel.provider_id == provider_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def create_oauth_user(
    db: AsyncSession,
    email: str,
    full_name: str,
    provider: str,
    provider_id: str,
    provider_data: Optional[Dict[str, Any]] = None,
) -> UserModel:
    """Create a new OAuth user in the database"""
    db_user = UserModel(
        email=email,
        full_name=full_name,
        provider=provider,
        provider_id=provider_id,
        provider_data=provider_data,
    )

    try:
        db.add(db_user)
        await db.commit()
        await db.refresh(db_user)
        return db_user
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User already exists")
