"""Base class for Git provider API clients."""

from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any, Dict, Optional


class GitProviderClient(ABC):
    """Abstract base class for Git provider API clients."""

    def __init__(self, access_token: str):
        """
        Initialize the Git provider client.

        Args:
            access_token: OAuth access token for the Git provider
        """
        self.access_token = access_token

    @abstractmethod
    async def validate_repository(self, repo_url: str) -> Dict[str, Any]:
        """
        Validate that the repository exists and is accessible.

        Args:
            repo_url: Full URL of the repository

        Returns:
            Dict with validation result:
            {
                "valid": bool,
                "repo_name": str,
                "owner": str,
                "full_name": str,
                "error": Optional[str]
            }
        """
        pass

    @abstractmethod
    async def grant_access(self, repo_url: str, username: str) -> Dict[str, Any]:
        """
        Grant repository access to a user (add as collaborator).

        Args:
            repo_url: Full URL of the repository
            username: Username to grant access to

        Returns:
            Dict with result:
            {
                "success": bool,
                "message": str,
                "error": Optional[str]
            }
        """
        pass

    @abstractmethod
    async def revoke_access(self, repo_url: str, username: str) -> Dict[str, Any]:
        """
        Revoke repository access from a user (remove as collaborator).

        Args:
            repo_url: Full URL of the repository
            username: Username to revoke access from

        Returns:
            Dict with result:
            {
                "success": bool,
                "message": str,
                "error": Optional[str]
            }
        """
        pass

    @abstractmethod
    async def get_pr_status(self, pr_url: str) -> Dict[str, Any]:
        """
        Get the status of a pull request.

        Args:
            pr_url: Full URL of the pull request

        Returns:
            Dict with PR status:
            {
                "pr_number": int,
                "title": str,
                "state": str,  # 'open', 'closed', 'merged'
                "merged": bool,
                "merged_at": Optional[datetime],
                "commit_sha": str,
                "author": str,
                "created_at": datetime,
                "updated_at": datetime,
                "error": Optional[str]
            }
        """
        pass

    @abstractmethod
    async def create_webhook(self, repo_url: str, webhook_url: str, events: list) -> Dict[str, Any]:
        """
        Create a webhook for the repository.

        Args:
            repo_url: Full URL of the repository
            webhook_url: URL to send webhook events to
            events: List of events to subscribe to (e.g., ['push', 'pull_request'])

        Returns:
            Dict with result:
            {
                "success": bool,
                "webhook_id": Optional[str],
                "message": str,
                "error": Optional[str]
            }
        """
        pass

    @abstractmethod
    async def delete_webhook(self, repo_url: str, webhook_id: str) -> Dict[str, Any]:
        """
        Delete a webhook from the repository.

        Args:
            repo_url: Full URL of the repository
            webhook_id: ID of the webhook to delete

        Returns:
            Dict with result:
            {
                "success": bool,
                "message": str,
                "error": Optional[str]
            }
        """
        pass

    @abstractmethod
    async def get_pull_request_details(self, pr_url: str) -> Optional[Dict[str, Any]]:
        """
        Get detailed information about a pull request including description.

        Args:
            pr_url: Full URL of the pull request

        Returns:
            Dict with PR details:
            {
                "pr_number": int,
                "title": str,
                "description": str,
                "state": str,
                "merged": bool,
                "merged_at": Optional[str],
                "branch": str,
                "commit_sha": str,
                "author": str
            }
        """
        pass

    @abstractmethod
    async def get_commits_by_task_reference(self, repo_url: str, task_reference: str) -> list[Dict[str, Any]]:
        """
        Get commits that reference a specific task.

        Args:
            repo_url: Full URL of the repository
            task_reference: Task reference to search for (e.g., "DEVHQ-101")

        Returns:
            List of commits:
            [
                {
                    "sha": str,
                    "message": str,
                    "author": str,
                    "date": str
                }
            ]
        """
        pass

    @staticmethod
    def parse_repo_url(repo_url: str) -> Dict[str, str]:
        """
        Parse a repository URL to extract owner and repo name.
        Supports both full URLs and short format (owner/repo).

        Args:
            repo_url: Full URL of the repository or short format (owner/repo)

        Returns:
            Dict with parsed components:
            {
                "owner": str,
                "repo": str,
                "full_name": str
            }
        """
        # Remove trailing slashes and .git extension
        url = repo_url.rstrip("/").replace(".git", "")

        # Check if it's a short format (owner/repo)
        if "/" in url and not ("://" in url or "github.com" in url or "gitlab.com" in url or "bitbucket.org" in url):
            parts = url.split("/")
            if len(parts) == 2:
                owner, repo = parts
                return {"owner": owner, "repo": repo, "full_name": f"{owner}/{repo}"}

        # Extract path from full URL
        if "github.com" in url or "gitlab.com" in url or "bitbucket.org" in url:
            parts = url.split("/")
            if len(parts) >= 2:
                owner = parts[-2]
                repo = parts[-1]
                return {"owner": owner, "repo": repo, "full_name": f"{owner}/{repo}"}

        raise ValueError(f"Invalid repository URL: {repo_url}")
