import logging
import logging.config
import os
import sys
from pathlib import Path
from typing import Optional

from app.core.config import settings


class CorrelationFilter(logging.Filter):
    """
    Filter that adds correlation IDs from OpenTelemetry to log records.
    """

    def filter(self, record):
        try:
            from opentelemetry import trace

            span = trace.get_current_span()
            span_context = span.get_span_context()

            if span_context.is_valid:
                record.trace_id = format(span_context.trace_id, "032x")
                record.span_id = format(span_context.span_id, "016x")
            else:
                record.trace_id = None
                record.span_id = None
        except Exception:
            record.trace_id = None
            record.span_id = None

        return True


def get_log_level() -> str:
    """
    Get the appropriate log level based on environment.
    """
    if settings.environment == "production":
        return "INFO"
    return "DEBUG"


def get_log_format() -> dict:
    """
    Get logging format configuration based on environment.
    """
    if settings.environment == "production":
        # Clean, readable format for Render logs - no trace_id spam
        return {
            "format": "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
            "datefmt": "%Y-%m-%d %H:%M:%S",
        }
    else:
        return {
            "format": "%(asctime)s | %(levelname)-8s | %(name)s | %(funcName)s:%(lineno)d | %(message)s",
            "datefmt": "%Y-%m-%d %H:%M:%S",
        }


def setup_logging(
    log_level: Optional[str] = None,
    log_file: Optional[str] = None,
    json_logs: bool = False,
) -> None:
    """
    Configure centralized logging for the application.

    Args:
        log_level: Override log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        log_file: Path to log file (optional)
        json_logs: Use JSON format for logs (production only)
    """

    # Determine log level
    if log_level is None:
        log_level = get_log_level()

    # Base handlers configuration
    handlers = {
        "console": {
            "class": "logging.StreamHandler",
            "level": log_level,
            "formatter": "default",
            "stream": "ext://sys.stdout",
        }
    }

    formatters = {
        "default": get_log_format(),
    }

    # Add file handler if log file is specified
    if log_file:
        # Ensure log directory exists
        log_path = Path(log_file)
        log_path.parent.mkdir(parents=True, exist_ok=True)

        handlers["file"] = {
            "class": "logging.handlers.RotatingFileHandler",
            "level": log_level,
            "formatter": "default",
            "filename": log_file,
            "maxBytes": 10485760,  # 10MB
            "backupCount": 5,
            "encoding": "utf-8",
        }

    # JSON logging only if explicitly requested (not by default in production)
    if json_logs:
        try:
            from pythonjsonlogger import jsonlogger

            formatters["json"] = {
                "()": "pythonjsonlogger.jsonlogger.JsonFormatter",
                "format": "%(asctime)s %(levelname)s %(name)s %(message)s",
            }

            handlers["console"]["formatter"] = "json"
        except ImportError:
            # If python-json-logger is not available, use standard format
            pass

    # Logging configuration
    logging_config = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": formatters,
        "filters": (
            {"correlation": {"()": "app.core.logging_config.CorrelationFilter"}}
            if settings.environment != "production"
            else {}
        ),  # Disable correlation filter in production
        "handlers": handlers,
        "loggers": {
            "": {
                "level": log_level,
                "handlers": ["console"] + (["file"] if log_file else []),
                "propagate": True,
                "filters": (
                    ["correlation"] if settings.environment != "production" else []
                ),  # No correlation filter in production
            },
            "uvicorn": {
                "level": "INFO",
                "handlers": ["console"],
                "propagate": False,
            },
            "uvicorn.access": {
                "level": "INFO",
                "handlers": ["console"],
                "propagate": False,
            },
            "httpx": {
                "level": "WARNING",
                "handlers": ["console"],
                "propagate": False,
            },
            "httpcore": {
                "level": "WARNING",
                "handlers": ["console"],
                "propagate": False,
            },
            "sqlalchemy": {
                "level": "WARNING",
                "handlers": ["console"],
                "propagate": False,
            },
            "nats": {
                "level": "WARNING",
                "handlers": ["console"],
                "propagate": False,
            },
        },
    }

    logging.config.dictConfig(logging_config)


def get_logger(name: str) -> logging.Logger:
    """
    Get a configured logger instance.

    Args:
        name: Logger name (usually __name__)

    Returns:
        Configured logger instance
    """
    return logging.getLogger(name)


def log_startup_event() -> None:
    """Log application startup information."""
    logger = get_logger("app.startup")
    logger.info("=" * 60)
    logger.info(f"Starting {settings.app_name}")
    logger.info(f"Environment: {settings.environment}")
    logger.info(f"Debug mode: {settings.debug}")
    logger.info(f"Log level: {get_log_level()}")
    logger.info("=" * 60)


def log_shutdown_event() -> None:
    """Log application shutdown information."""
    logger = get_logger("app.shutdown")
    logger.info("=" * 60)
    logger.info(f"Shutting down {settings.app_name}")
    logger.info("=" * 60)
