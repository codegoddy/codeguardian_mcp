"""
Custom Pydantic Validators for DevHQ

This module provides reusable validators for common field types across all schemas.
Import and use these validators in your Pydantic models.
"""

import re
from datetime import datetime
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, HttpUrl, field_validator, model_validator


def validate_not_empty(value: str, field_name: str = "field") -> str:
    """Validate that a string is not empty after stripping whitespace."""
    if not value or not value.strip():
        raise ValueError(f"{field_name} cannot be empty")
    return value.strip()


def validate_min_length(value: str, min_length: int, field_name: str = "field") -> str:
    """Validate minimum string length."""
    if len(value) < min_length:
        raise ValueError(f"{field_name} must be at least {min_length} characters")
    return value


def validate_max_length(value: str, max_length: int, field_name: str = "field") -> str:
    """Validate maximum string length."""
    if len(value) > max_length:
        raise ValueError(f"{field_name} must be at most {max_length} characters")
    return value


def sanitize_html(value: str) -> str:
    """Basic HTML/script tag removal for XSS prevention."""
    if not value:
        return value
    # Remove script tags
    value = re.sub(r"<script[^>]*>.*?</script>", "", value, flags=re.IGNORECASE | re.DOTALL)
    # Remove event handlers
    value = re.sub(r"on\w+\s*=", "", value)
    # Remove javascript: protocol
    value = re.sub(r"javascript:", "", value, flags=re.IGNORECASE)
    # Remove data: URLs (potential XSS)
    value = re.sub(r"data:", "", value, flags=re.IGNORECASE)
    return value


class StringValidatorsMixin:
    """Mixin providing common string validation methods."""

    @staticmethod
    def validate_not_empty(value: str, field_name: str = "field") -> str:
        """Validate that a string is not empty after stripping whitespace."""
        return validate_not_empty(value, field_name)

    @staticmethod
    def validate_min_length(value: str, min_length: int, field_name: str = "field") -> str:
        """Validate minimum string length."""
        return validate_min_length(value, min_length, field_name)

    @staticmethod
    def validate_max_length(value: str, max_length: int, field_name: str = "field") -> str:
        """Validate maximum string length."""
        return validate_max_length(value, max_length, field_name)

    @staticmethod
    def sanitize_html(value: str) -> str:
        """Basic HTML/script tag removal for XSS prevention."""
        return sanitize_html(value)


def validate_password_strength(password: str) -> str:
    """
    Validate password meets minimum security requirements.

    Requirements:
    - At least 8 characters
    - At least one uppercase letter
    - At least one lowercase letter
    - At least one digit
    """
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters")

    if not re.search(r"[A-Z]", password):
        raise ValueError("Password must contain at least one uppercase letter")

    if not re.search(r"[a-z]", password):
        raise ValueError("Password must contain at least one lowercase letter")

    if not re.search(r"\d", password):
        raise ValueError("Password must contain at least one digit")

    return password


def validate_paystack_customer_code(code: Optional[str]) -> Optional[str]:
    """Validate Paystack customer code format (e.g., 'CUS_abc123xyz')."""
    if code is None:
        return None

    if not re.match(r"^CUS_[a-zA-Z0-9]+$", code):
        raise ValueError("Invalid Paystack customer code format")

    return code


def validate_paystack_subaccount_code(code: Optional[str]) -> Optional[str]:
    """Validate Paystack subaccount code format (e.g., 'ACCT_abc123xyz')."""
    if code is None:
        return None

    if not re.match(r"^ACCT_[a-zA-Z0-9]+$", code):
        raise ValueError("Invalid Paystack subaccount code format")

    return code


def validate_bank_code(bank_code: str) -> str:
    """Validate Nigerian bank code format (3-4 digits)."""
    if not re.match(r"^\d{3,4}$", bank_code):
        raise ValueError("Bank code must be 3-4 digits")
    return bank_code


def validate_account_number(account_number: str) -> str:
    """Validate Nigerian NUBAN account number (10 digits)."""
    if not re.match(r"^\d{10}$", account_number):
        raise ValueError("Account number must be exactly 10 digits")
    return account_number


def validate_invoice_number(invoice_number: str) -> str:
    """Validate invoice number format (e.g., 'INV-2024-001')."""
    if not re.match(r"^[A-Z]{2,4}-\d{4}-\d{3,6}$", invoice_number):
        raise ValueError("Invalid invoice number format (e.g., 'INV-2024-001')")
    return invoice_number


def validate_git_branch_name(branch_name: str) -> str:
    """Validate git branch name format."""
    # Git branch names cannot start with - or contain spaces
    if branch_name.startswith("-"):
        raise ValueError("Branch name cannot start with a hyphen")
    if " " in branch_name:
        raise ValueError("Branch name cannot contain spaces")
    # Allow alphanumeric, hyphens, underscores, slashes, and dots
    if not re.match(r"^[\w./-]+$", branch_name):
        raise ValueError("Branch name contains invalid characters")
    return branch_name


def validate_task_reference(task_ref: Optional[str]) -> Optional[str]:
    """Validate task reference format (e.g., 'DEVHQ-123')."""
    if task_ref is None:
        return None

    if not re.match(r"^[A-Z]+-\d+$", task_ref):
        raise ValueError("Invalid task reference format (e.g., 'DEVHQ-123')")
    return task_ref


def validate_repository_url(repo_url: str) -> str:
    """Validate repository URL format."""
    # Basic URL validation for common git providers
    valid_patterns = [
        r"^https://github\.com/[\w.-]+/[\w.-]+(/.*)?$",
        r"^https://gitlab\.com/[\w.-]+/[\w.-]+(/.*)?$",
        r"^https://bitbucket\.org/[\w.-]+/[\w.-]+(/.*)?$",
        r"^git@github\.com:[\w.-]+/[\w.-]+\.git$",
        r"^git@gitlab\.com:[\w.-]+/[\w.-]+\.git$",
    ]

    for pattern in valid_patterns:
        if re.match(pattern, repo_url):
            return repo_url

    raise ValueError("Invalid repository URL format")


def validate_http_url(url: Optional[str]) -> Optional[str]:
    """Validate HTTP/HTTPS URL format."""
    if url is None:
        return None

    # Basic URL validation
    if not re.match(r"^https?://", url, re.IGNORECASE):
        raise ValueError("URL must start with http:// or https://")

    # Check for valid domain format
    if not re.match(r"^https?://[a-zA-Z0-9][-a-zA-Z0-9]*(\.[a-zA-Z0-9][-a-zA-Z0-9]*)+", url):
        raise ValueError("Invalid URL format")

    return url


def validate_positive_number(value: float, field_name: str = "value") -> float:
    """Validate that a number is positive."""
    if value <= 0:
        raise ValueError(f"{field_name} must be positive")
    return value


def validate_non_negative_number(value: float, field_name: str = "value") -> float:
    """Validate that a number is non-negative."""
    if value < 0:
        raise ValueError(f"{field_name} cannot be negative")
    return value


def validate_percentage(value: float) -> float:
    """Validate percentage value (0-100)."""
    if not 0 <= value <= 100:
        raise ValueError("Percentage must be between 0 and 100")
    return value


def validate_currency_code(currency: str) -> str:
    """Validate ISO 4217 currency code (3 letters)."""
    if len(currency) != 3:
        raise ValueError("Currency code must be exactly 3 characters")
    if not currency.isalpha():
        raise ValueError("Currency code must contain only letters")
    return currency.upper()


def validate_time_format(time_format: str) -> str:
    """Validate time format string ('12h' or '24h')."""
    if time_format not in ["12h", "24h"]:
        raise ValueError("Time format must be '12h' or '24h'")
    return time_format


def validate_oauth_provider(provider: str) -> str:
    """Validate OAuth provider name."""
    valid_providers = ["google", "github", "gitlab", "bitbucket"]
    if provider.lower() not in valid_providers:
        raise ValueError(f"Invalid OAuth provider. Must be one of: {', '.join(valid_providers)}")
    return provider.lower()


def validate_payment_method(payment_method: str) -> str:
    """Validate payment method."""
    valid_methods = ["paystack", "manual"]
    if payment_method not in valid_methods:
        raise ValueError(f"Invalid payment method. Must be one of: {', '.join(valid_methods)}")
    return payment_method


def validate_project_status(status: str) -> str:
    """Validate project status."""
    valid_statuses = ["active", "paused", "completed", "cancelled", "archived"]
    if status not in valid_statuses:
        raise ValueError(f"Invalid project status. Must be one of: {', '.join(valid_statuses)}")
    return status


def validate_deliverable_status(status: str) -> str:
    """Validate deliverable status."""
    valid_statuses = ["pending", "in_progress", "review", "completed", "cancelled"]
    if status not in valid_statuses:
        raise ValueError(f"Invalid deliverable status. Must be one of: {', '.join(valid_statuses)}")
    return status


def validate_change_request_status(status: str) -> str:
    """Validate change request status."""
    valid_statuses = ["pending", "approved", "rejected", "completed", "cancelled"]
    if status not in valid_statuses:
        raise ValueError(f"Invalid CR status. Must be one of: {', '.join(valid_statuses)}")
    return status


def validate_subscription_status(status: str) -> str:
    """Validate subscription status."""
    valid_statuses = ["active", "past_due", "cancelled", "expired", "trialing"]
    if status not in valid_statuses:
        raise ValueError(f"Invalid subscription status. Must be one of: {', '.join(valid_statuses)}")
    return status


def validate_billing_period(period: str) -> str:
    """Validate billing period."""
    valid_periods = ["monthly", "quarterly", "yearly"]
    if period not in valid_periods:
        raise ValueError(f"Invalid billing period. Must be one of: {', '.join(valid_periods)}")
    return period


def validate_subscription_plan(plan: str) -> str:
    """Validate subscription plan."""
    valid_plans = ["free", "starter", "professional", "enterprise"]
    if plan not in valid_plans:
        raise ValueError(f"Invalid subscription plan. Must be one of: {', '.join(valid_plans)}")
    return plan


def validate_time_tracker_provider(provider: str) -> str:
    """Validate time tracker provider."""
    valid_providers = ["toggl", "harvest", "manual"]
    if provider not in valid_providers:
        raise ValueError(f"Invalid time tracker provider. Must be one of: {', '.join(valid_providers)}")
    return provider


# Common field configurations
def name_field(min_length: int = 1, max_length: int = 200) -> Field:
    """Create a standardized name field with validation."""
    return Field(
        ...,
        min_length=min_length,
        max_length=max_length,
        description="Name of the entity",
    )


def description_field(max_length: int = 2000) -> Field:
    """Create a standardized description field with validation."""
    return Field(default=None, max_length=max_length, description="Description of the entity")


def title_field(max_length: int = 255) -> Field:
    """Create a standardized title field with validation."""
    return Field(..., min_length=1, max_length=max_length, description="Title of the entity")


def amount_field(min_value: float = 0) -> Field:
    """Create a standardized amount field with validation."""
    return Field(..., ge=min_value, description="Monetary amount", decimal_places=2)


# Re-export for convenience
__all__ = [
    # String validation functions
    "validate_not_empty",
    "validate_min_length",
    "validate_max_length",
    "sanitize_html",
    # Validation functions
    "validate_password_strength",
    "validate_paystack_customer_code",
    "validate_paystack_subaccount_code",
    "validate_bank_code",
    "validate_account_number",
    "validate_invoice_number",
    "validate_git_branch_name",
    "validate_task_reference",
    "validate_repository_url",
    "validate_http_url",
    "validate_positive_number",
    "validate_non_negative_number",
    "validate_percentage",
    "validate_currency_code",
    "validate_time_format",
    "validate_oauth_provider",
    "validate_payment_method",
    "validate_project_status",
    "validate_deliverable_status",
    "validate_change_request_status",
    "validate_subscription_status",
    "validate_billing_period",
    "validate_subscription_plan",
    "validate_time_tracker_provider",
    # Helper mixin
    "StringValidatorsMixin",
    # Field factories
    "name_field",
    "description_field",
    "title_field",
    "amount_field",
]
