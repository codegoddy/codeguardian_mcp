"""Service for generating changelogs from git commits."""

import re
from datetime import datetime
from typing import Any, Dict, List

from ..models.deliverable import Deliverable


class ChangelogGenerator:
    """Generates structured changelogs from git commits."""

    @staticmethod
    def generate_changelog(deliverable: Deliverable) -> Dict[str, List[str]]:
        """
        Parse commit messages and generate structured changelog.

        Args:
            deliverable: Deliverable object with git_commits relationship loaded.

        Returns:
            Dictionary with categories 'features', 'fixes', 'changes' containing lists of messages.
        """
        commits = deliverable.git_commits

        changelog = {"features": [], "fixes": [], "changes": []}

        for commit in commits:
            message = commit.message.strip()
            lower_message = message.lower()

            # Remove tracking code prefix (e.g., "GIT-029-001: ")
            # Matches "PREFIX-123-456: " or "PREFIX-123: "
            clean_message = re.sub(r"^[A-Z]+-\d+(?:-\d+)?:\s*", "", message)

            # Categorize based on conventional commit types or keywords
            if lower_message.startswith("fix") or "fix:" in lower_message or "bug" in lower_message:
                changelog["fixes"].append(clean_message)
            elif (
                lower_message.startswith("feat")
                or "feat:" in lower_message
                or "add" in lower_message
                or "implement" in lower_message
            ):
                changelog["features"].append(clean_message)
            else:
                changelog["changes"].append(clean_message)

        return changelog

    @staticmethod
    def format_as_markdown(changelog: Dict[str, List[str]]) -> str:
        """Format the changelog dictionary as a markdown string."""
        md_lines = []

        if changelog["features"]:
            md_lines.append("### Features Added")
            for item in changelog["features"]:
                md_lines.append(f"- {item}")
            md_lines.append("")

        if changelog["fixes"]:
            md_lines.append("### Bug Fixes")
            for item in changelog["fixes"]:
                md_lines.append(f"- {item}")
            md_lines.append("")

        if changelog["changes"]:
            md_lines.append("### Changes")
            for item in changelog["changes"]:
                md_lines.append(f"- {item}")
            md_lines.append("")

        return "\n".join(md_lines).strip()

    @classmethod
    def update_deliverable_documentation(cls, deliverable: Deliverable) -> bool:
        """
        Generate and update documentation for a deliverable.
        Returns True if documentation was updated.
        """
        if not deliverable.git_commits:
            return False

        changelog_data = cls.generate_changelog(deliverable)
        markdown = cls.format_as_markdown(changelog_data)

        if markdown:
            deliverable.documentation_markdown = markdown
            deliverable.documentation_generated_at = datetime.utcnow()
            return True

        return False
