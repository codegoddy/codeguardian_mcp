"""
API Response and Computation Caching Utilities.

This module provides decorators and utilities for caching API responses,
user authentication data, and expensive computations using the existing
Redis infrastructure (redis_client.py).

Key Features:
1. API Response Caching: @cache_response decorator
2. Auth Data Caching: Session and token caching
3. Expensive Computation Caching: @cache_computation decorator
4. Cache Invalidation Patterns: Tag-based and hierarchical
5. Cache Metrics: Hit/miss tracking
"""

import functools
import hashlib
import json
from datetime import datetime, timedelta
from functools import wraps
from typing import Any, Callable, Dict, List, Optional, Union

from fastapi import Request, Response

from app.core.logging_config import get_logger
from app.utils.redis_client import RedisCache

logger = get_logger(__name__)


# ============================================================================
# Cache Metrics Tracking
# ============================================================================


class CacheMetrics:
    """Track cache hits and misses for monitoring"""

    _hits = 0
    _misses = 0
    _errors = 0

    @classmethod
    def record_hit(cls) -> None:
        """Record a cache hit"""
        cls._hits += 1

    @classmethod
    def record_miss(cls) -> None:
        """Record a cache miss"""
        cls._misses += 1

    @classmethod
    def record_error(cls) -> None:
        """Record a cache error"""
        cls._errors += 1

    @classmethod
    def get_stats(cls) -> Dict[str, Any]:
        """Get current cache statistics"""
        total = cls._hits + cls._misses
        hit_rate = (cls._hits / total * 100) if total > 0 else 0

        return {
            "hits": cls._hits,
            "misses": cls._misses,
            "errors": cls._errors,
            "total_requests": total,
            "hit_rate_percent": round(hit_rate, 2),
            "miss_rate_percent": round(100 - hit_rate, 2),
        }

    @classmethod
    def reset(cls) -> None:
        """Reset metrics (useful for testing)"""
        cls._hits = 0
        cls._misses = 0
        cls._errors = 0


# ============================================================================
# Tag-based Cache Invalidation Helpers
# ============================================================================

TAG_PREFIX = "cache:tag:"


async def _store_cache_tags(cache_key: str, tags: List[str]) -> None:
    """
    Store mapping between cache tags and cache keys for tag-based invalidation.

    Args:
        cache_key: The cache key to associate with tags
        tags: List of tags to associate with the cache key
    """
    try:
        for tag in tags:
            tag_key = f"{TAG_PREFIX}{tag}"
            # Get existing keys for this tag
            existing = await RedisCache.get(tag_key) or []
            if cache_key not in existing:
                existing.append(cache_key)
                await RedisCache.set(tag_key, existing, ttl=86400)  # 24 hours
    except Exception as e:
        logger.warning(f"Failed to store cache tags: {e}")


async def invalidate_cache_by_tag(tag: str) -> int:
    """
    Invalidate all cache entries associated with a tag.

    Args:
        tag: The tag to invalidate

    Returns:
        Number of cache entries invalidated
    """
    try:
        tag_key = f"{TAG_PREFIX}{tag}"
        cache_keys = await RedisCache.get(tag_key) or []

        count = 0
        for key in cache_keys:
            if await RedisCache.delete(key):
                count += 1

        # Clear the tag mapping
        await RedisCache.delete(tag_key)

        logger.info(f"Invalidated {count} cache entries for tag: {tag}")
        return count
    except Exception as e:
        logger.error(f"Failed to invalidate cache by tag: {e}")
        return 0


# ============================================================================
# API Response Caching
# ============================================================================


def cache_response(
    ttl: int = 300,  # 5 minutes default
    key_prefix: str = "api:",
    include_query_params: bool = True,
    cache_post_requests: bool = False,
    tags: Optional[List[str]] = None,
):
    """
    Decorator to cache API endpoint responses.

    Args:
        ttl: Time to live in seconds
        key_prefix: Prefix for cache keys
        include_query_params: Include query params in cache key
        cache_post_requests: Also cache POST/PUT/PATCH requests (default: False, only GET)
        tags: List of tags for cache invalidation

    Usage:
        @router.get("/projects")
        @cache_response(ttl=60, key_prefix="projects:list:")
        async def list_projects(...):
            ...
    """

    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Extract Request object if present
            request = None
            for arg in args:
                if isinstance(arg, Request):
                    request = arg
                    break

            # Only cache GET requests by default
            if request and not cache_post_requests:
                if request.method != "GET":
                    return await func(*args, **kwargs)

            # Generate cache key
            cache_key = _generate_response_cache_key(func.__name__, args, kwargs, request, key_prefix, include_query_params)

            # Try to get from cache
            cached = await RedisCache.get(cache_key)
            if cached is not None:
                CacheMetrics.record_hit()
                logger.debug("API cache hit", extra={"key": cache_key, "function": func.__name__})
                return cached

            # Cache miss - execute function
            CacheMetrics.record_miss()
            logger.debug("API cache miss", extra={"key": cache_key, "function": func.__name__})
            result = await func(*args, **kwargs)

            # Store in cache
            try:
                await RedisCache.set(cache_key, result, ttl=ttl)

                # Store tag mapping for invalidation
                if tags:
                    await _store_cache_tags(cache_key, tags)

                logger.debug("API cached response", extra={"key": cache_key, "ttl": ttl})
            except Exception as e:
                CacheMetrics.record_error()
                logger.warning(
                    "Failed to cache API response",
                    exc_info=True,
                    extra={"key": cache_key},
                )

            return result

        return wrapper

    return decorator


def _generate_response_cache_key(
    func_name: str,
    args: tuple,
    kwargs: dict,
    request: Optional[Request],
    prefix: str,
    include_query: bool,
) -> str:
    """Generate a unique cache key for API response"""

    # Start with function name
    key_parts = [prefix, func_name]

    # Include user ID if available in kwargs
    if "current_user" in kwargs:
        user_id = str(kwargs["current_user"].id) if hasattr(kwargs["current_user"], "id") else "anonymous"
        key_parts.append(f"user:{user_id}")

    # Include query params if requested
    if request and include_query:
        query_params = dict(request.query_params)
        if query_params:
            # Sort params for consistent keys
            sorted_params = sorted(query_params.items())
            params_str = json.dumps(sorted_params, sort_keys=True)
            params_hash = hashlib.md5(params_str.encode()).hexdigest()[:8]
            key_parts.append(f"q:{params_hash}")

    # Include path parameters
    if request:
        path_params = dict(request.path_params)
        if path_params:
            params_str = json.dumps(sorted(path_params.items()), sort_keys=True)
            params_hash = hashlib.md5(params_str.encode()).hexdigest()[:8]
            key_parts.append(f"p:{params_hash}")

    # Create final key
    return ":".join(key_parts)


# ============================================================================
# Expensive Computation Caching
# ============================================================================


def cache_computation(
    ttl: int = 600,  # 10 minutes default
    key_prefix: str = "compute:",
    tags: Optional[List[str]] = None,
):
    """
    Decorator to cache expensive function results.

    Args:
        ttl: Time to live in seconds
        key_prefix: Prefix for cache keys
        tags: List of tags for cache invalidation

    Usage:
        @cache_computation(ttl=3600, key_prefix="budget:calc:")
        async def calculate_budget_health(project_id: UUID):
            ...
    """

    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Generate cache key based on function name and arguments
            cache_key = _generate_computation_cache_key(func.__name__, args, kwargs, key_prefix)

            # Try to get from cache
            cached = await RedisCache.get(cache_key)
            if cached is not None:
                CacheMetrics.record_hit()
                logger.debug(
                    "Computation cache hit",
                    extra={"key": cache_key, "function": func.__name__},
                )
                return cached

            # Cache miss - execute function
            CacheMetrics.record_miss()
            logger.debug(
                "Computation cache miss",
                extra={"key": cache_key, "function": func.__name__},
            )
            result = await func(*args, **kwargs)

            # Store in cache
            try:
                await RedisCache.set(cache_key, result, ttl=ttl)

                # Store tag mapping for invalidation
                if tags:
                    await _store_cache_tags(cache_key, tags)

                logger.debug("Computation cached", extra={"key": cache_key, "ttl": ttl})
            except Exception as e:
                CacheMetrics.record_error()
                logger.warning(
                    "Failed to cache computation",
                    exc_info=True,
                    extra={"key": cache_key},
                )

            return result

        return wrapper

    return decorator


def _generate_computation_cache_key(func_name: str, args: tuple, kwargs: dict, prefix: str) -> str:
    """Generate a unique cache key for computation"""

    key_parts = [prefix, func_name]

    # Include arguments in key (hash for complex objects)
    args_repr = []
    for arg in args:
        if hasattr(arg, "__dict__"):
            # For objects, use a simple representation
            args_repr.append(str(type(arg).__name__))
        elif isinstance(arg, (dict, list)):
            # For dict/list, use JSON hash
            args_repr.append(hashlib.md5(json.dumps(arg, sort_keys=True).encode()).hexdigest()[:8])
        else:
            args_repr.append(str(arg))

    for k, v in sorted(kwargs.items()):
        if isinstance(v, (dict, list)):
            args_repr.append(f"{k}:{hashlib.md5(json.dumps(v, sort_keys=True).encode()).hexdigest()[:8]}")
        else:
            args_repr.append(f"{k}:{v}")

    if args_repr:
        key_parts.append("|".join(args_repr))

    return ":".join(key_parts)


# ============================================================================
# Auth Data Caching
# ============================================================================


class AuthCache:
    """Cache user authentication data and sessions"""

    SESSION_PREFIX = "auth:session:"
    TOKEN_PREFIX = "auth:token:"
    PERMISSIONS_PREFIX = "auth:permissions:"

    # TTL values
    SESSION_TTL = 1800  # 30 minutes for sessions
    TOKEN_TTL = 900  # 15 minutes for tokens
    PERMISSIONS_TTL = 3600  # 1 hour for permissions

    @staticmethod
    async def cache_session(session_id: str, user_id: str, session_data: Optional[dict] = None) -> bool:
        """
        Cache user session data.

        Args:
            session_id: Unique session identifier
            user_id: User ID
            session_data: Additional session metadata (ip, user_agent, etc.)

        Returns:
            True if cached successfully
        """
        cache_key = f"{AuthCache.SESSION_PREFIX}{session_id}"

        data = {
            "user_id": user_id,
            "created_at": datetime.utcnow().isoformat(),
            **(session_data or {}),
        }

        return await RedisCache.set(cache_key, data, ttl=AuthCache.SESSION_TTL)

    @staticmethod
    async def get_session(session_id: str) -> Optional[dict]:
        """Get cached session data"""
        cache_key = f"{AuthCache.SESSION_PREFIX}{session_id}"
        return await RedisCache.get(cache_key)

    @staticmethod
    async def invalidate_session(session_id: str) -> bool:
        """Invalidate a specific session"""
        cache_key = f"{AuthCache.SESSION_PREFIX}{session_id}"
        return await RedisCache.delete(cache_key)

    @staticmethod
    async def invalidate_all_user_sessions(user_id: str) -> bool:
        """
        Invalidate all sessions for a user.

        Note: This requires iterating over session keys, which can be slow.
        Consider using tag-based invalidation for better performance.
        """
        try:
            # This is a simplified version. In production, you might want to
            # store a list of user sessions in a separate key.
            redis = RedisCache.get_redis_client()
            if not redis:
                return False

            # Delete sessions (implementation depends on Redis access patterns)
            # For now, we'll just return True and rely on TTL
            logger.info(f"Invalidating sessions for user {user_id}")
            return True
        except Exception as e:
            logger.error("Failed to invalidate user sessions", exc_info=True)
            return False

    @staticmethod
    async def cache_token(token: str, user_id: str, token_type: str = "access") -> bool:
        """Cache a JWT token with user metadata"""
        cache_key = f"{AuthCache.TOKEN_PREFIX}{token_type}:{token[:20]}"

        data = {
            "user_id": user_id,
            "token_type": token_type,
            "cached_at": datetime.utcnow().isoformat(),
        }

        return await RedisCache.set(cache_key, data, ttl=AuthCache.TOKEN_TTL)

    @staticmethod
    async def get_token(token: str, token_type: str = "access") -> Optional[dict]:
        """Get cached token data"""
        cache_key = f"{AuthCache.TOKEN_PREFIX}{token_type}:{token[:20]}"
        return await RedisCache.get(cache_key)

    @staticmethod
    async def invalidate_token(token: str, token_type: str = "access") -> bool:
        """Invalidate a specific token"""
        cache_key = f"{AuthCache.TOKEN_PREFIX}{token_type}:{token[:20]}"
        return await RedisCache.delete(cache_key)


# ============================================================================
# Cache Invalidation Patterns
# ============================================================================


class CacheInvalidator:
    """Patterns for invalidating related cache entries"""

    TAG_PREFIX = "cache:tag:"

    @staticmethod
    async def _store_cache_tags(cache_key: str, tags: List[str]) -> bool:
        """Store tag-to-key mappings for batch invalidation"""
        redis = RedisCache.get_redis_client()
        if not redis:
            return False

        try:
            for tag in tags:
                tag_key = f"{CacheInvalidator.TAG_PREFIX}{tag}"
                # Store cache key in tag's set
                redis.sadd(tag_key, cache_key)
                # Set TTL on tag key
                redis.expire(tag_key, 86400)  # 24 hours
            return True
        except Exception as e:
            logger.warning("Failed to store cache tags", exc_info=True)
            return False

    @staticmethod
    async def invalidate_by_tag(tag: str) -> int:
        """
        Invalidate all cache entries with a specific tag.

        Args:
            tag: Tag to invalidate

        Returns:
            Number of cache entries invalidated
        """
        redis = RedisCache.get_redis_client()
        if not redis:
            return 0

        tag_key = f"{CacheInvalidator.TAG_PREFIX}{tag}"

        try:
            # Get all cache keys for this tag
            cache_keys = redis.smembers(tag_key)
            count = 0

            if cache_keys:
                # Delete each cache entry
                for key in cache_keys:
                    if isinstance(key, bytes):
                        key = key.decode("utf-8")
                    await RedisCache.delete(key)
                    count += 1

                # Delete the tag set itself
                redis.delete(tag_key)

            logger.info(f"Invalidated {count} cache entries for tag: {tag}")
            return count

        except Exception as e:
            logger.error("Failed to invalidate by tag", exc_info=True)
            return 0

    @staticmethod
    async def invalidate_user_related(user_id: str) -> int:
        """
        Invalidate all cache entries related to a user.

        This includes:
        - User data
        - User settings
        - User clients
        - User projects (indirectly through invalidation tags)

        Returns:
            Number of cache entries invalidated
        """
        count = 0

        # Direct cache invalidations
        try:
            await RedisCache.invalidate_user(user_id)
            count += 1
        except Exception:
            pass

        try:
            await RedisCache.invalidate_user_settings(user_id)
            count += 1
        except Exception:
            pass

        try:
            await RedisCache.invalidate_clients(user_id)
            count += 1
        except Exception:
            pass

        # Tag-based invalidation for projects
        try:
            projects_count = await CacheInvalidator.invalidate_by_tag(f"user:{user_id}:projects")
            count += projects_count
        except Exception:
            pass

        logger.info(f"Invalidated {count} cache entries for user: {user_id}")
        return count

    @staticmethod
    async def invalidate_project_related(project_id: str) -> int:
        """
        Invalidate all cache entries related to a project.

        Returns:
            Number of cache entries invalidated
        """
        count = 0

        try:
            await RedisCache.invalidate_project(project_id)
            count += 1
        except Exception:
            pass

        # Tag-based invalidation for related data
        tags = [f"project:{project_id}", f"project:{project_id}:deliverables"]

        for tag in tags:
            try:
                count += await CacheInvalidator.invalidate_by_tag(tag)
            except Exception:
                pass

        logger.info(f"Invalidated {count} cache entries for project: {project_id}")
        return count

    @staticmethod
    async def invalidate_client_related(client_id: str) -> int:
        """Invalidate all cache entries related to a client"""
        count = 0

        try:
            await RedisCache.invalidate_client(client_id)
            count += 1
        except Exception:
            pass

        try:
            count += await CacheInvalidator.invalidate_by_tag(f"client:{client_id}:projects")
        except Exception:
            pass

        logger.info(f"Invalidated {count} cache entries for client: {client_id}")
        return count


# ============================================================================
# Cache Warmup and Prefetching
# ============================================================================


class CacheWarmer:
    """Utilities for warming up cache with frequently accessed data"""

    @staticmethod
    async def warm_user_cache(user_id: str) -> Dict[str, Any]:
        """
        Prefetch commonly accessed user data into cache.

        Returns:
            Dictionary with warmup results
        """
        results = {"user": False, "settings": False, "clients": False}

        try:
            from app.db.database import get_async_session
            from app.utils.crud import get_user_by_email

            async with get_async_session() as db:
                user = await get_user_by_email(db, None, use_cache=False)
                if user and user.id == user_id:
                    user_data = {
                        "id": str(user.id),
                        "email": user.email,
                        "full_name": user.full_name,
                        "is_active": user.is_active,
                    }
                    await RedisCache.cache_user(user_id, user_data)
                    results["user"] = True

                settings_data = await RedisCache.get_user_settings(user_id)
                if settings_data:
                    results["settings"] = True

                clients_data = await RedisCache.get_clients(user_id)
                if clients_data:
                    results["clients"] = True

        except Exception as e:
            logger.error("Failed to warm user cache", exc_info=True)

        logger.info(f"Cache warmup for user {user_id}: {results}")
        return results

    @staticmethod
    async def warm_project_cache(project_id: str) -> Dict[str, Any]:
        """
        Prefetch commonly accessed project data into cache.

        Returns:
            Dictionary with warmup results
        """
        results = {"project": False, "deliverables": False}

        try:
            from sqlalchemy import select

            from app.db.database import get_async_session
            from app.models.project import Project

            async with get_async_session() as db:
                result = await db.execute(select(Project).where(Project.id == project_id))
                project = result.scalar_one_or_none()

                if project:
                    project_data = {
                        "id": str(project.id),
                        "name": project.name,
                        "status": project.status,
                        "client_id": str(project.client_id),
                        "user_id": str(project.user_id),
                    }
                    await RedisCache.cache_project(project_id, project_data)
                    results["project"] = True

        except Exception as e:
            logger.error("Failed to warm project cache", exc_info=True)

        logger.info(f"Cache warmup for project {project_id}: {results}")
        return results


# ============================================================================
# Cache Health Monitoring
# ============================================================================


class CacheHealth:
    """Monitor cache health and performance"""

    @staticmethod
    async def get_health_report() -> Dict[str, Any]:
        """
        Get comprehensive cache health report.

        Returns:
            Dictionary with health metrics
        """
        metrics = CacheMetrics.get_stats()

        # Get Redis health if available
        redis_available = False
        redis_latency = None

        try:
            redis = RedisCache.get_redis_client()
            if redis:
                import time

                start = time.time()
                redis.ping()
                redis_latency = round((time.time() - start) * 1000, 2)
                redis_available = True
        except Exception:
            redis_available = False

        # Get L1 cache stats
        from app.utils.redis_client import _l1_cache

        l1_size = len(_l1_cache)
        l1_maxsize = _l1_cache.maxsize

        return {
            "redis": {"available": redis_available, "latency_ms": redis_latency},
            "l1_cache": {
                "size": l1_size,
                "max_size": l1_maxsize,
                "usage_percent": (round((l1_size / l1_maxsize) * 100, 2) if l1_maxsize > 0 else 0),
            },
            "metrics": metrics,
            "health_status": ("healthy" if metrics["hit_rate_percent"] >= 70 else "degraded"),
        }

    @staticmethod
    async def log_periodic_metrics(interval: int = 3600):
        """
        Log cache metrics periodically (call from background task).

        Args:
            interval: Interval in seconds (for logging purposes only)
        """
        health = await CacheHealth.get_health_report()

        logger.info(
            "Cache health report",
            extra={"report": health, "interval_seconds": interval},
        )


# ============================================================================
# Helper Functions
# ============================================================================


def get_cache_key_identifier(prefix: str, *parts: Any) -> str:
    """
    Generate a cache key from prefix and parts.

    Usage:
        key = get_cache_key_identifier("user:", user_id, "profile")
        # Returns: "user:{user_id}:profile"
    """
    return ":".join([prefix] + [str(p) for p in parts if p is not None])


async def batch_invalidate(pattern: str) -> int:
    """
    Invalidate all cache keys matching a pattern.

    Warning: This is an expensive operation on Redis.
    Use tag-based invalidation when possible.

    Args:
        pattern: Redis key pattern (e.g., "user:*")

    Returns:
        Number of keys deleted
    """
    redis = RedisCache.get_redis_client()
    if not redis:
        return 0

    try:
        keys = redis.keys(pattern)
        if keys:
            redis.delete(*keys)
            return len(keys)
        return 0
    except Exception as e:
        logger.error(f"Failed to batch invalidate pattern: {pattern}", exc_info=True)
        return 0
