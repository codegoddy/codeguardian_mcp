"""
Workers package for background processing and event handler optimization.

Modules:
- task_queue: Async task queue for non-critical operations
- circuit_breaker: Circuit breaker pattern for external service protection
- performance_monitor: Performance monitoring for event handlers
- email_worker: Email worker for NATS event handling
- email_handlers: Email handler functions
"""

from app.workers.circuit_breaker import (
    CircuitBreaker,
    CircuitBreakerConfig,
    CircuitBreakerOpenError,
    CircuitBreakerState,
    circuit_breaker,
    with_circuit_breaker,
)
from app.workers.email_handlers import register_email_handlers
from app.workers.email_worker import start_email_worker
from app.workers.performance_monitor import (
    HandlerMetrics,
    PerformanceMonitor,
    get_all_handler_stats,
    get_failing_handlers,
    get_handler_stats,
    get_slow_handlers,
    monitor_handler,
    performance_monitor,
    reset_handler_stats,
)
from app.workers.task_queue import TaskPriority, TaskQueue, get_task_queue, start_task_queue, stop_task_queue, task_queue

__all__ = [
    # Email worker
    "start_email_worker",
    "register_email_handlers",
    # Task queue
    "TaskQueue",
    "TaskPriority",
    "task_queue",
    "start_task_queue",
    "stop_task_queue",
    "get_task_queue",
    # Circuit breaker
    "CircuitBreaker",
    "CircuitBreakerConfig",
    "CircuitBreakerState",
    "CircuitBreakerOpenError",
    "circuit_breaker",
    "with_circuit_breaker",
    # Performance monitor
    "HandlerMetrics",
    "PerformanceMonitor",
    "performance_monitor",
    "monitor_handler",
    "get_handler_stats",
    "get_all_handler_stats",
    "get_slow_handlers",
    "get_failing_handlers",
    "reset_handler_stats",
]
