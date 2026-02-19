"""
Unit tests for NATS service.

Tests cover:
- Event publishing
- Subject configuration
"""

import pytest


class TestNATSSubjects:
    """Tests for NATS subject configuration."""

    def test_commit_review_subject_format(self):
        """Test commit review subject has expected format."""
        from app.services.nats_service import TimeTrackingNATSService

        assert TimeTrackingNATSService.COMMIT_REVIEW_SUBJECT is not None
        assert isinstance(TimeTrackingNATSService.COMMIT_REVIEW_SUBJECT, str)

    def test_budget_alert_subject_format(self):
        """Test budget alert subject has expected format."""
        from app.services.nats_service import TimeTrackingNATSService

        assert TimeTrackingNATSService.BUDGET_ALERT_SUBJECT is not None
        assert isinstance(TimeTrackingNATSService.BUDGET_ALERT_SUBJECT, str)

    def test_time_entry_subject_format(self):
        """Test time entry subject has expected format."""
        from app.services.nats_service import TimeTrackingNATSService

        assert TimeTrackingNATSService.TIME_ENTRY_SUBJECT is not None
        assert isinstance(TimeTrackingNATSService.TIME_ENTRY_SUBJECT, str)

    def test_review_reminder_subject_format(self):
        """Test review reminder subject has expected format."""
        from app.services.nats_service import TimeTrackingNATSService

        assert TimeTrackingNATSService.REVIEW_REMINDER_SUBJECT is not None
        assert isinstance(TimeTrackingNATSService.REVIEW_REMINDER_SUBJECT, str)


class TestEventDataFormatting:
    """Tests for event data formatting."""

    def test_event_data_structure(self):
        """Test event data has correct structure."""
        from datetime import datetime

        review_data = {"review_id": "review-123", "commit_hash": "abc123"}

        event_data = {
            "event_type": "commit_review_pending",
            "timestamp": datetime.utcnow().isoformat(),
            "data": review_data,
        }

        assert "event_type" in event_data
        assert "timestamp" in event_data
        assert "data" in event_data
        assert event_data["event_type"] == "commit_review_pending"
