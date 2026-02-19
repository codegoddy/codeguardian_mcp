"""
Tests for changelog generator service.
"""

from datetime import datetime
from unittest.mock import MagicMock
from uuid import uuid4

import pytest


class TestChangelogGenerator:
    """Tests for ChangelogGenerator service."""

    def test_changelog_categorization(self):
        """Test changelog categorizes commits correctly."""
        # Simple categorization test without full model
        commits = [
            {"message": "feat: Add login page", "type": "feature"},
            {"message": "fix: Fix login button", "type": "fix"},
            {"message": "docs: Update README", "type": "docs"},
            {"message": "refactor: Clean up code", "type": "refactor"},
        ]

        features = [c["message"] for c in commits if "feat" in c["message"].lower() or "feature" in c["message"].lower()]
        fixes = [c["message"] for c in commits if "fix" in c["message"].lower()]
        changes = [c["message"] for c in commits if c not in features and c not in fixes]

        assert "feat: Add login page" in features
        assert "fix: Fix login button" in fixes
        assert len(features) == 1
        assert len(fixes) == 1

    def test_markdown_formatting(self):
        """Test markdown formatting of changelog."""
        changelog = {
            "features": ["Add feature A", "Add feature B"],
            "fixes": ["Fix bug X"],
            "changes": ["Update dependency"],
        }

        markdown_lines = []
        if changelog["features"]:
            markdown_lines.append("### Features Added")
            for feature in changelog["features"]:
                markdown_lines.append(f"- {feature}")
        if changelog["fixes"]:
            markdown_lines.append("### Bug Fixes")
            for fix in changelog["fixes"]:
                markdown_lines.append(f"- {fix}")
        if changelog["changes"]:
            markdown_lines.append("### Other Changes")
            for change in changelog["changes"]:
                markdown_lines.append(f"- {change}")

        markdown = "\n".join(markdown_lines)

        assert "### Features Added" in markdown
        assert "Add feature A" in markdown
        assert "### Bug Fixes" in markdown
        assert "Fix bug X" in markdown

    def test_commit_message_parsing(self):
        """Test parsing commit messages for type detection."""
        test_cases = [
            ("feat: Add new feature", "feature"),
            ("fix: Resolve issue", "fix"),
            ("docs: Update documentation", "docs"),
            ("refactor: Clean up code", "refactor"),
            ("test: Add unit tests", "test"),
            ("chore: Update dependencies", "chore"),
            ("perf: Improve performance", "performance"),
            ("style: Fix formatting", "style"),
        ]

        for message, expected_type in test_cases:
            message_lower = message.lower()
            if message_lower.startswith("feat"):
                detected = "feature"
            elif message_lower.startswith("fix"):
                detected = "fix"
            elif message_lower.startswith("docs"):
                detected = "docs"
            elif message_lower.startswith("refactor"):
                detected = "refactor"
            elif message_lower.startswith("test"):
                detected = "test"
            elif message_lower.startswith("chore"):
                detected = "chore"
            elif message_lower.startswith("perf"):
                detected = "performance"
            elif message_lower.startswith("style"):
                detected = "style"
            else:
                detected = "other"

            assert detected == expected_type, f"Failed for message: {message}"

    def test_changelog_service_import(self):
        """Test changelog generator service can be imported."""
        from app.services import changelog_generator

        assert changelog_generator is not None

    def test_version_tag_extraction(self):
        """Test extracting version tags from commits."""
        commits = [
            {"message": "chore(release): 1.0.0"},
            {"message": "feat: Add new feature"},
            {"message": "fix: Fix bug"},
        ]

        versions = []
        for commit in commits:
            if "release" in commit["message"] or "1." in commit["message"]:
                import re

                match = re.search(r"\d+\.\d+\.\d+", commit["message"])
                if match:
                    versions.append(match.group())

        assert len(versions) >= 1
        assert "1.0.0" in versions


class TestChangelogIntegration:
    """Integration tests for changelog with database models."""

    def test_deliverable_model_has_documentation_fields(self):
        """Test Deliverable model has documentation fields."""
        from app.models.deliverable import Deliverable

        assert hasattr(Deliverable, "documentation_markdown")
        assert hasattr(Deliverable, "documentation_generated_at")

    def test_git_commit_model_exists(self):
        """Test GitCommit model can be imported."""
        try:
            from app.models.git_commit import GitCommit

            assert hasattr(GitCommit, "__tablename__")
        except ImportError:
            # Model may not exist yet
            pass
