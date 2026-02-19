"""Service for validating correlation between time entries and git commits."""

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from ..models.deliverable import Deliverable


class TimelineValidator:
    """Validates that commits align with tracked time sessions."""

    # Allow commits up to 30min after session end (grace period)
    GRACE_PERIOD_MINUTES = 30

    @classmethod
    def validate_time_commit_correlation(
        cls,
        deliverable: Deliverable,
        time_entries: Optional[List] = None,
        commits: Optional[List] = None,
    ) -> Dict[str, Any]:
        """
        Check if commits align with time tracking sessions.
        Uses intelligent pattern detection instead of strict validation.

        Args:
            deliverable: Deliverable object with time_entries and git_commits loaded.
            time_entries: Optional list of time entries (to avoid lazy loading in async contexts)
            commits: Optional list of commits (to avoid lazy loading in async contexts)

        Returns:
            Dictionary with validation results.
        """
        # Use provided data or fall back to deliverable attributes
        # Note: This assumes time_entries and git_commits are already loaded on the deliverable object
        # If not, the caller must ensure they are loaded (e.g. via eager loading)
        if time_entries is None:
            time_entries = getattr(deliverable, "time_entries", [])
        if commits is None:
            commits = getattr(deliverable, "git_commits", [])

        # If we don't have time entries but have commits, that's suspicious (unless manual time)
        if not time_entries and commits:
            # Check if we have manual time entries (not from git)
            # But for now, let's just proceed with empty time entries list
            pass

        commits_outside_sessions = []
        commits_near_sessions = []  # Within grace period

        for commit in commits:
            commit_time = commit.committed_at
            if not commit_time:
                continue

            # Normalize to timezone-naive for comparison
            if commit_time.tzinfo is not None:
                commit_time = commit_time.replace(tzinfo=None)

            # Check if commit falls within any time entry
            in_session = False
            near_session = False

            for entry in time_entries:
                if not entry.start_time or not entry.end_time:
                    continue

                # Normalize entry times to timezone-naive
                start_time = entry.start_time
                end_time = entry.end_time
                if start_time.tzinfo is not None:
                    start_time = start_time.replace(tzinfo=None)
                if end_time.tzinfo is not None:
                    end_time = end_time.replace(tzinfo=None)

                # Exact match: within session
                if start_time <= commit_time <= end_time:
                    in_session = True
                    break

                # Grace period: likely final commit/push after stopping timer
                grace_end = end_time + timedelta(minutes=cls.GRACE_PERIOD_MINUTES)
                if end_time < commit_time <= grace_end:
                    near_session = True

            if not in_session and not near_session:
                commits_outside_sessions.append(
                    {
                        "sha": commit.commit_sha,
                        "message": commit.message,
                        "timestamp": commit_time,
                        "reason": "Committed outside tracked time",
                    }
                )
            elif near_session:
                commits_near_sessions.append(
                    {
                        "sha": commit.commit_sha,
                        "message": commit.message,
                        "timestamp": commit_time,
                        "reason": "Committed in grace period (likely final push)",
                    }
                )

        # Calculate pattern metrics
        total_commits = len(commits)
        outside_count = len(commits_outside_sessions)
        outside_percentage = (outside_count / total_commits * 100) if total_commits > 0 else 0

        # Only flag as suspicious if significant pattern exists
        is_suspicious = outside_percentage > 50 or (  # More than half outside sessions
            outside_count > 5 and outside_percentage > 30
        )  # Many commits with >30% outside

        return {
            "commits_outside": commits_outside_sessions,
            "commits_in_grace_period": commits_near_sessions,
            "outside_percentage": round(outside_percentage, 1),
            "is_suspicious": is_suspicious,
            "needs_review": outside_percentage > 30,  # Soft warning threshold
            "summary": f"{outside_count}/{total_commits} commits ({outside_percentage:.1f}%) outside tracked time",
        }
