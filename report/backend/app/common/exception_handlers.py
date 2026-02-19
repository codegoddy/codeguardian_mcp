"""
FastAPI exception handlers for TSFA errors
"""

from fastapi import Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.core.logging_config import get_logger

from .errors import TSFAError
from .responses import error_response

logger = get_logger(__name__)


def add_cors_headers(response: JSONResponse, origin: str = None) -> JSONResponse:
    """Add CORS headers to response for proper error handling across origins"""
    # Import settings here to avoid circular import
    from app.core.config import settings

    # Determine the allowed origin
    allowed_origins = settings.cors_origins

    if origin and origin in allowed_origins:
        response.headers["Access-Control-Allow-Origin"] = origin
    elif allowed_origins:
        # Default to the first allowed origin (usually production domain)
        response.headers["Access-Control-Allow-Origin"] = allowed_origins[0]
    else:
        response.headers["Access-Control-Allow-Origin"] = "*"

    response.headers["Access-Control-Allow-Credentials"] = "true"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Refresh-Token, X-CSRF-Token"
    response.headers["Access-Control-Expose-Headers"] = "x-new-access-token, x-new-refresh-token, X-CSRF-Token"

    return response


async def tsfa_error_handler(request: Request, exc: TSFAError) -> JSONResponse:
    """Handle TSFA custom errors"""
    origin = request.headers.get("origin")

    # Log the error with full context for debugging
    logger.error(
        "TSFA Error - Path: %s, Method: %s, Code: %s, Message: %s",
        request.url.path,
        request.method,
        exc.code,
        exc.message,
        exc_info=True,
    )

    response = JSONResponse(
        status_code=exc.status_code,
        content=error_response(code=exc.code, message=exc.message, details=exc.details),
    )
    return add_cors_headers(response, origin)


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Handle Pydantic validation errors"""
    errors = []
    for error in exc.errors():
        field = ".".join(str(loc) for loc in error["loc"])
        errors.append({"field": field, "message": error["msg"], "type": error["type"]})

    # Log validation errors for debugging
    logger.warning(
        "VALIDATION ERROR - Path: %s, Method: %s, Errors: %s",
        request.url.path,
        request.method,
        errors,
    )

    origin = request.headers.get("origin")
    response = JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content=error_response(
            code="VALIDATION_ERROR",
            message="Validation error",
            details={"errors": errors},
        ),
    )
    return add_cors_headers(response, origin)


async def sqlalchemy_error_handler(request: Request, exc: SQLAlchemyError) -> JSONResponse:
    """Handle SQLAlchemy database errors"""
    # Log the full error for debugging
    logger.error(
        "DATABASE ERROR - Path: %s, Method: %s, Error: %s",
        request.url.path,
        request.method,
        str(exc),
        exc_info=True,
    )

    origin = request.headers.get("origin")
    # Return generic error to client (don't expose database details)
    response = JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=error_response(
            code="DATABASE_ERROR",
            message="A database error occurred. Please try again later.",
        ),
    )
    return add_cors_headers(response, origin)


async def general_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handle all other unhandled exceptions"""
    # Log the full error for debugging with request context
    logger.error(
        "UNHANDLED EXCEPTION - Path: %s, Method: %s, Type: %s, Error: %s",
        request.url.path,
        request.method,
        type(exc).__name__,
        str(exc),
        exc_info=True,
    )

    origin = request.headers.get("origin")
    # Return generic error to client
    response = JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=error_response(
            code="INTERNAL_ERROR",
            message="An unexpected error occurred. Please try again later.",
        ),
    )
    return add_cors_headers(response, origin)


def register_exception_handlers(app):
    """Register all exception handlers with FastAPI app"""
    app.add_exception_handler(TSFAError, tsfa_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(SQLAlchemyError, sqlalchemy_error_handler)
    app.add_exception_handler(Exception, general_exception_handler)
