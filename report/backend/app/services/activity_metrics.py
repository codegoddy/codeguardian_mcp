"""Service for calculating deliverable activity metrics and fraud risk."""

from decimal import Decimal
from typing import Any, Dict, List, Optional

from ..models.deliverable import Deliverable


class ActivityMetricsService:
    """Service to calculate activity scores and classify fraud risk."""

    # Work type definitions with adjusted thresholds
    WORK_TYPE_THRESHOLDS = {
        "feature": {
            "commit_density": (0.3, 0.8),
            "files_per_hour": (2, 10),
            "lines_per_hour": (50, 300),
        },
        "bugfix": {
            "commit_density": (0.2, 0.6),
            "files_per_hour": (1, 5),
            "lines_per_hour": (10, 100),
        },
        "refactor": {
            "commit_density": (0.2, 0.5),
            "files_per_hour": (3, 15),
            "lines_per_hour": (30, 200),
            "value_deletions": True,  # Count deletions as positive activity
        },
        "research": {
            "commit_density": (0.05, 0.3),
            "files_per_hour": (0.5, 3),
            "lines_per_hour": (10, 100),
            "minimum_score": 40,  # Don't penalize research-heavy work
        },
        "documentation": {
            "commit_density": (0.1, 0.4),
            "files_per_hour": (1, 5),
            "lines_per_hour": (20, 150),
        },
        "testing": {
            "commit_density": (0.2, 0.6),
            "files_per_hour": (2, 8),
            "lines_per_hour": (30, 200),
        },
        "meeting": {
            "commit_density": (0, 0.1),
            "files_per_hour": (0, 1),
            "lines_per_hour": (0, 20),
            "minimum_score": 30,
        },
        "planning": {
            "commit_density": (0, 0.2),
            "files_per_hour": (0, 2),
            "lines_per_hour": (0, 50),
            "minimum_score": 35,
        },
        "other": {  # Fallback
            "commit_density": (0.1, 0.5),
            "files_per_hour": (1, 5),
            "lines_per_hour": (20, 150),
        },
    }

    @classmethod
    def calculate_activity_score(
        cls,
        deliverable: Deliverable,
        developer_baseline: Optional[Dict[str, float]] = None,
        commits: Optional[List] = None,
    ) -> int:
        """
        Calculate a 0-100 score based on commit activity vs time tracked.
        Adapts to work type and developer patterns.

        Args:
            deliverable: Deliverable object with commits and time entries
            developer_baseline: Optional dict with developer's historical averages
            commits: Optional list of commits (to avoid lazy loading in async contexts)
        """
        # Ensure actual_hours is a float for calculation
        hours_tracked = float(deliverable.actual_hours or 0)
        # Use provided commits or fall back to deliverable.git_commits
        if commits is None:
            commits = deliverable.git_commits
        commits_count = len(commits)

        # Calculate totals from commits
        files_changed = sum(c.files_changed or 0 for c in commits)
        insertions = sum(c.insertions or 0 for c in commits)
        deletions = sum(c.deletions or 0 for c in commits)

        if hours_tracked == 0:
            return 0

        # Get work type (default to 'feature')
        work_type = deliverable.work_type or "feature"
        thresholds = cls.WORK_TYPE_THRESHOLDS.get(work_type, cls.WORK_TYPE_THRESHOLDS["other"])

        # Base metrics
        commit_density = commits_count / hours_tracked
        files_per_hour = files_changed / hours_tracked
        lines_per_hour = (insertions + (deletions if thresholds.get("value_deletions") else 0)) / hours_tracked

        # Apply developer baseline calibration if available
        consistency_bonus = 0
        if developer_baseline:
            # Adjust thresholds based on developer's typical patterns (±30%)
            # This is a simplified implementation of the baseline logic
            commit_density_ratio = commit_density / max(developer_baseline.get("avg_commit_density", 0.5), 0.1)
            files_ratio = files_per_hour / max(developer_baseline.get("avg_files_per_hour", 5), 0.5)
            lines_ratio = lines_per_hour / max(developer_baseline.get("avg_lines_per_hour", 100), 10)

            if 0.7 <= commit_density_ratio <= 1.3:
                consistency_bonus += 5
            if 0.7 <= files_ratio <= 1.3:
                consistency_bonus += 5
            if 0.7 <= lines_ratio <= 1.3:
                consistency_bonus += 5

        # Scoring (0-100)
        score = 0

        # Commit frequency (40 points)
        min_commits, max_commits = thresholds["commit_density"]
        if min_commits <= commit_density <= max_commits:
            score += 40
        elif min_commits * 0.5 <= commit_density < min_commits:
            score += 20
        elif commit_density > max_commits:
            score += 30  # High activity is good, but maybe too high? Still give good points.

        # Files changed (30 points)
        min_files, max_files = thresholds["files_per_hour"]
        if min_files <= files_per_hour <= max_files:
            score += 30
        elif min_files * 0.5 <= files_per_hour < min_files:
            score += 15

        # Lines of code (30 points)
        min_lines, max_lines = thresholds["lines_per_hour"]
        if min_lines <= lines_per_hour <= max_lines:
            score += 30
        elif min_lines * 0.5 <= lines_per_hour < min_lines:
            score += 15

        # Add consistency bonus
        score += consistency_bonus

        # Apply minimum score for certain work types
        minimum_score = thresholds.get("minimum_score", 0)
        score = max(score, minimum_score)

        return min(score, 100)

    @staticmethod
    def classify_fraud_risk(activity_score: int, hours_tracked: float, commits_count: int) -> str:
        """
        Classify fraud risk: low, medium, high
        """
        if activity_score >= 70:
            return "low"

        if activity_score >= 40:
            # Check for red flags
            if hours_tracked > 8 and commits_count < 3:
                return "high"
            return "medium"

        # Low activity score
        if hours_tracked > 4 and commits_count < 2:
            return "high"

        return "medium"
