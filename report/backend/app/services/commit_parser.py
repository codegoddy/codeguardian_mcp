"""Commit message parser service"""

import re
from typing import Dict, List, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.time_tracking import CommitParserConfig


class CommitMessageParser:
    """Parse commit messages to extract deliverable info and time"""

    DEFAULT_COMPLETION_KEYWORDS = [
        "complete",
        "completed",
        "finish",
        "finished",
        "done",
        "closes",
        "fixes",
        "resolves",
        "close",
        "fix",
        "resolve",
    ]

    DEFAULT_PROGRESS_KEYWORDS = [
        "wip",
        "progress",
        "working on",
        "implementing",
        "developing",
        "building",
        "in progress",
    ]

    DEFAULT_START_KEYWORDS = ["start", "begin", "starting", "beginning", "started"]

    DEFAULT_CONVENTIONAL_TYPES = [
        "feat",
        "fix",
        "docs",
        "style",
        "refactor",
        "test",
        "chore",
        "perf",
        "build",
        "ci",
    ]

    def __init__(self, config: Optional[CommitParserConfig] = None):
        self.config = config or self.get_default_config()

    @classmethod
    def get_default_config(cls) -> CommitParserConfig:
        """Get default configuration"""
        config = CommitParserConfig()
        config.id_pattern = "DEVHQ-{id}"
        config.completion_keywords = cls.DEFAULT_COMPLETION_KEYWORDS
        config.progress_keywords = cls.DEFAULT_PROGRESS_KEYWORDS
        config.start_keywords = cls.DEFAULT_START_KEYWORDS
        config.conventional_types = cls.DEFAULT_CONVENTIONAL_TYPES
        config.time_pattern = "[{time}h]"
        config.use_conventional_commits = True
        config.auto_detect_patterns = True
        config.case_sensitive = False
        return config

    async def parse_commit(self, commit_message: str) -> Dict:
        """
        Parse commit message using multiple strategies

        Returns:
            dict with deliverable_id, status, manual_time, commit_type, confidence, method
        """
        result = {
            "deliverable_id": None,
            "status": None,
            "manual_time": None,
            "commit_type": None,
            "confidence": 0.0,
            "method": None,
        }

        # Strategy 1: Exact pattern match
        deliverable_id = self.extract_by_pattern(commit_message)
        if deliverable_id:
            result["deliverable_id"] = deliverable_id
            result["confidence"] = 0.95
            result["method"] = "pattern_match"

        # Strategy 2: Regex match
        if not result["deliverable_id"] and self.config.id_regex:
            deliverable_id = self.extract_by_regex(commit_message)
            if deliverable_id:
                result["deliverable_id"] = deliverable_id
                result["confidence"] = 0.90
                result["method"] = "regex_match"

        # Strategy 3: Conventional commits
        if self.config.use_conventional_commits:
            conventional_data = self.parse_conventional_commit(commit_message)
            if conventional_data:
                if conventional_data.get("deliverable_id"):
                    result["deliverable_id"] = conventional_data["deliverable_id"]
                    result["confidence"] = max(result["confidence"], 0.85)
                result["commit_type"] = conventional_data.get("commit_type")
                result["method"] = "conventional_commits"

        # Strategy 4: Keyword detection
        status = self.detect_status_keywords(commit_message)
        if status:
            result["status"] = status

        # Strategy 5: Time extraction
        manual_time = self.extract_time(commit_message)
        if manual_time:
            result["manual_time"] = manual_time

        return result

    def extract_by_pattern(self, message: str) -> Optional[int]:
        """Extract deliverable ID using configured pattern"""
        if not self.config.id_pattern:
            return None

        # Convert pattern to regex
        pattern = self.config.id_pattern.replace("{id}", r"(\d+)")
        pattern = re.escape(pattern).replace(r"\\(\\d\+\\)", r"(\d+)")

        flags = 0 if self.config.case_sensitive else re.IGNORECASE
        match = re.search(pattern, message, flags)

        if match:
            try:
                return int(match.group(1))
            except (IndexError, ValueError):
                return None
        return None

    def extract_by_regex(self, message: str) -> Optional[int]:
        """Extract using custom regex"""
        if not self.config.id_regex:
            return None

        flags = 0 if self.config.case_sensitive else re.IGNORECASE
        match = re.search(self.config.id_regex, message, flags)

        if match:
            try:
                return int(match.group(1))
            except (IndexError, ValueError):
                return None
        return None

    def parse_conventional_commit(self, message: str) -> Optional[Dict]:
        """
        Parse conventional commit format
        Example: "feat(DEVHQ-101): Add login form"
        """
        pattern = r"^(\w+)(?:\(([^)]+)\))?: (.+)$"
        match = re.match(pattern, message)

        if match:
            commit_type, scope, description = match.groups()

            # Extract ID from scope
            deliverable_id = None
            if scope:
                id_match = re.search(r"(\d+)", scope)
                if id_match:
                    deliverable_id = int(id_match.group(1))

            return {
                "commit_type": commit_type,
                "deliverable_id": deliverable_id,
                "description": description,
            }

        return None

    def detect_status_keywords(self, message: str) -> Optional[str]:
        """Detect status from keywords"""
        message_lower = message.lower()

        # Check completion keywords
        completion_keywords = self.config.completion_keywords or self.DEFAULT_COMPLETION_KEYWORDS
        for keyword in completion_keywords:
            if keyword.lower() in message_lower:
                return "completed"

        # Check progress keywords
        progress_keywords = self.config.progress_keywords or self.DEFAULT_PROGRESS_KEYWORDS
        for keyword in progress_keywords:
            if keyword.lower() in message_lower:
                return "in_progress"

        # Check start keywords
        start_keywords = self.config.start_keywords or self.DEFAULT_START_KEYWORDS
        for keyword in start_keywords:
            if keyword.lower() in message_lower:
                return "started"

        return None

    def extract_time(self, message: str) -> Optional[float]:
        """
        Extract manual time from commit message
        Examples: "[2h]", "[1.5h]", "(3h)"
        """
        if self.config.time_regex:
            match = re.search(self.config.time_regex, message)
        else:
            # Default patterns
            patterns = [
                r"\[(\d+\.?\d*)h\]",  # [2h] or [1.5h]
                r"\((\d+\.?\d*)h\)",  # (2h)
                r"time:(\d+\.?\d*)h",  # time:2h
                r"(\d+\.?\d*)h\s*$",  # 2h at end
            ]

            match = None
            for pattern in patterns:
                match = re.search(pattern, message, re.IGNORECASE)
                if match:
                    break

        if match:
            try:
                return float(match.group(1))
            except (IndexError, ValueError):
                return None
        return None

    @staticmethod
    async def get_config_for_project(project_id: UUID, db: AsyncSession) -> CommitParserConfig:
        """Get parser config for a project"""
        result = await db.execute(select(CommitParserConfig).where(CommitParserConfig.project_id == project_id))
        config = result.scalar_one_or_none()

        if not config:
            # Return default config
            return CommitMessageParser.get_default_config()

        return config
