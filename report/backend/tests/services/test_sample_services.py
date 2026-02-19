"""
Sample service layer tests.

These tests demonstrate how to test business logic
in the service layer in isolation.
"""

import pytest


class TestAuthService:
    """Tests for authentication service."""

    @pytest.mark.unit
    def test_password_hashing(self):
        """Test password hashing and verification."""
        from app.core.auth import get_password_hash, verify_password

        password = "TestPassword123!"
        hashed = get_password_hash(password)

        assert hashed != password
        assert verify_password(password, hashed) is True
        assert verify_password("WrongPassword", hashed) is False

    @pytest.mark.unit
    def test_create_access_token(self):
        """Test JWT token creation."""
        from datetime import timedelta

        from app.core.auth import create_access_token

        data = {"sub": "test@example.com"}
        token = create_access_token(data=data, expires_delta=timedelta(minutes=30))

        assert token is not None
        assert isinstance(token, str)
        assert len(token) > 0


class TestValidation:
    """Tests for validation utilities."""

    @pytest.mark.unit
    def test_email_validation_regex(self):
        """Test email format validation using regex."""
        import re

        email_pattern = r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$"

        assert re.match(email_pattern, "test@example.com") is not None
        assert re.match(email_pattern, "invalid") is None


class TestBudgetCalculation:
    """Tests for budget calculations."""

    @pytest.mark.unit
    def test_budget_percentage(self):
        """Test budget percentage calculation."""
        from decimal import Decimal

        budget = Decimal("10000.00")
        spent = Decimal("2500.00")

        percentage = (spent / budget) * 100

        assert percentage == Decimal("25.00")

    @pytest.mark.unit
    def test_remaining_budget(self):
        """Test remaining budget calculation."""
        from decimal import Decimal

        total = Decimal("10000.00")
        spent = Decimal("3000.00")

        remaining = total - spent

        assert remaining == Decimal("7000.00")
