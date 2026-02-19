"""
Redis client utility for caching using Upstash Redis
Provides caching for static and semi-static data to optimize performance

L1 Cache Architecture:
- L1: In-memory TTLCache (cachetools) - fast, local, 5-min TTL
- L2: Redis (Upstash) - shared across instances, longer TTL
- Reads: L1 first, then L2 on miss
- Writes: Both L1 and L2
- Deletes: Both L1 and L2
"""

import json
import threading
from datetime import datetime
from typing import Any, Optional

from cachetools import TTLCache
from upstash_redis import Redis

from app.core.config import settings
from app.core.logging_config import get_logger

logger = get_logger(__name__)

# Initialize Upstash Redis client
redis_client: Optional[Redis] = None

# L1 In-Memory Cache - Thread-safe with lock
# 5-minute TTL, max 1000 entries per instance
_l1_cache_lock = threading.Lock()
_l1_cache: TTLCache = TTLCache(maxsize=1000, ttl=300)  # 5 minutes


def get_redis_client() -> Optional[Redis]:
    """Get or create Redis client instance"""
    global redis_client

    if not settings.upstash_redis_rest_url or not settings.upstash_redis_rest_token:
        return None

    if redis_client is None:
        try:
            redis_client = Redis(
                url=settings.upstash_redis_rest_url,
                token=settings.upstash_redis_rest_token,
            )
        except Exception as e:
            logger.error("Failed to initialize Redis client", exc_info=True)
            return None

    return redis_client


def _l1_get(key: str) -> Optional[Any]:
    """Thread-safe L1 cache get"""
    with _l1_cache_lock:
        return _l1_cache.get(key)


def _l1_set(key: str, value: Any) -> None:
    """Thread-safe L1 cache set"""
    with _l1_cache_lock:
        _l1_cache[key] = value


def _l1_delete(key: str) -> None:
    """Thread-safe L1 cache delete"""
    with _l1_cache_lock:
        _l1_cache.pop(key, None)


def _l1_clear() -> None:
    """Thread-safe L1 cache clear (useful for testing or full invalidation)"""
    with _l1_cache_lock:
        _l1_cache.clear()


class RedisCache:
    """Redis cache manager with L1 in-memory + L2 Redis layers"""

    # Cache key prefixes
    SETTINGS_PREFIX = "settings:user:"
    STATIC_DATA_PREFIX = "static:"
    TEMPLATES_PREFIX = "templates:system:v2"
    USER_PREFIX = "user:"
    CLIENT_PREFIX = "client:"
    PROJECT_PREFIX = "project:"
    TASK_QUEUE_PREFIX = "task:contract:"
    CLIENT_PORTAL_SESSION_PREFIX = "cp_session:"
    CLIENT_PORTAL_TOKEN_PREFIX = "cp_token:"

    # Cache TTL (Time To Live) in seconds - INCREASED for scalability
    # These are L2 (Redis) TTLs. L1 uses fixed 5-minute TTL.
    SETTINGS_TTL = 86400  # 24 hours (was 1 hour) - settings rarely change
    STATIC_DATA_TTL = 604800  # 7 days (was 24 hours) - truly static data
    TEMPLATES_TTL = 604800  # 7 days for system templates (they rarely change)
    USER_TTL = 86400  # 24 hours (was 2 hours) - user data is stable
    CLIENT_TTL = 86400  # 24 hours (was 2 hours) - client data doesn't change often
    PROJECT_TTL = 7200  # 2 hours (was 30 min) - projects update moderately
    CLIENT_PORTAL_SESSION_TTL = 86400  # 24 hours for client portal sessions

    @staticmethod
    async def get(key: str) -> Optional[Any]:
        """Get value from cache - L1 first, then L2 (Redis)"""
        # Check L1 (memory) first
        l1_value = _l1_get(key)
        if l1_value is not None:
            return l1_value

        # L1 miss - check L2 (Redis)
        client = get_redis_client()
        if not client:
            return None

        try:
            value = client.get(key)
            if value:
                parsed = json.loads(value)
                # Populate L1 cache for next time
                _l1_set(key, parsed)
                return parsed
            return None
        except Exception as e:
            logger.error("Redis GET error", exc_info=True)
            return None

    @staticmethod
    async def set(key: str, value: Any, ttl: int = SETTINGS_TTL) -> bool:
        """Set value in cache - writes to both L1 and L2"""
        # Always set in L1 first (fast)
        _l1_set(key, value)

        # Then set in L2 (Redis) for persistence/sharing
        client = get_redis_client()
        if not client:
            return True  # L1 succeeded, that's okay

        try:
            serialized = json.dumps(value, default=str)
            client.setex(key, ttl, serialized)
            return True
        except Exception as e:
            logger.error("Redis SET error", exc_info=True)
            return True  # L1 still succeeded

    @staticmethod
    async def delete(key: str) -> bool:
        """Delete value from cache - removes from both L1 and L2"""
        # Delete from L1 first
        _l1_delete(key)

        # Then delete from L2 (Redis)
        client = get_redis_client()
        if not client:
            return True  # L1 succeeded

        try:
            client.delete(key)
            return True
        except Exception as e:
            logger.error("Redis DELETE error", exc_info=True)
            return True  # L1 still succeeded

    @staticmethod
    async def invalidate_user_settings(user_id: int) -> bool:
        """Invalidate user settings cache"""
        key = f"{RedisCache.SETTINGS_PREFIX}{user_id}"
        return await RedisCache.delete(key)

    @staticmethod
    async def enqueue_task(task_id: str, task_data: dict, ttl: int = 3600) -> bool:
        """Add a task to the queue"""
        key = f"{RedisCache.TASK_QUEUE_PREFIX}{task_id}"
        task_data["enqueued_at"] = str(datetime.now())
        task_data["status"] = "pending"
        return await RedisCache.set(key, task_data, ttl)

    @staticmethod
    async def get_task(task_id: str) -> Optional[dict]:
        """Get task from queue"""
        key = f"{RedisCache.TASK_QUEUE_PREFIX}{task_id}"
        return await RedisCache.get(key)

    @staticmethod
    async def update_task_status(task_id: str, status: str, result: Optional[dict] = None) -> bool:
        """Update task status - creates task if it doesn't exist"""
        task = await RedisCache.get_task(task_id)
        if not task:
            # Task doesn't exist, create it
            logger.warning("Task %s not found, creating new task entry", task_id)
            task = {"task_id": task_id, "created_at": str(datetime.now())}

        task["status"] = status
        task["updated_at"] = str(datetime.now())
        if result:
            task["result"] = result

        key = f"{RedisCache.TASK_QUEUE_PREFIX}{task_id}"
        success = await RedisCache.set(key, task, 3600)
        if not success:
            logger.error("Failed to update task status for %s", task_id)
        return success

    @staticmethod
    async def cache_system_templates(templates: list) -> bool:
        """Cache system templates (they rarely change)"""
        return await RedisCache.set(RedisCache.TEMPLATES_PREFIX, templates, RedisCache.TEMPLATES_TTL)

    @staticmethod
    async def get_cached_system_templates() -> Optional[list]:
        """Get cached system templates"""
        return await RedisCache.get(RedisCache.TEMPLATES_PREFIX)

    @staticmethod
    async def cache_user(user_id: int, user_data: dict) -> bool:
        """Cache user data"""
        key = f"{RedisCache.USER_PREFIX}{user_id}"
        return await RedisCache.set(key, user_data, RedisCache.USER_TTL)

    @staticmethod
    async def get_cached_user(user_id: int) -> Optional[dict]:
        """Get cached user data"""
        key = f"{RedisCache.USER_PREFIX}{user_id}"
        return await RedisCache.get(key)

    @staticmethod
    async def invalidate_user(user_id: int) -> bool:
        """Invalidate user cache"""
        key = f"{RedisCache.USER_PREFIX}{user_id}"
        return await RedisCache.delete(key)

    @staticmethod
    async def cache_client(client_id: int, client_data: dict) -> bool:
        """Cache client data"""
        key = f"{RedisCache.CLIENT_PREFIX}{client_id}"
        return await RedisCache.set(key, client_data, RedisCache.CLIENT_TTL)

    @staticmethod
    async def get_cached_client(client_id: int) -> Optional[dict]:
        """Get cached client data"""
        key = f"{RedisCache.CLIENT_PREFIX}{client_id}"
        return await RedisCache.get(key)

    @staticmethod
    async def invalidate_client(client_id: int) -> bool:
        """Invalidate client cache"""
        key = f"{RedisCache.CLIENT_PREFIX}{client_id}"
        return await RedisCache.delete(key)

    @staticmethod
    async def cache_project(project_id: int, project_data: dict) -> bool:
        """Cache project data"""
        key = f"{RedisCache.PROJECT_PREFIX}{project_id}"
        return await RedisCache.set(key, project_data, RedisCache.PROJECT_TTL)

    @staticmethod
    async def get_cached_project(project_id: int) -> Optional[dict]:
        """Get cached project data"""
        key = f"{RedisCache.PROJECT_PREFIX}{project_id}"
        return await RedisCache.get(key)

    @staticmethod
    async def invalidate_project(project_id: int) -> bool:
        """Invalidate project cache"""
        key = f"{RedisCache.PROJECT_PREFIX}{project_id}"
        return await RedisCache.delete(key)

    @staticmethod
    async def get_user_settings(user_id: int) -> Optional[dict]:
        """Get user settings from cache"""
        key = f"{RedisCache.SETTINGS_PREFIX}{user_id}"
        return await RedisCache.get(key)

    @staticmethod
    async def set_user_settings(user_id: int, settings_data: dict) -> bool:
        """Cache user settings"""
        key = f"{RedisCache.SETTINGS_PREFIX}{user_id}"
        return await RedisCache.set(key, settings_data, RedisCache.SETTINGS_TTL)

    @staticmethod
    async def get_static_data(data_type: str) -> Optional[dict]:
        """Get static data from cache (currencies, timezones, etc.)"""
        key = f"{RedisCache.STATIC_DATA_PREFIX}{data_type}"
        return await RedisCache.get(key)

    @staticmethod
    async def set_static_data(data_type: str, data: dict) -> bool:
        """Cache static data with long TTL"""
        key = f"{RedisCache.STATIC_DATA_PREFIX}{data_type}"
        return await RedisCache.set(key, data, RedisCache.STATIC_DATA_TTL)

    # Payment Methods Caching
    PAYMENT_METHODS_PREFIX = "payment_methods:user:"
    PAYMENT_METHODS_TTL = 7200  # 2 hours (was 1 hour) - payment methods don't change often

    @staticmethod
    async def get_payment_methods(user_id: int) -> Optional[list]:
        """Get user payment methods from cache"""
        key = f"{RedisCache.PAYMENT_METHODS_PREFIX}{user_id}"
        return await RedisCache.get(key)

    @staticmethod
    async def set_payment_methods(user_id: int, methods: list) -> bool:
        """Cache user payment methods"""
        key = f"{RedisCache.PAYMENT_METHODS_PREFIX}{user_id}"
        return await RedisCache.set(key, methods, RedisCache.PAYMENT_METHODS_TTL)

    @staticmethod
    async def invalidate_payment_methods(user_id: int) -> bool:
        """Invalidate user payment methods cache"""
        key = f"{RedisCache.PAYMENT_METHODS_PREFIX}{user_id}"
        return await RedisCache.delete(key)

    # Clients Caching
    CLIENTS_PREFIX = "clients:user:"
    CLIENTS_TTL = 7200  # 2 hours (was 30 min) - matches CLIENT_TTL for consistency

    @staticmethod
    async def get_clients(user_id: int) -> Optional[list]:
        """Get user clients from cache"""
        key = f"{RedisCache.CLIENTS_PREFIX}{user_id}"
        return await RedisCache.get(key)

    @staticmethod
    async def set_clients(user_id: int, clients: list) -> bool:
        """Cache user clients"""
        key = f"{RedisCache.CLIENTS_PREFIX}{user_id}"
        return await RedisCache.set(key, clients, RedisCache.CLIENTS_TTL)

    @staticmethod
    async def invalidate_clients(user_id: int) -> bool:
        """Invalidate user clients cache"""
        key = f"{RedisCache.CLIENTS_PREFIX}{user_id}"
        return await RedisCache.delete(key)

    # Client Portal Session Caching
    @staticmethod
    async def cache_client_portal_session(magic_token: str, session_data: dict) -> bool:
        """Cache client portal session by magic token"""
        key = f"{RedisCache.CLIENT_PORTAL_TOKEN_PREFIX}{magic_token}"
        return await RedisCache.set(key, session_data, RedisCache.CLIENT_PORTAL_SESSION_TTL)

    @staticmethod
    async def get_cached_client_portal_session(magic_token: str) -> Optional[dict]:
        """Get cached client portal session by magic token"""
        key = f"{RedisCache.CLIENT_PORTAL_TOKEN_PREFIX}{magic_token}"
        return await RedisCache.get(key)

    @staticmethod
    async def invalidate_client_portal_session(magic_token: str) -> bool:
        """Invalidate client portal session cache"""
        key = f"{RedisCache.CLIENT_PORTAL_TOKEN_PREFIX}{magic_token}"
        return await RedisCache.delete(key)


# Static data definitions (highly static, rarely changes)
STATIC_DATA = {
    "currencies": [
        {"code": "USD", "name": "US Dollar", "symbol": "$"},
        {"code": "EUR", "name": "Euro", "symbol": "€"},
        {"code": "GBP", "name": "British Pound", "symbol": "£"},
        {"code": "KES", "name": "Kenyan Shilling", "symbol": "KSh"},
        {"code": "NGN", "name": "Nigerian Naira", "symbol": "₦"},
        {"code": "ZAR", "name": "South African Rand", "symbol": "R"},
        {"code": "CAD", "name": "Canadian Dollar", "symbol": "CA$"},
        {"code": "AUD", "name": "Australian Dollar", "symbol": "A$"},
        {"code": "INR", "name": "Indian Rupee", "symbol": "₹"},
        {"code": "JPY", "name": "Japanese Yen", "symbol": "¥"},
        {"code": "CNY", "name": "Chinese Yuan", "symbol": "¥"},
    ],
    "timezones": [
        {"value": "UTC", "label": "UTC"},
        {"value": "America/New_York", "label": "Eastern Time (US)"},
        {"value": "America/Chicago", "label": "Central Time (US)"},
        {"value": "America/Denver", "label": "Mountain Time (US)"},
        {"value": "America/Los_Angeles", "label": "Pacific Time (US)"},
        {"value": "Europe/London", "label": "London"},
        {"value": "Europe/Paris", "label": "Paris"},
        {"value": "Africa/Nairobi", "label": "Nairobi"},
        {"value": "Africa/Lagos", "label": "Lagos"},
        {"value": "Asia/Dubai", "label": "Dubai"},
        {"value": "Asia/Kolkata", "label": "India"},
        {"value": "Asia/Singapore", "label": "Singapore"},
        {"value": "Asia/Tokyo", "label": "Tokyo"},
        {"value": "Australia/Sydney", "label": "Sydney"},
    ],
    "date_formats": [
        {"value": "YYYY-MM-DD", "label": "YYYY-MM-DD", "example": "2025-01-15"},
        {"value": "MM/DD/YYYY", "label": "MM/DD/YYYY", "example": "01/15/2025"},
        {"value": "DD/MM/YYYY", "label": "DD/MM/YYYY", "example": "15/01/2025"},
        {"value": "DD-MM-YYYY", "label": "DD-MM-YYYY", "example": "15-01-2025"},
    ],
    "time_formats": [
        {"value": "24h", "label": "24-hour", "example": "14:30"},
        {"value": "12h", "label": "12-hour", "example": "2:30 PM"},
    ],
    "constraints": {
        "profile_image": {
            "recommended": "Square image, at least 200x200px",
            "max_size_mb": 5,
            "accepted_formats": ["image/jpeg", "image/png", "image/gif", "image/webp"],
        },
        "password": {
            "min_length": 8,
            "requirements": "Password must be at least 8 characters long",
        },
    },
}


async def initialize_static_cache():
    """Initialize static data cache on application startup"""
    for data_type, data in STATIC_DATA.items():
        await RedisCache.set_static_data(data_type, data)
