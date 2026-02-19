"""
Prometheus Metrics Collection

Tracks application performance and business metrics.
"""

import logging
import time
from typing import Callable

from prometheus_client import CONTENT_TYPE_LATEST, CollectorRegistry, Counter, Gauge, Histogram, generate_latest
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger(__name__)

# Create metrics registry
metrics_registry = CollectorRegistry()

# ============================================================================
# HTTP Request Metrics
# ============================================================================

http_requests_total = Counter(
    "http_requests_total",
    "Total HTTP requests",
    ["method", "endpoint", "status_code"],
    registry=metrics_registry,
)

http_request_duration_seconds = Histogram(
    "http_request_duration_seconds",
    "HTTP request duration in seconds",
    ["method", "endpoint"],
    registry=metrics_registry,
    buckets=[0.01, 0.05, 0.1, 0.5, 1.0, 2.5, 5.0, 10.0],
)

http_requests_in_progress = Gauge(
    "http_requests_in_progress",
    "Number of HTTP requests in progress",
    ["method", "endpoint"],
    registry=metrics_registry,
)

# ============================================================================
# Business Metrics
# ============================================================================

# Projects
projects_total = Counter(
    "projects_created_total",
    "Total number of projects created",
    registry=metrics_registry,
)

projects_active = Gauge("projects_active", "Number of active projects", registry=metrics_registry)

# Time Tracking
time_entries_total = Counter(
    "time_entries_created_total",
    "Total number of time entries created",
    ["entry_type"],  # manual, commit, session
    registry=metrics_registry,
)

time_tracked_hours = Counter(
    "time_tracked_hours_total",
    "Total hours tracked",
    ["project_id"],
    registry=metrics_registry,
)

# Financial
invoices_total = Counter(
    "invoices_created_total",
    "Total number of invoices created",
    registry=metrics_registry,
)

payments_received = Counter(
    "payments_received_total",
    "Total number of payments received",
    registry=metrics_registry,
)

revenue_total = Counter("revenue_total_usd", "Total revenue in USD", registry=metrics_registry)

# Git Automation
commits_processed = Counter(
    "git_commits_processed_total",
    "Total number of git commits processed",
    ["repository"],
    registry=metrics_registry,
)

webhooks_received = Counter(
    "git_webhooks_received_total",
    "Total number of git webhooks received",
    ["provider"],  # github, gitlab, bitbucket
    registry=metrics_registry,
)

# NATS Events
nats_events_published = Counter(
    "nats_events_published_total",
    "Total number of NATS events published",
    ["subject"],
    registry=metrics_registry,
)

nats_events_consumed = Counter(
    "nats_events_consumed_total",
    "Total number of NATS events consumed",
    ["subject"],
    registry=metrics_registry,
)

# Database
database_connections_active = Gauge(
    "database_connections_active",
    "Number of active database connections",
    registry=metrics_registry,
)

database_query_duration_seconds = Histogram(
    "database_query_duration_seconds",
    "Database query duration in seconds",
    ["operation"],
    registry=metrics_registry,
    buckets=[0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0],
)

# ============================================================================
# Middleware for automatic HTTP metrics
# ============================================================================


class MetricsMiddleware(BaseHTTPMiddleware):
    """
    Middleware to automatically track HTTP request metrics.
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        method = request.method
        endpoint = request.url.path

        # Skip metrics endpoint itself
        if endpoint == "/metrics":
            return await call_next(request)

        # Track in-progress requests
        http_requests_in_progress.labels(method=method, endpoint=endpoint).inc()

        # Track request duration
        start_time = time.time()

        try:
            response = await call_next(request)
            status_code = response.status_code

            # Record metrics
            duration = time.time() - start_time
            http_requests_total.labels(method=method, endpoint=endpoint, status_code=status_code).inc()
            http_request_duration_seconds.labels(method=method, endpoint=endpoint).observe(duration)

            return response

        except Exception as e:
            # Record error metrics
            duration = time.time() - start_time
            http_requests_total.labels(method=method, endpoint=endpoint, status_code=500).inc()
            http_request_duration_seconds.labels(method=method, endpoint=endpoint).observe(duration)
            raise

        finally:
            # Decrement in-progress counter
            http_requests_in_progress.labels(method=method, endpoint=endpoint).dec()


# ============================================================================
# Helper functions
# ============================================================================


def track_request_metrics(method: str, endpoint: str, status_code: int, duration: float):
    """
    Manually track request metrics (for non-HTTP operations).
    """
    http_requests_total.labels(method=method, endpoint=endpoint, status_code=status_code).inc()
    http_request_duration_seconds.labels(method=method, endpoint=endpoint).observe(duration)


def setup_metrics(app):
    """
    Set up Prometheus metrics collection.

    Args:
        app: FastAPI application instance
    """
    # Add metrics middleware
    app.add_middleware(MetricsMiddleware)

    # Add metrics endpoint
    from fastapi import Response

    @app.get("/metrics")
    async def metrics():
        """Prometheus metrics endpoint"""
        return Response(content=generate_latest(metrics_registry), media_type=CONTENT_TYPE_LATEST)

    logger.info("[METRICS] Prometheus metrics collection enabled at /metrics")


# ============================================================================
# Business Metric Helpers
# ============================================================================


def track_project_created():
    """Track when a project is created"""
    projects_total.inc()


def track_time_entry_created(entry_type: str, hours: float, project_id: str = None):
    """
    Track when a time entry is created.

    Args:
        entry_type: Type of entry (manual, commit, session)
        hours: Number of hours tracked
        project_id: Optional project ID
    """
    time_entries_total.labels(entry_type=entry_type).inc()
    if project_id:
        time_tracked_hours.labels(project_id=project_id).inc(hours)


def track_invoice_created(amount: float):
    """
    Track when an invoice is created.

    Args:
        amount: Invoice amount in USD
    """
    invoices_total.inc()


def track_payment_received(amount: float):
    """
    Track when a payment is received.

    Args:
        amount: Payment amount in USD
    """
    payments_received.inc()
    revenue_total.inc(amount)


def track_commit_processed(repository: str):
    """
    Track when a git commit is processed.

    Args:
        repository: Repository name
    """
    commits_processed.labels(repository=repository).inc()


def track_webhook_received(provider: str):
    """
    Track when a git webhook is received.

    Args:
        provider: Git provider (github, gitlab, bitbucket)
    """
    webhooks_received.labels(provider=provider).inc()


def track_nats_event_published(subject: str):
    """
    Track when a NATS event is published.

    Args:
        subject: NATS subject
    """
    nats_events_published.labels(subject=subject).inc()


def track_nats_event_consumed(subject: str):
    """
    Track when a NATS event is consumed.

    Args:
        subject: NATS subject
    """
    nats_events_consumed.labels(subject=subject).inc()
