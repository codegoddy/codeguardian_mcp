"""
Unit tests for budget monitoring service.

Tests cover:
- Budget status calculation
- Alert level determination
- Usage percentage calculations
"""

from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


class TestBudgetMonitor:
    """Tests for BudgetMonitor service."""

    @pytest.fixture
    def mock_deliverable(self):
        """Create a mock deliverable for testing."""
        deliverable = MagicMock()
        deliverable.estimated_hours = 100
        deliverable.actual_hours = 50
        deliverable.commit_count = 5
        deliverable.budget_alert_threshold = 80
        deliverable.first_commit_at = datetime(2024, 1, 1, tzinfo=timezone.utc)
        deliverable.last_commit_at = datetime(2024, 1, 10, tzinfo=timezone.utc)
        return deliverable

    @pytest.mark.asyncio
    async def test_check_budget_status_on_track(self, mock_deliverable):
        """Test budget status when under budget."""
        from app.services.budget_monitor import BudgetMonitor

        mock_deliverable.actual_hours = 50  # 50% used

        result = await BudgetMonitor().check_budget_status(mock_deliverable, MagicMock())

        assert result["status"] == "on_track"
        assert result["alert_level"] == "none"
        assert result["usage_percentage"] == 50.0
        assert result["hours_remaining"] == 50.0

    @pytest.mark.asyncio
    async def test_check_budget_status_warning(self, mock_deliverable):
        """Test budget status when approaching limit."""
        from app.services.budget_monitor import BudgetMonitor

        mock_deliverable.actual_hours = 85  # 85% used

        result = await BudgetMonitor().check_budget_status(mock_deliverable, MagicMock())

        assert result["status"] == "warning"
        assert result["alert_level"] == "medium"
        assert result["usage_percentage"] == 85.0

    @pytest.mark.asyncio
    async def test_check_budget_status_over_budget(self, mock_deliverable):
        """Test budget status when over budget."""
        from app.services.budget_monitor import BudgetMonitor

        mock_deliverable.actual_hours = 120  # 120% used

        result = await BudgetMonitor().check_budget_status(mock_deliverable, MagicMock())

        assert result["status"] == "over_budget"
        assert result["alert_level"] == "high"
        assert result["usage_percentage"] == 120.0

    @pytest.mark.asyncio
    async def test_check_budget_status_no_budget(self):
        """Test budget status when no budget is set."""
        from app.services.budget_monitor import BudgetMonitor

        mock_deliverable = MagicMock()
        mock_deliverable.estimated_hours = None

        result = await BudgetMonitor().check_budget_status(mock_deliverable, MagicMock())

        assert result["status"] == "no_budget"
        assert result["alert_level"] == "none"

    @pytest.mark.asyncio
    async def test_variance_calculation(self, mock_deliverable):
        """Test variance calculation."""
        from app.services.budget_monitor import BudgetMonitor

        mock_deliverable.estimated_hours = 100
        mock_deliverable.actual_hours = 110  # 10 hours over

        result = await BudgetMonitor().check_budget_status(mock_deliverable, MagicMock())

        assert result["variance"] == 10.0
        assert result["variance_percentage"] == 10.0

    @pytest.mark.asyncio
    async def test_hours_remaining_calculation(self, mock_deliverable):
        """Test hours remaining calculation."""
        from app.services.budget_monitor import BudgetMonitor

        mock_deliverable.estimated_hours = 100
        mock_deliverable.actual_hours = 30

        result = await BudgetMonitor().check_budget_status(mock_deliverable, MagicMock())

        assert result["hours_remaining"] == 70.0

    @pytest.mark.asyncio
    async def test_should_alert_threshold(self, mock_deliverable):
        """Test should_alert based on threshold."""
        from app.services.budget_monitor import BudgetMonitor

        mock_deliverable.budget_alert_threshold = 80
        mock_deliverable.actual_hours = 80  # Exactly at threshold

        result = await BudgetMonitor().check_budget_status(mock_deliverable, MagicMock())

        assert result["should_alert"] is True

    @pytest.mark.asyncio
    async def test_should_alert_below_threshold(self, mock_deliverable):
        """Test should_alert is False below threshold."""
        from app.services.budget_monitor import BudgetMonitor

        mock_deliverable.budget_alert_threshold = 80
        mock_deliverable.actual_hours = 70

        result = await BudgetMonitor().check_budget_status(mock_deliverable, MagicMock())

        assert result["should_alert"] is False

    @pytest.mark.asyncio
    async def test_metrics_included(self, mock_deliverable):
        """Test metrics are included in response."""
        from app.services.budget_monitor import BudgetMonitor

        mock_deliverable.actual_hours = 100
        mock_deliverable.commit_count = 10

        result = await BudgetMonitor().check_budget_status(mock_deliverable, MagicMock())

        assert "metrics" in result
        assert result["metrics"]["estimated_hours"] == 100
        assert result["metrics"]["actual_hours"] == 100


class TestBudgetMonitorEdgeCases:
    """Tests for edge cases in budget monitoring."""

    @pytest.mark.asyncio
    async def test_zero_commit_count(self):
        """Test handling when commit count is zero."""
        from app.services.budget_monitor import BudgetMonitor

        mock_deliverable = MagicMock()
        mock_deliverable.estimated_hours = 100
        mock_deliverable.actual_hours = 50
        mock_deliverable.commit_count = 0
        mock_deliverable.budget_alert_threshold = 80

        result = await BudgetMonitor().check_budget_status(mock_deliverable, MagicMock())

        assert result["metrics"]["avg_hours_per_commit"] == 0
        assert result["estimated_remaining_commits"] is None

    @pytest.mark.asyncio
    async def test_none_actual_hours(self):
        """Test handling when actual_hours is None."""
        from app.services.budget_monitor import BudgetMonitor

        mock_deliverable = MagicMock()
        mock_deliverable.estimated_hours = 100
        mock_deliverable.actual_hours = None
        mock_deliverable.commit_count = 0
        mock_deliverable.budget_alert_threshold = 80

        result = await BudgetMonitor().check_budget_status(mock_deliverable, MagicMock())

        assert result["usage_percentage"] == 0.0
        assert result["hours_remaining"] == 100.0
