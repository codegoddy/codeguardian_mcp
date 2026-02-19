"""
Correlation ID Middleware for Distributed Tracing

Adds a unique correlation ID to each request for tracking across services and logs.
This is critical for microservices observability.
"""

import logging
import uuid
from contextvars import ContextVar
from typing import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

# Context variable to store correlation ID across async calls
correlation_id_var: ContextVar[str] = ContextVar("correlation_id", default="")

logger = logging.getLogger(__name__)


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    """
    Middleware to add correlation IDs to all requests.

    Features:
    - Generates UUID for each request if not provided
    - Accepts X-Correlation-ID header from clients/gateways
    - Stores correlation ID in context variable for logging
    - Adds correlation ID to response headers
    - Enables request tracking across services
    """

    def __init__(self, app, header_name: str = "X-Correlation-ID"):
        super().__init__(app)
        self.header_name = header_name

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Try to get correlation ID from request header
        correlation_id = request.headers.get(self.header_name)

        # Generate new correlation ID if not provided
        if not correlation_id:
            correlation_id = str(uuid.uuid4())

        # Store correlation ID in context variable
        correlation_id_var.set(correlation_id)

        # Add to request state for easy access in endpoints
        request.state.correlation_id = correlation_id

        # Log the request with correlation ID
        logger.info(
            f"[{correlation_id}] {request.method} {request.url.path} - Started",
            extra={"correlation_id": correlation_id},
        )

        # Process request
        try:
            response = await call_next(request)

            # Add correlation ID to response headers
            response.headers[self.header_name] = correlation_id

            # Log response
            logger.info(
                f"[{correlation_id}] {request.method} {request.url.path} - " f"Completed {response.status_code}",
                extra={
                    "correlation_id": correlation_id,
                    "status_code": response.status_code,
                },
            )

            return response

        except Exception as e:
            logger.error(
                f"[{correlation_id}] {request.method} {request.url.path} - " f"Error: {str(e)}",
                extra={"correlation_id": correlation_id},
                exc_info=True,
            )
            raise


def get_correlation_id() -> str:
    """
    Get the current correlation ID from context.

    Returns:
        Correlation ID string, or empty string if not set
    """
    return correlation_id_var.get()


class CorrelationIdFilter(logging.Filter):
    """
    Logging filter to add correlation ID to all log records.

    Usage:
        import logging
        handler = logging.StreamHandler()
        handler.addFilter(CorrelationIdFilter())
        logger.addHandler(handler)
    """

    def filter(self, record):
        record.correlation_id = get_correlation_id() or "no-correlation-id"
        return True
