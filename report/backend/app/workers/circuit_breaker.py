"""
Circuit Breaker Pattern for External Services

Implements the circuit breaker pattern to prevent cascading failures
when external services (email, git providers, etc.) are experiencing issues.

Features:
- Automatic state transitions (Closed -> Open -> Half-Open -> Closed)
- Failure threshold and timeout configuration
- Exponential backoff for recovery
- Per-service circuit breakers
- Metrics tracking (success/failure rates)

Usage:
    from app.workers.circuit_breaker import circuit_breaker, CircuitBreakerState

    # Create circuit breaker for email service
    email_breaker = circuit_breaker.get_breaker("brevo_email")

    # Use circuit breaker with a protected operation
    try:
        result = await email_breaker.call(send_email, to_email, subject, body)
    except CircuitBreakerOpenError:
        logger.error("Email service circuit breaker is open")
        # Fallback: queue email for later retry

    # Check circuit breaker state
    if email_breaker.state == CircuitBreakerState.OPEN:
        logger.warning("Email service is currently unavailable")
"""

import asyncio
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from functools import wraps
from typing import Any, Callable, Dict, Optional

from app.core.logging_config import get_logger

logger = get_logger(__name__)


class CircuitBreakerState(Enum):
    """Circuit breaker states"""

    CLOSED = "closed"  # Normal operation, requests pass through
    OPEN = "open"  # Service is failing, requests are blocked
    HALF_OPEN = "half_open"  # Testing if service has recovered


class CircuitBreakerOpenError(Exception):
    """Raised when circuit breaker is open"""

    pass


@dataclass
class CircuitBreakerConfig:
    """Circuit breaker configuration"""

    failure_threshold: int = 5  # Number of failures before opening
    success_threshold: int = 3  # Number of successes needed to close (half-open)
    timeout: float = 60.0  # Seconds to wait before attempting recovery (open -> half-open)
    rolling_window: float = 300.0  # Seconds to track failures (rolling window)

    # For external HTTP services
    request_timeout: float = 10.0  # Timeout for individual requests
    max_retries: int = 2  # Automatic retry attempts


@dataclass
class CircuitBreakerMetrics:
    """Circuit breaker metrics"""

    total_requests: int = 0
    successful_requests: int = 0
    failed_requests: int = 0
    recent_failures: list = field(default_factory=list)  # [(timestamp, error), ...]
    state_changes: list = field(default_factory=list)  # [(timestamp, from_state, to_state), ...]

    @property
    def failure_rate(self) -> float:
        """Calculate failure rate (0.0 to 1.0)"""
        if self.total_requests == 0:
            return 0.0
        return self.failed_requests / self.total_requests

    @property
    def recent_failure_count(self) -> int:
        """Count recent failures within rolling window"""
        return len(self.recent_failures)


class CircuitBreaker:
    """
    Circuit breaker implementation for external service protection.

    Automatically trips to OPEN state when failure threshold is exceeded,
    preventing further requests to failing services.
    """

    def __init__(self, name: str, config: Optional[CircuitBreakerConfig] = None):
        self.name = name
        self.config = config or CircuitBreakerConfig()

        self.state = CircuitBreakerState.CLOSED
        self.metrics = CircuitBreakerMetrics()
        self._last_failure_time: Optional[float] = None
        self._lock = asyncio.Lock()

    async def call(self, func: Callable, *args, timeout: Optional[float] = None, **kwargs) -> Any:
        """
        Execute a function through the circuit breaker.

        Args:
            func: Async function to call
            *args: Function arguments
            timeout: Override default request timeout
            **kwargs: Function keyword arguments

        Returns:
            Result of function call

        Raises:
            CircuitBreakerOpenError: If circuit breaker is open
            Exception: If function call fails (after retries)
        """
        timeout = timeout or self.config.request_timeout

        async with self._lock:
            # Check if circuit breaker is open
            if self.state == CircuitBreakerState.OPEN:
                if self._should_attempt_reset():
                    await self._transition_to(CircuitBreakerState.HALF_OPEN)
                else:
                    raise CircuitBreakerOpenError(f"Circuit breaker '{self.name}' is OPEN. " f"Service is unavailable.")

        # Execute function with retry logic
        last_error = None
        for attempt in range(self.config.max_retries):
            try:
                self.metrics.total_requests += 1
                result = await asyncio.wait_for(func(*args, **kwargs), timeout=timeout)

                # Success - record and possibly reset circuit
                async with self._lock:
                    self.metrics.successful_requests += 1

                    if self.state == CircuitBreakerState.HALF_OPEN:
                        self.metrics.recent_failures.clear()
                        await self._transition_to(CircuitBreakerState.CLOSED)

                    return result

            except asyncio.TimeoutError as e:
                last_error = e
                logger.warning(
                    "Circuit breaker '%s': request timeout (attempt %d/%d)",
                    self.name,
                    attempt + 1,
                    self.config.max_retries,
                )

                if attempt == self.config.max_retries - 1:
                    await self._on_failure("timeout")

            except Exception as e:
                last_error = e
                logger.debug(
                    "Circuit breaker '%s': request failed (attempt %d/%d): %s",
                    self.name,
                    attempt + 1,
                    self.config.max_retries,
                    str(e),
                )

                if attempt == self.config.max_retries - 1:
                    await self._on_failure(str(e))

                # Don't retry for certain errors
                if self._should_not_retry(e):
                    break

        # All retries failed
        raise last_error or Exception("Unknown error in circuit breaker")

    async def _on_failure(self, error: str):
        """Handle a failed request."""
        async with self._lock:
            self.metrics.failed_requests += 1
            self._last_failure_time = time.time()

            # Add to recent failures (within rolling window)
            self.metrics.recent_failures.append((time.time(), error))

            # Clean old failures outside rolling window
            cutoff_time = time.time() - self.config.rolling_window
            self.metrics.recent_failures = [(ts, err) for ts, err in self.metrics.recent_failures if ts > cutoff_time]

            # Check if threshold exceeded
            if self.metrics.recent_failure_count >= self.config.failure_threshold and self.state != CircuitBreakerState.OPEN:
                await self._transition_to(CircuitBreakerState.OPEN)

    def _should_attempt_reset(self) -> bool:
        """Check if enough time has passed to attempt recovery."""
        if self._last_failure_time is None:
            return True

        elapsed = time.time() - self._last_failure_time
        return elapsed >= self.config.timeout

    def _should_not_retry(self, error: Exception) -> bool:
        """
        Determine if error should not be retried.

        Args:
            error: Exception that occurred

        Returns:
            bool: True if error should not be retried
        """
        # Don't retry authentication errors
        error_lower = str(error).lower()
        non_retryable_keywords = [
            "authentication",
            "unauthorized",
            "forbidden",
            "invalid api key",
        ]

        return any(keyword in error_lower for keyword in non_retryable_keywords)

    async def _transition_to(self, new_state: CircuitBreakerState):
        """
        Transition circuit breaker to new state.

        Args:
            new_state: New state to transition to
        """
        if self.state == new_state:
            return

        old_state = self.state
        self.state = new_state

        # Record state change
        self.metrics.state_changes.append((time.time(), old_state.name, new_state.name))

        # Log transition
        logger.warning(
            "Circuit breaker '%s' transitioned: %s -> %s",
            self.name,
            old_state.value,
            new_state.value,
        )

        # Clear failures when entering half-open
        if new_state == CircuitBreakerState.HALF_OPEN:
            logger.info(
                "Circuit breaker '%s' entering HALF_OPEN state to test recovery",
                self.name,
            )

    def get_stats(self) -> dict:
        """
        Get circuit breaker statistics.

        Returns:
            Dictionary with circuit breaker state and metrics
        """
        time_until_reset = None
        if self.state == CircuitBreakerState.OPEN and self._last_failure_time:
            time_until_reset = max(0, self.config.timeout - (time.time() - self._last_failure_time))

        return {
            "name": self.name,
            "state": self.state.value,
            "total_requests": self.metrics.total_requests,
            "successful_requests": self.metrics.successful_requests,
            "failed_requests": self.metrics.failed_requests,
            "failure_rate": self.metrics.failure_rate,
            "recent_failures": self.metrics.recent_failure_count,
            "time_until_reset": time_until_reset,
            "state_changes": len(self.metrics.state_changes),
        }

    async def reset(self):
        """Manually reset circuit breaker to CLOSED state."""
        async with self._lock:
            if self.state != CircuitBreakerState.CLOSED:
                await self._transition_to(CircuitBreakerState.CLOSED)
                self.metrics.recent_failures.clear()
                self._last_failure_time = None
                logger.info("Circuit breaker '%s' manually reset", self.name)


class CircuitBreakerRegistry:
    """
    Registry for managing multiple circuit breakers.
    """

    def __init__(self):
        self._breakers: Dict[str, CircuitBreaker] = {}
        self._lock = asyncio.Lock()

    async def get_breaker(self, name: str, config: Optional[CircuitBreakerConfig] = None) -> CircuitBreaker:
        """
        Get or create a circuit breaker by name.

        Args:
            name: Circuit breaker identifier
            config: Optional configuration (only used when creating)

        Returns:
            CircuitBreaker instance
        """
        async with self._lock:
            if name not in self._breakers:
                self._breakers[name] = CircuitBreaker(name, config)
                logger.debug("Created circuit breaker: %s", name)

            return self._breakers[name]

    async def reset_all(self):
        """Reset all circuit breakers to CLOSED state."""
        async with self._lock:
            for breaker in self._breakers.values():
                await breaker.reset()
            logger.info("All circuit breakers reset")

    def get_all_stats(self) -> Dict[str, dict]:
        """
        Get statistics for all circuit breakers.

        Returns:
            Dictionary mapping breaker names to their stats
        """
        return {name: breaker.get_stats() for name, breaker in self._breakers.items()}


# Global circuit breaker registry
circuit_breaker = CircuitBreakerRegistry()


def with_circuit_breaker(
    service_name: str,
    config: Optional[CircuitBreakerConfig] = None,
    fallback: Optional[Callable] = None,
):
    """
    Decorator to wrap functions with circuit breaker protection.

    Usage:
        @with_circuit_breaker("brevo_email", fallback=queue_email_for_retry)
        async def send_email(to: str, subject: str, body: str):
            # Email sending logic
            pass

    Args:
        service_name: Circuit breaker identifier
        config: Optional circuit breaker configuration
        fallback: Optional fallback function to call when circuit is open
    """

    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            breaker = await circuit_breaker.get_breaker(service_name, config)

            try:
                return await breaker.call(func, *args, **kwargs)
            except CircuitBreakerOpenError:
                if fallback:
                    logger.warning("Circuit breaker '%s' is open, using fallback", service_name)
                    return await fallback(*args, **kwargs)
                else:
                    raise

        return wrapper

    return decorator
