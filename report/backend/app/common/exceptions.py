"""
Standardized exception hierarchy for DevHQ API

This module provides a consistent, structured approach to error handling across
the entire application. All exceptions follow a hierarchical pattern with
standardized error codes, messages, and HTTP status codes.

Exception Hierarchy:
    AppException (base)
    ├── ValidationException
    ├── AuthenticationException
    ├── AuthorizationException
    ├── NotFoundException
    ├── RateLimitException
    ├── BusinessLogicException
    │   ├── InsufficientFundsException
    │   ├── ContractNotSignedException
    │   └── ...
    └── ExternalServiceException
        ├── PaymentGatewayException
        ├── GitProviderException
        ├── CloudStorageException
        └── MessagingException

Usage:
    raise ValidationException("Invalid email format", details={"field": "email"})

    try:
        await process_payment(amount)
    except ExternalServiceException as e:
        logger.error("Payment failed: %s", e)
        raise

Response Format:
    {
        "success": false,
        "error": {
            "code": "VALIDATION_ERROR",
            "message": "Invalid email format",
            "details": {"field": "email"}
        }
    }
"""

from typing import Any, Dict, Optional
from uuid import UUID

from fastapi import status

from .errors import (
    AutoPauseActiveError,
    CloudinaryError,
    ContractNotSignedError,
    DeliverableNotApprovedError,
    ForbiddenError,
    GitAPIError,
    InsufficientFundsError,
    InternalError,
    MaxRevisionsExceededError,
    NATSError,
    NotFoundError,
    PaymentGatewayError,
    ScopeNotConfiguredError,
    SubscriptionRequiredError,
    TSFAError,
    UnauthorizedError,
    ValidationError,
)


# Base exception - provides aliases for TSFAError
class AppException(TSFAError):
    """Base exception for DevHQ application.

    All custom exceptions should inherit from this class or its subclasses.
    Provides standardized error code, message, status code, and details.
    """

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = status.HTTP_400_BAD_REQUEST,
        details: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(code, message, status_code, details)


# Client-side errors (4xx)
class ValidationException(ValidationError):
    """Raised when input validation fails.

    Use for Pydantic validation errors, business logic validation,
    or any client-provided data that doesn't meet requirements.

    Status: 400 Bad Request
    Code: VALIDATION_ERROR
    """

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(message, details)


class AuthenticationException(UnauthorizedError):
    """Raised when authentication is required or fails.

    Use when the user is not authenticated or provided invalid credentials.

    Status: 401 Unauthorized
    Code: AUTHENTICATION_ERROR
    """

    def __init__(self, message: str = "Authentication required"):
        super().__init__(message)


class AuthorizationException(ForbiddenError):
    """Raised when user lacks permission for the action.

    Use when the user is authenticated but doesn't have permission
    to perform the requested action.

    Status: 403 Forbidden
    Code: AUTHORIZATION_ERROR
    """

    def __init__(self, message: str = "Insufficient permissions"):
        super().__init__(message)


class NotFoundException(NotFoundError):
    """Raised when a requested resource is not found.

    Use when trying to access a resource that doesn't exist.

    Status: 404 Not Found
    Code: NOT_FOUND
    """

    def __init__(self, resource: str, resource_id: Optional[Any] = None):
        super().__init__(resource, resource_id)


class RateLimitException(AppException):
    """Raised when rate limit is exceeded.

    Use when the client has made too many requests in a given time period.

    Status: 429 Too Many Requests
    Code: RATE_LIMIT_EXCEEDED
    """

    def __init__(
        self,
        message: str = "Rate limit exceeded. Please try again later.",
        retry_after: Optional[int] = None,
        details: Optional[Dict[str, Any]] = None,
    ):
        error_details = details or {}
        if retry_after is not None:
            error_details["retry_after"] = retry_after

        super().__init__(
            code="RATE_LIMIT_EXCEEDED",
            message=message,
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            details=error_details,
        )


class BusinessLogicException(AppException):
    """Base exception for business logic violations.

    Use as base for domain-specific business rule violations.
    Subclasses should define specific error codes and messages.

    Status: 422 Unprocessable Entity
    Code: BUSINESS_LOGIC_ERROR
    """

    def __init__(self, code: str, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            code=code,
            message=message,
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            details=details,
        )


class InsufficientFundsException(InsufficientFundsError):
    """Raised when project budget is insufficient.

    Use when a project doesn't have enough funds for an operation.

    Status: 422 Unprocessable Entity
    Code: INSUFFICIENT_FUNDS
    """

    def __init__(self, project_id: UUID, balance: float, required: float):
        super().__init__(project_id, balance, required)


class ContractNotSignedException(ContractNotSignedError):
    """Raised when contract signature is required.

    Use when an operation requires a signed contract.

    Status: 422 Unprocessable Entity
    Code: CONTRACT_NOT_SIGNED
    """

    def __init__(self, project_id: UUID):
        super().__init__(project_id)


class ScopeNotConfiguredException(ScopeNotConfiguredError):
    """Raised when project scope is not configured.

    Use when an operation requires a configured project scope.

    Status: 422 Unprocessable Entity
    Code: SCOPE_NOT_CONFIGURED
    """

    def __init__(self, project_id: UUID):
        super().__init__(project_id)


class DeliverableNotApprovedException(DeliverableNotApprovedError):
    """Raised when deliverable approval is required.

    Use when trying to track time on an unapproved deliverable.

    Status: 422 Unprocessable Entity
    Code: DELIVERABLE_NOT_APPROVED
    """

    def __init__(self, deliverable_id: UUID):
        super().__init__(deliverable_id)


class AutoPauseActiveException(AutoPauseActiveError):
    """Raised when project is paused.

    Use when trying to perform operations on a paused project.

    Status: 422 Unprocessable Entity
    Code: AUTO_PAUSE_ACTIVE
    """

    def __init__(self, project_id: UUID):
        super().__init__(project_id)


class MaxRevisionsExceededException(MaxRevisionsExceededError):
    """Raised when revision limit is exceeded.

    Use when maximum revisions for a deliverable are reached.

    Status: 422 Unprocessable Entity
    Code: MAX_REVISIONS_EXCEEDED
    """

    def __init__(self, project_id: UUID, max_revisions: int):
        super().__init__(project_id, max_revisions)


class SubscriptionRequiredException(SubscriptionRequiredError):
    """Raised when feature requires active subscription.

    Use when accessing premium features without subscription.

    Status: 402 Payment Required
    Code: SUBSCRIPTION_REQUIRED
    """

    def __init__(self, feature: str):
        super().__init__(feature)


# Server-side errors (5xx)
class InternalException(InternalError):
    """Raised for unexpected server errors.

    Use as catch-all for unexpected errors. Prefer more specific
    exceptions when possible.

    Status: 500 Internal Server Error
    Code: INTERNAL_ERROR
    """

    def __init__(self, message: str = "An unexpected error occurred"):
        super().__init__(message)


class ExternalServiceException(AppException):
    """Base exception for external service failures.

    Use as base for exceptions related to external services
    (payment gateways, git providers, cloud storage, etc.).

    Status: 502 Bad Gateway
    Code: EXTERNAL_SERVICE_ERROR
    """

    def __init__(self, service: str, message: str, details: Optional[Dict[str, Any]] = None):
        error_details = details or {"service": service}
        super().__init__(
            code="EXTERNAL_SERVICE_ERROR",
            message=f"{service} service error: {message}",
            status_code=status.HTTP_502_BAD_GATEWAY,
            details=error_details,
        )


class PaymentGatewayException(PaymentGatewayError):
    """Raised when payment processing fails.

    Use for Paystack or other payment gateway errors.

    Status: 502 Bad Gateway
    Code: PAYMENT_GATEWAY_ERROR
    """

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(message, details)


class GitProviderException(GitAPIError):
    """Raised when git provider API call fails.

    Use for GitHub, GitLab, or Bitbucket API errors.

    Status: 502 Bad Gateway
    Code: GIT_PROVIDER_ERROR
    """

    def __init__(self, provider: str, message: str):
        super().__init__(provider, message)


class CloudStorageException(CloudinaryError):
    """Raised when cloud storage operations fail.

    Use for Cloudinary upload/delete errors.

    Status: 502 Bad Gateway
    Code: CLOUD_STORAGE_ERROR
    """

    def __init__(self, message: str):
        super().__init__(message)


class MessagingException(NATSError):
    """Raised when messaging system operations fail.

    Use for NATS messaging errors.

    Status: 503 Service Unavailable
    Code: MESSAGING_ERROR
    """

    def __init__(self, message: str):
        super().__init__(message)


# Exception utility functions
def wrap_external_error(
    service: str, exception: Exception, fallback_message: Optional[str] = None
) -> ExternalServiceException:
    """Wrap an external exception into an ExternalServiceException.

    Args:
        service: Name of the external service
        exception: Original exception to wrap
        fallback_message: Optional custom message (defaults to service name)

    Returns:
        ExternalServiceException with original error details
    """
    original_message = str(exception)
    if fallback_message:
        message = f"{fallback_message}: {original_message}"
    else:
        message = original_message

    return ExternalServiceException(
        service=service,
        message=message,
        details={"original_error": original_message, "wrapped": True},
    )


# Re-export for convenience
__all__ = [
    # Base
    "AppException",
    "TSFAError",
    # Client errors (4xx)
    "ValidationException",
    "AuthenticationException",
    "AuthorizationException",
    "NotFoundException",
    "RateLimitException",
    # Business logic errors (4xx)
    "BusinessLogicException",
    "InsufficientFundsException",
    "ContractNotSignedException",
    "ScopeNotConfiguredException",
    "DeliverableNotApprovedException",
    "AutoPauseActiveException",
    "MaxRevisionsExceededException",
    "SubscriptionRequiredException",
    # Server errors (5xx)
    "InternalException",
    "ExternalServiceException",
    "PaymentGatewayException",
    "GitProviderException",
    "CloudStorageException",
    "MessagingException",
    # Utilities
    "wrap_external_error",
]
