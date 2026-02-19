"""
OAuth State Manager - Redis-backed state storage for OAuth flows

This replaces the in-memory oauth_states dictionary in auth.py with Redis storage,
making OAuth work correctly across multiple backend instances.
"""

import secrets
from datetime import datetime
from typing import Optional

from app.core.config import settings
from app.core.logging_config import get_logger

logger = get_logger(__name__)


class OAuthStateManager:
    """
    Manages OAuth state tokens with Redis backend for distributed environments.
    Falls back to in-memory storage if Redis is unavailable (development only).
    """

    def __init__(self):
        self._redis_client = None
        self._in_memory_fallback = {}
        self._use_redis = False

        # Try to initialize Redis
        if settings.upstash_redis_rest_url and settings.upstash_redis_rest_token:
            try:
                from upstash_redis import Redis

                self._redis_client = Redis(
                    url=settings.upstash_redis_rest_url,
                    token=settings.upstash_redis_rest_token,
                )
                # Test connection
                self._redis_client.ping()
                self._use_redis = True
                logger.info("Using Redis for OAuth state storage")
            except Exception as e:
                logger.error("Failed to initialize Redis", exc_info=True)
                logger.warning("Falling back to in-memory storage (not suitable for production)")
        else:
            logger.info("Redis not configured, using in-memory storage (development only)")

    def generate_state(self, provider: str, user_data: Optional[dict] = None) -> str:
        """
        Generate a secure OAuth state token and store it.

        Args:
            provider: OAuth provider name (google, github, etc.)
            user_data: Optional additional data to store with state

        Returns:
            Secure random state token
        """
        state = secrets.token_urlsafe(32)

        # Store state with metadata
        state_data = {
            "provider": provider,
            "created_at": datetime.utcnow().timestamp(),
            "user_data": user_data or {},
        }

        if self._use_redis:
            try:
                # Store in Redis with TTL (10 minutes)
                key = f"oauth:state:{state}"
                # Redis stores as JSON string
                import json

                self._redis_client.setex(
                    key,
                    settings.oauth_state_ttl,  # 600 seconds = 10 minutes
                    json.dumps(state_data),
                )
            except Exception as e:
                logger.error("Failed to store state in Redis", exc_info=True)
                # Fallback to in-memory
                self._in_memory_fallback[state] = state_data
        else:
            # Development: use in-memory storage
            self._in_memory_fallback[state] = state_data

        return state

    def verify_state(self, state: str, provider: Optional[str] = None) -> bool:
        """
        Verify OAuth state token and optionally check provider.

        Args:
            state: The state token to verify
            provider: Optional provider name to validate

        Returns:
            True if state is valid and not expired
        """
        if self._use_redis:
            try:
                key = f"oauth:state:{state}"
                data = self._redis_client.get(key)

                if not data:
                    return False

                # Parse stored data
                import json

                state_data = json.loads(data)

                # Verify provider if specified
                if provider and state_data.get("provider") != provider:
                    return False

                # Delete state after verification (one-time use)
                self._redis_client.delete(key)

                return True
            except Exception as e:
                logger.error("Failed to verify state in Redis", exc_info=True)
                # Try in-memory fallback
                return self._verify_in_memory(state, provider)
        else:
            return self._verify_in_memory(state, provider)

    def _verify_in_memory(self, state: str, provider: Optional[str] = None) -> bool:
        """Verify state using in-memory storage (fallback)."""
        if state not in self._in_memory_fallback:
            return False

        state_data = self._in_memory_fallback[state]
        current_time = datetime.utcnow().timestamp()

        # Check if expired
        if current_time - state_data["created_at"] > settings.oauth_state_ttl:
            del self._in_memory_fallback[state]
            return False

        # Verify provider if specified
        if provider and state_data.get("provider") != provider:
            return False

        # Delete after verification (one-time use)
        del self._in_memory_fallback[state]

        return True

    def cleanup_expired_states(self):
        """
        Clean up expired states from in-memory storage.
        Redis handles this automatically via TTL.
        """
        if not self._use_redis:
            current_time = datetime.utcnow().timestamp()
            expired_states = [
                state
                for state, data in self._in_memory_fallback.items()
                if current_time - data["created_at"] > settings.oauth_state_ttl
            ]
            for state in expired_states:
                del self._in_memory_fallback[state]

            if expired_states:
                logger.info("Cleaned up %d expired states", len(expired_states))


# Global instance
oauth_state_manager = OAuthStateManager()


# Convenience functions for backward compatibility
def generate_oauth_state(provider: str = "generic") -> str:
    """Generate a unique OAuth state string."""
    return oauth_state_manager.generate_state(provider)


def verify_oauth_state(state: str, provider: Optional[str] = None) -> bool:
    """Verify that OAuth state is valid and not expired."""
    return oauth_state_manager.verify_state(state, provider)
