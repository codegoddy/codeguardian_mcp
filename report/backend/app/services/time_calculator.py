from datetime import datetime, timedelta
from decimal import Decimal
from typing import Dict, List, Optional


class TimeCalculator:
    """Calculate work time from commit timestamps"""

    MAX_SESSION_GAP_HOURS = 2.0
    MIN_COMMIT_TIME_HOURS = 0.25  # 15 minutes
    MAX_SESSION_TIME_HOURS = 8.0
    MAX_DAILY_HOURS = 10.0

    def calculate_sessions(self, commits: List[Dict]) -> List[Dict]:
        """
        Group commits into work sessions and calculate time.
        Returns list of time entry dictionaries.

        Args:
            commits: List of commit dictionaries with 'committed_at' and 'deliverable_id'

        Returns:
            List of session dictionaries with calculated time
        """
        if not commits:
            return []

        # Sort commits by timestamp
        sorted_commits = sorted(commits, key=lambda c: c["committed_at"])

        sessions = []
        current_session = None

        for commit in sorted_commits:
            committed_at = commit["committed_at"]
            deliverable_id = commit.get("deliverable_id")

            if not current_session:
                # Start new session
                current_session = {
                    "start": committed_at,
                    "end": committed_at,
                    "commits": [commit],
                    "deliverable_id": deliverable_id,
                }
            else:
                # Check time since last commit
                time_diff = (committed_at - current_session["end"]).total_seconds() / 3600

                if time_diff <= self.MAX_SESSION_GAP_HOURS and deliverable_id == current_session["deliverable_id"]:
                    # Continue current session
                    current_session["end"] = committed_at
                    current_session["commits"].append(commit)
                else:
                    # Close current session and start new one
                    sessions.append(self._session_to_time_entry(current_session))
                    current_session = {
                        "start": committed_at,
                        "end": committed_at,
                        "commits": [commit],
                        "deliverable_id": deliverable_id,
                    }

        # Don't forget the last session
        if current_session:
            sessions.append(self._session_to_time_entry(current_session))

        return sessions

    def _session_to_time_entry(self, session: Dict) -> Dict:
        """Convert a session to a time entry with calculated duration"""
        start = session["start"]
        end = session["end"]
        commits = session["commits"]

        # Calculate session duration
        duration_hours = (end - start).total_seconds() / 3600

        # Apply minimum time per commit
        if len(commits) == 1:
            duration_hours = max(duration_hours, self.MIN_COMMIT_TIME_HOURS)
        else:
            # For multiple commits, ensure minimum time is respected
            duration_hours = max(duration_hours, len(commits) * self.MIN_COMMIT_TIME_HOURS)

        # Cap at maximum session time
        duration_hours = min(duration_hours, self.MAX_SESSION_TIME_HOURS)

        # Calculate total code changes
        total_insertions = sum(c.get("insertions", 0) for c in commits)
        total_deletions = sum(c.get("deletions", 0) for c in commits)
        total_files_changed = sum(c.get("files_changed", 0) for c in commits)

        return {
            "start_time": start,
            "end_time": end,
            "duration_hours": round(Decimal(str(duration_hours)), 2),
            "duration_minutes": round(duration_hours * 60),
            "deliverable_id": session["deliverable_id"],
            "commit_count": len(commits),
            "commits": commits,
            "summary": self._generate_summary(commits),
            "total_insertions": total_insertions,
            "total_deletions": total_deletions,
            "total_files_changed": total_files_changed,
            "needs_review": True,
            "approved": False,
        }

    def _generate_summary(self, commits: List[Dict]) -> str:
        """Generate a human-readable summary of the commits"""
        if not commits:
            return "No commits"

        if len(commits) == 1:
            message = commits[0].get("message", "").split("\n")[0]
            return f"1 commit: {message[:100]}"

        return f"{len(commits)} commits"

    def validate_daily_hours(self, sessions: List[Dict], date: datetime) -> Dict:
        """
        Validate that total hours for a day don't exceed maximum.

        Args:
            sessions: List of session dictionaries
            date: Date to validate

        Returns:
            Dictionary with validation results
        """
        # Filter sessions for the given date
        day_sessions = [s for s in sessions if s["start_time"].date() == date.date()]

        total_hours = sum(s["duration_hours"] for s in day_sessions)

        return {
            "date": date.date(),
            "total_hours": float(total_hours),
            "exceeds_maximum": total_hours > self.MAX_DAILY_HOURS,
            "session_count": len(day_sessions),
            "flagged_for_review": total_hours > self.MAX_DAILY_HOURS,
        }

    def calculate_cost(self, duration_hours: Decimal, hourly_rate: Decimal) -> Decimal:
        """Calculate cost for a time entry"""
        return round(duration_hours * hourly_rate, 2)
