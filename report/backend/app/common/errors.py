"""
TSFA-specific error codes and custom exceptions
"""

from typing import Any, Dict, Optional
from uuid import UUID

from fastapi import HTTPException, status


class TSFAError(Exception):
    """Base exception for TSFA system"""

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = status.HTTP_400_BAD_REQUEST,
        details: Optional[Dict[str, Any]] = None,
    ):
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}
        super().__init__(self.message)


# Client Errors (400-499)
class ValidationError(TSFAError):
    """Validation error"""

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            code="INVALID_INPUT",
            message=message,
            status_code=status.HTTP_400_BAD_REQUEST,
            details=details,
        )


class UnauthorizedError(TSFAError):
    """Authentication required"""

    def __init__(self, message: str = "Authentication required"):
        super().__init__(
            code="UNAUTHORIZED",
            message=message,
            status_code=status.HTTP_401_UNAUTHORIZED,
        )


class ForbiddenError(TSFAError):
    """Insufficient permissions"""

    def __init__(self, message: str = "Insufficient permissions"):
        super().__init__(code="FORBIDDEN", message=message, status_code=status.HTTP_403_FORBIDDEN)


class NotFoundError(TSFAError):
    """Resource not found"""

    def __init__(self, resource: str, resource_id: Optional[Any] = None):
        message = f"{resource} not found"
        if resource_id:
            message = f"{resource} with id {resource_id} not found"
        super().__init__(code="NOT_FOUND", message=message, status_code=status.HTTP_404_NOT_FOUND)


class ScopeNotConfiguredError(TSFAError):
    """Project scope guardrail not set up"""

    def __init__(self, project_id: UUID):
        super().__init__(
            code="SCOPE_NOT_CONFIGURED",
            message=f"Scope guardrail not configured for project {project_id}",
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            details={"project_id": project_id},
        )


class InsufficientFundsError(TSFAError):
    """Retainer balance too low"""

    def __init__(self, project_id: UUID, balance: float, required: float):
        super().__init__(
            code="INSUFFICIENT_FUNDS",
            message=f"Insufficient funds in project budget. Balance: {balance}, Required: {required}",
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            details={
                "project_id": project_id,
                "balance": balance,
                "required": required,
            },
        )


class AutoPauseActiveError(TSFAError):
    """Project is paused due to depleted funds"""

    def __init__(self, project_id: UUID):
        super().__init__(
            code="AUTO_PAUSE_ACTIVE",
            message=f"Project {project_id} is paused due to depleted funds. Please replenish budget to continue.",
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            details={"project_id": project_id},
        )


class ContractNotSignedError(TSFAError):
    """Scope contract not signed by client"""

    def __init__(self, project_id: UUID):
        super().__init__(
            code="CONTRACT_NOT_SIGNED",
            message=f"Contract for project {project_id} has not been signed by the client",
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            details={"project_id": project_id},
        )


class DeliverableNotApprovedError(TSFAError):
    """Cannot track time to unapproved deliverable"""

    def __init__(self, deliverable_id: UUID):
        super().__init__(
            code="DELIVERABLE_NOT_APPROVED",
            message=f"Deliverable {deliverable_id} is not approved for time tracking",
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            details={"deliverable_id": deliverable_id},
        )


class MaxRevisionsExceededError(TSFAError):
    """Revision limit reached"""

    def __init__(self, project_id: UUID, max_revisions: int):
        super().__init__(
            code="MAX_REVISIONS_EXCEEDED",
            message=f"Maximum revision limit ({max_revisions}) reached for project {project_id}",
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            details={"project_id": project_id, "max_revisions": max_revisions},
        )


class SubscriptionRequiredError(TSFAError):
    """Feature requires active subscription"""

    def __init__(self, feature: str):
        super().__init__(
            code="SUBSCRIPTION_REQUIRED",
            message=f"Feature '{feature}' requires an active subscription",
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            details={"feature": feature},
        )


# Server Errors (500-599)
class InternalError(TSFAError):
    """Unexpected server error"""

    def __init__(self, message: str = "An unexpected error occurred"):
        super().__init__(
            code="INTERNAL_ERROR",
            message=message,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


class PaymentGatewayError(TSFAError):
    """Payment processing failed"""

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            code="PAYMENT_GATEWAY_ERROR",
            message=f"Payment processing failed: {message}",
            status_code=status.HTTP_502_BAD_GATEWAY,
            details=details,
        )


class GitAPIError(TSFAError):
    """Git provider API error"""

    def __init__(self, provider: str, message: str):
        super().__init__(
            code="GIT_API_ERROR",
            message=f"Git provider ({provider}) API error: {message}",
            status_code=status.HTTP_502_BAD_GATEWAY,
            details={"provider": provider},
        )


class NATSError(TSFAError):
    """Messaging system error"""

    def __init__(self, message: str):
        super().__init__(
            code="NATS_ERROR",
            message=f"Messaging system error: {message}",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        )


class CloudinaryError(TSFAError):
    """Cloudinary upload/delete error"""

    def __init__(self, message: str):
        super().__init__(
            code="CLOUDINARY_ERROR",
            message=f"Cloudinary error: {message}",
            status_code=status.HTTP_502_BAD_GATEWAY,
        )


class StorageError(TSFAError):
    """Storage (Supabase) upload/delete error"""

    def __init__(self, message: str):
        super().__init__(
            code="STORAGE_ERROR",
            message=f"Storage error: {message}",
            status_code=status.HTTP_502_BAD_GATEWAY,
        )


# Error code constants for easy reference
class ErrorCodes:
    # Client errors
    INVALID_INPUT = "INVALID_INPUT"
    UNAUTHORIZED = "UNAUTHORIZED"
    FORBIDDEN = "FORBIDDEN"
    NOT_FOUND = "NOT_FOUND"
    SCOPE_NOT_CONFIGURED = "SCOPE_NOT_CONFIGURED"
    INSUFFICIENT_FUNDS = "INSUFFICIENT_FUNDS"
    AUTO_PAUSE_ACTIVE = "AUTO_PAUSE_ACTIVE"
    CONTRACT_NOT_SIGNED = "CONTRACT_NOT_SIGNED"
    DELIVERABLE_NOT_APPROVED = "DELIVERABLE_NOT_APPROVED"
    MAX_REVISIONS_EXCEEDED = "MAX_REVISIONS_EXCEEDED"
    SUBSCRIPTION_REQUIRED = "SUBSCRIPTION_REQUIRED"

    # Server errors
    INTERNAL_ERROR = "INTERNAL_ERROR"
    PAYMENT_GATEWAY_ERROR = "PAYMENT_GATEWAY_ERROR"
    GIT_API_ERROR = "GIT_API_ERROR"
    NATS_ERROR = "NATS_ERROR"
    CLOUDINARY_ERROR = "CLOUDINARY_ERROR"
    STORAGE_ERROR = "STORAGE_ERROR"
