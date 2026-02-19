"""
Unit tests for email templates.

Tests cover:
- Template rendering
"""

import pytest


class TestEmailTemplateRendering:
    """Tests for email template rendering."""

    def test_render_otp_email(self):
        """Test OTP email template rendering."""
        from app.utils.email_templates import render_otp_email

        result = render_otp_email(otp="123456", app_name="DevHQ")

        assert result is not None
        assert isinstance(result, str)
        assert "123456" in result

    def test_render_welcome_email(self):
        """Test welcome email template rendering."""
        from app.utils.email_templates import render_welcome_email

        result = render_welcome_email(username="newuser", app_name="DevHQ")

        assert result is not None
        assert isinstance(result, str)
        assert "newuser" in result

    def test_render_password_reset_email(self):
        """Test password reset email template rendering."""
        from app.utils.email_templates import render_password_reset_email

        result = render_password_reset_email(otp="654321", app_name="DevHQ")

        assert result is not None
        assert isinstance(result, str)
        assert "654321" in result


class TestTemplateContent:
    """Tests for template content structure."""

    def test_all_templates_return_html(self):
        """Test all templates return HTML content."""
        from app.utils.email_templates import render_otp_email, render_welcome_email

        result1 = render_otp_email(otp="123456", app_name="Test")
        assert result1 is not None
        assert isinstance(result1, str)
        assert "<" in result1 and ">" in result1

        result2 = render_welcome_email(username="user", app_name="Test")
        assert result2 is not None
        assert isinstance(result2, str)
        assert "<" in result2 and ">" in result2
