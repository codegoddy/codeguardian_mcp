"""
Distributed Tracing Setup using OpenTelemetry

Enables request tracking across services, NATS events, and database calls.
"""

import logging

from opentelemetry import trace
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.instrumentation.redis import RedisInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter
from opentelemetry.trace import Status, StatusCode

from app.core.config import settings

logger = logging.getLogger(__name__)

# Global tracer
_tracer = None


def setup_tracing(app, service_name: str = None):
    """
    Set up OpenTelemetry distributed tracing for the application.

    Args:
        app: FastAPI application instance
        service_name: Name of the service (default: from config)

    Features:
        - Automatic FastAPI endpoint tracing
        - SQLAlchemy query tracing
        - Redis operation tracing
        - HTTPX request tracing
        - Custom span creation support
    """
    global _tracer

    # Use service name from config or default
    service_name = service_name or settings.app_name or "devhq-backend"

    # Create resource with service information
    resource = Resource.create(
        {
            "service.name": service_name,
            "service.version": "1.0.0",
            "deployment.environment": settings.environment,
        }
    )

    # Set up tracer provider
    provider = TracerProvider(resource=resource)

    # Only enable console exporter in development - disable in production for cleaner logs
    if settings.environment != "production":
        console_exporter = ConsoleSpanExporter()
        provider.add_span_processor(BatchSpanProcessor(console_exporter))
        logger.info(f"[TRACING] Console span exporter enabled for development")
    else:
        logger.info(f"[TRACING] Console span exporter disabled in production for cleaner logs")

    # TODO: When ready for production, add additional exporters:
    # - Jaeger: from opentelemetry.exporter.jaeger.thrift import JaegerExporter
    # - Zipkin: from opentelemetry.exporter.zipkin.json import ZipkinExporter
    # - OTLP: from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

    # Register tracer provider
    trace.set_tracer_provider(provider)

    # Get tracer instance
    _tracer = trace.get_tracer(__name__)

    # Instrument FastAPI
    FastAPIInstrumentor.instrument_app(app)
    logger.info(f"[TRACING] FastAPI instrumentation enabled for {service_name}")

    # Instrument SQLAlchemy (will auto-trace database queries)
    try:
        SQLAlchemyInstrumentor().instrument()
        logger.info("[TRACING] SQLAlchemy instrumentation enabled")
    except Exception as e:
        logger.warning(f"[TRACING] Failed to instrument SQLAlchemy: {e}")

    # Instrument Redis
    try:
        RedisInstrumentor().instrument()
        logger.info("[TRACING] Redis instrumentation enabled")
    except Exception as e:
        logger.warning(f"[TRACING] Failed to instrument Redis: {e}")

    # Instrument HTTPX (for external API calls)
    try:
        HTTPXClientInstrumentor().instrument()
        logger.info("[TRACING] HTTPX instrumentation enabled")
    except Exception as e:
        logger.warning(f"[TRACING] Failed to instrument HTTPX: {e}")

    logger.info(f"[TRACING] Distributed tracing enabled for {service_name}")

    return provider


def get_tracer():
    """
    Get the application tracer instance.

    Returns:
        OpenTelemetry Tracer instance

    Usage:
        from app.observability import get_tracer

        tracer = get_tracer()
        with tracer.start_as_current_span("my_operation") as span:
            span.set_attribute("key", "value")
            # do work
    """
    return _tracer or trace.get_tracer(__name__)


def trace_nats_event(subject: str, event_type: str):
    """
    Decorator to trace NATS event publishing/handling.

    Args:
        subject: NATS subject name
        event_type: Type of event (publish/subscribe)

    Usage:
        @trace_nats_event("project.created", "publish")
        async def publish_project_created(data):
            # publish to NATS
    """

    def decorator(func):
        async def wrapper(*args, **kwargs):
            tracer = get_tracer()
            with tracer.start_as_current_span(
                f"nats.{event_type}",
                attributes={
                    "messaging.system": "nats",
                    "messaging.destination": subject,
                    "messaging.operation": event_type,
                },
            ) as span:
                try:
                    result = await func(*args, **kwargs)
                    span.set_status(Status(StatusCode.OK))
                    return result
                except Exception as e:
                    span.set_status(Status(StatusCode.ERROR, str(e)))
                    span.record_exception(e)
                    raise

        return wrapper

    return decorator


def trace_service_call(service_name: str, operation: str):
    """
    Decorator to trace service layer calls.

    Args:
        service_name: Name of the service
        operation: Operation being performed

    Usage:
        @trace_service_call("invoice_service", "create_invoice")
        async def create_invoice(data):
            # service logic
    """

    def decorator(func):
        async def wrapper(*args, **kwargs):
            tracer = get_tracer()
            with tracer.start_as_current_span(
                f"{service_name}.{operation}",
                attributes={
                    "service.name": service_name,
                    "service.operation": operation,
                },
            ) as span:
                try:
                    result = await func(*args, **kwargs)
                    span.set_status(Status(StatusCode.OK))
                    return result
                except Exception as e:
                    span.set_status(Status(StatusCode.ERROR, str(e)))
                    span.record_exception(e)
                    raise

        return wrapper

    return decorator
