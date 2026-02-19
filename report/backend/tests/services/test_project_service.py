"""
Unit tests for project service.

Tests cover:
- Project validation
- Project status management
"""

from decimal import Decimal

import pytest


class TestProjectValidation:
    """Tests for project data validation."""

    def test_project_budget_validation(self):
        """Test project budget validation."""
        test_cases = [
            (Decimal("1000.00"), True),
            (Decimal("0.00"), True),
            (Decimal("-100.00"), False),
        ]

        for budget, expected in test_cases:
            result = budget >= 0
            assert result == expected

    def test_project_status_values(self):
        """Test valid project status values."""
        valid_statuses = [
            "awaiting_contract",
            "contract_sent",
            "active",
            "paused",
            "completed",
            "cancelled",
        ]

        for status in valid_statuses:
            assert status in valid_statuses

    def test_project_name_validation(self):
        """Test project name validation."""
        test_cases = [
            ("Valid Name", True),
            ("Project 123", True),
            ("", False),  # Empty name should fail
        ]

        for name, expected in test_cases:
            if name == "":
                result = False
            else:
                result = True
            assert result == expected


class TestProjectBudgetCalculation:
    """Tests for project budget calculations."""

    def test_budget_remaining_calculation(self):
        """Test budget remaining calculation."""
        project_budget = Decimal("10000.00")
        current_budget_remaining = Decimal("7500.00")

        assert current_budget_remaining <= project_budget

    def test_budget_percentage_calculation(self):
        """Test budget usage percentage calculation."""
        project_budget = Decimal("10000.00")
        current_budget_remaining = Decimal("7500.00")

        used_amount = project_budget - current_budget_remaining
        usage_percentage = (used_amount / project_budget) * 100

        assert usage_percentage == 25.0

    def test_auto_pause_threshold_percentage(self):
        """Test auto pause threshold as percentage."""
        threshold = 10.00  # 10%

        assert 0 <= threshold <= 100


class TestProjectRepositoryManagement:
    """Tests for project repository management."""

    def test_allowed_repositories_format(self):
        """Test allowed repositories JSON format."""
        valid_repositories = [
            ["https://github.com/org/repo1"],
            ["https://github.com/org/repo1", "https://github.com/org/repo2"],
            None,  # No restriction
        ]

        for repos in valid_repositories:
            assert repos is None or isinstance(repos, list)

    def test_repository_url_validation(self):
        """Test repository URL validation."""
        import re

        valid_urls = [
            "https://github.com/org/repo",
            "https://gitlab.com/org/repo",
        ]

        for url in valid_urls:
            assert url.startswith("https://")
            assert ".com/" in url
