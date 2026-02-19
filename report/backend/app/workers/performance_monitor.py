"""
Performance Monitoring for Event Handlers

Provides decorators and utilities to monitor handler execution time,
track performance metrics, and identify slow handlers.

Features:
- Execution time tracking with percentiles
- Handler success/failure rates
- Slow handler detection and alerting
- Metrics aggregation and reporting
- Prometheus metrics integration

Usage:
    from app.workers.performance_monitor import monitor_handler, get_handler_stats

    @monitor_handler("user.registered_otp")
    async def handle_user_registered_otp(message: str):
        # Handler logic
        pass

    # Get statistics
    stats = get_handler_stats("user.registered_otp")
    print(f"Average execution time: {stats['avg_time']}s")
"""

import asyncio
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from functools import wraps
from typing import Callable, Dict, List, Optional

from app.core.logging_config import get_logger

logger = get_logger(__name__)


@dataclass
class HandlerMetrics:
    """Performance metrics for a single handler"""

    name: str
    total_calls: int = 0
    successful_calls: int = 0
    failed_calls: int = 0
    execution_times: deque = field(default_factory=lambda: deque(maxlen=1000))
    last_execution_time: Optional[float] = None
    last_error: Optional[str] = None
    first_call_time: Optional[float] = None

    @property
    def success_rate(self) -> float:
        """Calculate success rate (0.0 to 1.0)"""
        if self.total_calls == 0:
            return 0.0
        return self.successful_calls / self.total_calls

    @property
    def avg_time(self) -> float:
        """Calculate average execution time (seconds)"""
        if not self.execution_times:
            return 0.0
        return sum(self.execution_times) / len(self.execution_times)

    @property
    def p50_time(self) -> float:
        """Calculate 50th percentile (median) execution time"""
        if not self.execution_times:
            return 0.0
        sorted_times = sorted(self.execution_times)
        return sorted_times[len(sorted_times) // 2]

    @property
    def p95_time(self) -> float:
        """Calculate 95th percentile execution time"""
        if not self.execution_times:
            return 0.0
        sorted_times = sorted(self.execution_times)
        idx = int(len(sorted_times) * 0.95)
        return sorted_times[min(idx, len(sorted_times) - 1)]

    @property
    def p99_time(self) -> float:
        """Calculate 99th percentile execution time"""
        if not self.execution_times:
            return 0.0
        sorted_times = sorted(self.execution_times)
        idx = int(len(sorted_times) * 0.99)
        return sorted_times[min(idx, len(sorted_times) - 1)]

    @property
    def max_time(self) -> float:
        """Get maximum execution time"""
        if not self.execution_times:
            return 0.0
        return max(self.execution_times)

    @property
    def min_time(self) -> float:
        """Get minimum execution time"""
        if not self.execution_times:
            return 0.0
        return min(self.execution_times)

    def record_execution(self, duration: float, success: bool, error: Optional[str] = None):
        """
        Record a handler execution.

        Args:
            duration: Execution time in seconds
            success: Whether execution was successful
            error: Error message if failed
        """
        self.total_calls += 1

        if self.first_call_time is None:
            self.first_call_time = time.time()

        if success:
            self.successful_calls += 1
        else:
            self.failed_calls += 1
            self.last_error = error

        self.execution_times.append(duration)
        self.last_execution_time = duration

    def get_summary(self) -> dict:
        """
        Get a summary of handler metrics.

        Returns:
            Dictionary with key performance metrics
        """
        return {
            "name": self.name,
            "total_calls": self.total_calls,
            "successful_calls": self.successful_calls,
            "failed_calls": self.failed_calls,
            "success_rate": self.success_rate,
            "avg_time_ms": self.avg_time * 1000,
            "p50_time_ms": self.p50_time * 1000,
            "p95_time_ms": self.p95_time * 1000,
            "p99_time_ms": self.p99_time * 1000,
            "max_time_ms": self.max_time * 1000,
            "min_time_ms": self.min_time * 1000,
            "last_execution_time_ms": (self.last_execution_time * 1000 if self.last_execution_time else None),
            "last_error": self.last_error,
        }


class PerformanceMonitor:
    """
    Performance monitor for event handlers.

    Tracks execution time, success/failure rates, and
    identifies slow or failing handlers.
    """

    def __init__(self, slow_threshold: float = 5.0):
        self.slow_threshold = slow_threshold  # seconds
        self._metrics: Dict[str, HandlerMetrics] = {}
        self._lock = asyncio.Lock()

    def _get_or_create_metrics(self, handler_name: str) -> HandlerMetrics:
        """Get or create HandlerMetrics for a handler."""
        if handler_name not in self._metrics:
            self._metrics[handler_name] = HandlerMetrics(handler_name)
        return self._metrics[handler_name]

    async def record_handler(
        self,
        handler_name: str,
        duration: float,
        success: bool,
        error: Optional[str] = None,
    ):
        """
        Record handler execution metrics.

        Args:
            handler_name: Name of the handler
            duration: Execution time in seconds
            success: Whether execution was successful
            error: Error message if failed
        """
        async with self._lock:
            metrics = self._get_or_create_metrics(handler_name)
            metrics.record_execution(duration, success, error)

            # Log slow handler execution
            if duration > self.slow_threshold:
                logger.warning(
                    "Slow handler detected: %s (%.2fs > %.2fs threshold)",
                    handler_name,
                    duration,
                    self.slow_threshold,
                )

            # Log failed handler execution
            if not success:
                logger.error(
                    "Handler execution failed: %s (%s)",
                    handler_name,
                    error or "Unknown error",
                )

    def get_stats(self, handler_name: str) -> Optional[HandlerMetrics]:
        """
        Get metrics for a specific handler.

        Args:
            handler_name: Name of the handler

        Returns:
            HandlerMetrics or None if not found
        """
        if handler_name not in self._metrics:
            return None
        return self._metrics[handler_name]

    def get_all_stats(self) -> Dict[str, dict]:
        """
        Get statistics for all handlers.

        Returns:
            Dictionary mapping handler names to their metrics
        """
        return {name: metrics.get_summary() for name, metrics in self._metrics.items()}

    def get_slow_handlers(self) -> List[dict]:
        """
        Get list of slow handlers (avg time > threshold).

        Returns:
            List of handler summaries for slow handlers
        """
        slow_handlers = []
        for name, metrics in self._metrics.items():
            if metrics.total_calls > 10 and metrics.avg_time > self.slow_threshold:
                slow_handlers.append(metrics.get_summary())

        # Sort by average time descending
        slow_handlers.sort(key=lambda x: x["avg_time_ms"], reverse=True)
        return slow_handlers

    def get_failing_handlers(self) -> List[dict]:
        """
        Get list of failing handlers (success rate < 90%).

        Returns:
            List of handler summaries for failing handlers
        """
        failing_handlers = []
        for name, metrics in self._metrics.items():
            if metrics.total_calls > 10 and metrics.success_rate < 0.9:
                failing_handlers.append(metrics.get_summary())

        # Sort by success rate ascending
        failing_handlers.sort(key=lambda x: x["success_rate"])
        return failing_handlers

    async def reset_stats(self, handler_name: Optional[str] = None):
        """
        Reset metrics for handler(s).

        Args:
            handler_name: Handler name to reset, or None to reset all
        """
        async with self._lock:
            if handler_name:
                if handler_name in self._metrics:
                    self._metrics[handler_name] = HandlerMetrics(handler_name)
                    logger.info("Reset metrics for handler: %s", handler_name)
            else:
                self._metrics.clear()
                logger.info("Reset all handler metrics")


# Global performance monitor instance
performance_monitor = PerformanceMonitor(slow_threshold=5.0)


def monitor_handler(handler_name: Optional[str] = None):
    """
    Decorator to monitor handler execution time and success rate.

    Usage:
        @monitor_handler("user.registered_otp")
        async def handle_user_registered_otp(message: str):
            # Handler logic
            pass

    Args:
        handler_name: Name to use in metrics (defaults to function name)
    """

    def decorator(func):
        name = handler_name or func.__name__

        @wraps(func)
        async def wrapper(*args, **kwargs):
            start_time = time.time()
            error = None
            success = False

            try:
                result = await func(*args, **kwargs)
                success = True
                return result
            except Exception as e:
                error = str(e)
                success = False
                raise
            finally:
                duration = time.time() - start_time
                await performance_monitor.record_handler(name, duration, success, error)

        wrapper._monitored = True
        wrapper._handler_name = name
        return wrapper

    return decorator


def get_handler_stats(handler_name: str) -> Optional[dict]:
    """
    Get statistics for a specific handler.

    Args:
        handler_name: Name of the handler

    Returns:
        Dictionary with handler metrics or None
    """
    metrics = performance_monitor.get_stats(handler_name)
    if metrics:
        return metrics.get_summary()
    return None


def get_all_handler_stats() -> Dict[str, dict]:
    """
    Get statistics for all monitored handlers.

    Returns:
        Dictionary mapping handler names to their metrics
    """
    return performance_monitor.get_all_stats()


def get_slow_handlers() -> List[dict]:
    """
    Get list of slow handlers.

    Returns:
        List of handler summaries for slow handlers
    """
    return performance_monitor.get_slow_handlers()


def get_failing_handlers() -> List[dict]:
    """
    Get list of failing handlers.

    Returns:
        List of handler summaries for failing handlers
    """
    return performance_monitor.get_failing_handlers()


async def reset_handler_stats(handler_name: Optional[str] = None):
    """
    Reset metrics for handler(s).

    Args:
        handler_name: Handler name to reset, or None to reset all
    """
    await performance_monitor.reset_stats(handler_name)
