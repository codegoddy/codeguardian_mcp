"""GitHub API client for repository management and webhook configuration."""

from datetime import datetime
from typing import Any, Dict, Optional

import httpx

from app.core.logging_config import get_logger

from .base import GitProviderClient

logger = get_logger(__name__)


class GitHubClient(GitProviderClient):
    """GitHub API client implementation."""

    BASE_URL = "https://api.github.com"

    def __init__(self, access_token: str):
        """
        Initialize the GitHub client.

        Args:
            access_token: GitHub OAuth access token
        """
        super().__init__(access_token)
        self.headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    async def validate_repository(self, repo_url: str) -> Dict[str, Any]:
        """Validate that the GitHub repository exists and is accessible."""
        try:
            parsed = self.parse_repo_url(repo_url)
            owner = parsed["owner"]
            repo = parsed["repo"]

            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.BASE_URL}/repos/{owner}/{repo}",
                    headers=self.headers,
                    timeout=10.0,
                )

                if response.status_code == 200:
                    data = response.json()
                    return {
                        "valid": True,
                        "repo_name": data["name"],
                        "owner": data["owner"]["login"],
                        "full_name": data["full_name"],
                        "private": data["private"],
                        "error": None,
                    }
                elif response.status_code == 404:
                    return {
                        "valid": False,
                        "repo_name": None,
                        "owner": None,
                        "full_name": None,
                        "error": "Repository not found or access denied",
                    }
                else:
                    return {
                        "valid": False,
                        "repo_name": None,
                        "owner": None,
                        "full_name": None,
                        "error": f"GitHub API error: {response.status_code}",
                    }

        except Exception as e:
            return {
                "valid": False,
                "repo_name": None,
                "owner": None,
                "full_name": None,
                "error": str(e),
            }

    async def grant_access(self, repo_url: str, username: str) -> Dict[str, Any]:
        """Grant repository access by adding user as collaborator."""
        try:
            parsed = self.parse_repo_url(repo_url)
            owner = parsed["owner"]
            repo = parsed["repo"]

            async with httpx.AsyncClient() as client:
                response = await client.put(
                    f"{self.BASE_URL}/repos/{owner}/{repo}/collaborators/{username}",
                    headers=self.headers,
                    json={"permission": "push"},  # Grant push access
                    timeout=10.0,
                )

                if response.status_code in [201, 204]:
                    return {
                        "success": True,
                        "message": f"Access granted to {username}",
                        "error": None,
                    }
                elif response.status_code == 404:
                    return {
                        "success": False,
                        "message": None,
                        "error": "Repository or user not found",
                    }
                else:
                    return {
                        "success": False,
                        "message": None,
                        "error": f"GitHub API error: {response.status_code}",
                    }

        except Exception as e:
            return {"success": False, "message": None, "error": str(e)}

    async def revoke_access(self, repo_url: str, username: str) -> Dict[str, Any]:
        """Revoke repository access by removing user as collaborator."""
        try:
            parsed = self.parse_repo_url(repo_url)
            owner = parsed["owner"]
            repo = parsed["repo"]

            async with httpx.AsyncClient() as client:
                response = await client.delete(
                    f"{self.BASE_URL}/repos/{owner}/{repo}/collaborators/{username}",
                    headers=self.headers,
                    timeout=10.0,
                )

                if response.status_code == 204:
                    return {
                        "success": True,
                        "message": f"Access revoked from {username}",
                        "error": None,
                    }
                elif response.status_code == 404:
                    return {
                        "success": False,
                        "message": None,
                        "error": "Repository or user not found",
                    }
                else:
                    return {
                        "success": False,
                        "message": None,
                        "error": f"GitHub API error: {response.status_code}",
                    }

        except Exception as e:
            return {"success": False, "message": None, "error": str(e)}

    async def get_pr_status(self, pr_url: str) -> Dict[str, Any]:
        """Get the status of a GitHub pull request."""
        try:
            # Parse PR URL: https://github.com/owner/repo/pull/123
            parts = pr_url.rstrip("/").split("/")
            if "pull" not in parts:
                return {"error": "Invalid pull request URL"}

            pr_index = parts.index("pull")
            owner = parts[pr_index - 2]
            repo = parts[pr_index - 1]
            pr_number = int(parts[pr_index + 1])

            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.BASE_URL}/repos/{owner}/{repo}/pulls/{pr_number}",
                    headers=self.headers,
                    timeout=10.0,
                )

                if response.status_code == 200:
                    data = response.json()

                    # Determine if PR is merged
                    merged = data.get("merged", False)
                    merged_at = None
                    if merged and data.get("merged_at"):
                        merged_at = datetime.fromisoformat(data["merged_at"].replace("Z", "+00:00"))

                    return {
                        "pr_number": pr_number,
                        "title": data["title"],
                        "state": data["state"],  # 'open' or 'closed'
                        "merged": merged,
                        "merged_at": merged_at,
                        "commit_sha": data["head"]["sha"],
                        "author": data["user"]["login"],
                        "created_at": datetime.fromisoformat(data["created_at"].replace("Z", "+00:00")),
                        "updated_at": datetime.fromisoformat(data["updated_at"].replace("Z", "+00:00")),
                        "error": None,
                    }
                elif response.status_code == 404:
                    return {"error": "Pull request not found"}
                else:
                    return {"error": f"GitHub API error: {response.status_code}"}

        except Exception as e:
            return {"error": str(e)}

    async def create_webhook(self, repo_url: str, webhook_url: str, events: list) -> Dict[str, Any]:
        """Create a webhook for the GitHub repository."""
        try:
            parsed = self.parse_repo_url(repo_url)
            owner = parsed["owner"]
            repo = parsed["repo"]

            # Map generic events to GitHub-specific events
            github_events = []
            if "push" in events or "commit" in events:
                github_events.append("push")
            if "pull_request" in events or "pr" in events:
                github_events.append("pull_request")

            webhook_config = {
                "name": "web",
                "active": True,
                "events": github_events,
                "config": {
                    "url": webhook_url,
                    "content_type": "json",
                    "insecure_ssl": "0",
                },
            }

            # Add secret if available
            from app.core.config import settings

            if settings.GITHUB_WEBHOOK_SECRET:
                webhook_config["config"]["secret"] = settings.GITHUB_WEBHOOK_SECRET

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.BASE_URL}/repos/{owner}/{repo}/hooks",
                    headers=self.headers,
                    json=webhook_config,
                    timeout=10.0,
                )

                if response.status_code == 201:
                    data = response.json()
                    return {
                        "success": True,
                        "webhook_id": str(data["id"]),
                        "message": "Webhook created successfully",
                        "error": None,
                    }
                elif response.status_code == 422:
                    # Webhook might already exist
                    return {
                        "success": False,
                        "webhook_id": None,
                        "message": None,
                        "error": "Webhook already exists or validation failed",
                    }
                else:
                    return {
                        "success": False,
                        "webhook_id": None,
                        "message": None,
                        "error": f"GitHub API error: {response.status_code}",
                    }

        except Exception as e:
            return {
                "success": False,
                "webhook_id": None,
                "message": None,
                "error": str(e),
            }

    async def delete_webhook(self, repo_url: str, webhook_id: str) -> Dict[str, Any]:
        """Delete a webhook from the GitHub repository."""
        try:
            parsed = self.parse_repo_url(repo_url)
            owner = parsed["owner"]
            repo = parsed["repo"]

            async with httpx.AsyncClient() as client:
                response = await client.delete(
                    f"{self.BASE_URL}/repos/{owner}/{repo}/hooks/{webhook_id}",
                    headers=self.headers,
                    timeout=10.0,
                )

                if response.status_code == 204:
                    return {
                        "success": True,
                        "message": "Webhook deleted successfully",
                        "error": None,
                    }
                elif response.status_code == 404:
                    return {
                        "success": False,
                        "message": None,
                        "error": "Webhook not found",
                    }
                else:
                    return {
                        "success": False,
                        "message": None,
                        "error": f"GitHub API error: {response.status_code}",
                    }

        except Exception as e:
            return {"success": False, "message": None, "error": str(e)}

    async def get_pull_request_details(self, pr_url: str) -> Optional[Dict[str, Any]]:
        """Get detailed information about a pull request including description."""
        try:
            # Parse PR URL: https://github.com/owner/repo/pull/123
            parts = pr_url.rstrip("/").split("/")
            if "pull" not in parts:
                return None

            pr_index = parts.index("pull")
            owner = parts[pr_index - 2]
            repo = parts[pr_index - 1]
            pr_number = int(parts[pr_index + 1])

            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.BASE_URL}/repos/{owner}/{repo}/pulls/{pr_number}",
                    headers=self.headers,
                    timeout=10.0,
                )

                if response.status_code == 200:
                    data = response.json()

                    merged_at = None
                    if data.get("merged") and data.get("merged_at"):
                        merged_at = data["merged_at"]

                    return {
                        "pr_number": pr_number,
                        "title": data["title"],
                        "description": data.get("body", ""),
                        "state": data["state"],
                        "merged": data.get("merged", False),
                        "merged_at": merged_at,
                        "branch": data["head"]["ref"],
                        "commit_sha": data["head"]["sha"],
                        "author": data["user"]["login"],
                    }

                return None

        except Exception as e:
            logger.error("Error fetching PR details: %s", e)
            return None

    async def get_commit_details(self, repo_full_name: str, commit_sha: str) -> Optional[Dict[str, Any]]:
        """
        Get detailed commit information including line statistics.

        Args:
            repo_full_name: Repository full name (e.g., "owner/repo")
            commit_sha: Commit SHA hash

        Returns:
            Dictionary with commit details including stats, or None if failed
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.BASE_URL}/repos/{repo_full_name}/commits/{commit_sha}",
                    headers=self.headers,
                    timeout=10.0,
                )

                if response.status_code == 200:
                    data = response.json()
                    return {
                        "sha": data["sha"],
                        "message": data["commit"]["message"],
                        "author": data["commit"]["author"]["name"],
                        "stats": {
                            "additions": data.get("stats", {}).get("additions", 0),
                            "deletions": data.get("stats", {}).get("deletions", 0),
                            "total": data.get("stats", {}).get("total", 0),
                        },
                        "files": data.get("files", []),
                    }

                return None

        except Exception as e:
            logger.error("Error fetching commit details: %s", e)
            return None

    async def get_commits_by_task_reference(self, repo_url: str, task_reference: str) -> list[Dict[str, Any]]:
        """Get commits that reference a specific task."""
        try:
            parsed = self.parse_repo_url(repo_url)
            owner = parsed["owner"]
            repo = parsed["repo"]

            # Search commits by message
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.BASE_URL}/search/commits",
                    headers=self.headers,
                    params={
                        "q": f"{task_reference} repo:{owner}/{repo}",
                        "sort": "committer-date",
                        "order": "desc",
                        "per_page": 20,
                    },
                    timeout=10.0,
                )

                if response.status_code == 200:
                    data = response.json()
                    commits = []

                    for item in data.get("items", []):
                        commits.append(
                            {
                                "sha": item["sha"],
                                "message": item["commit"]["message"],
                                "author": item["commit"]["author"]["name"],
                                "date": item["commit"]["author"]["date"],
                            }
                        )

                    return commits

                return []

        except Exception as e:
            logger.error("Error fetching commits: %s", e)
            return []


# Alias for backward compatibility
GitHubProvider = GitHubClient
