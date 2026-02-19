"""GitLab API client for repository management and webhook configuration."""

from datetime import datetime
from typing import Any, Dict, Optional
from urllib.parse import quote

import httpx

from app.core.logging_config import get_logger

from .base import GitProviderClient

logger = get_logger(__name__)


class GitLabClient(GitProviderClient):
    """GitLab API client implementation."""

    BASE_URL = "https://gitlab.com/api/v4"

    def __init__(self, access_token: str):
        """
        Initialize the GitLab client.

        Args:
            access_token: GitLab OAuth access token or personal access token
        """
        super().__init__(access_token)
        self.headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }

    async def validate_repository(self, repo_url: str) -> Dict[str, Any]:
        """Validate that the GitLab repository exists and is accessible."""
        try:
            parsed = self.parse_repo_url(repo_url)
            # GitLab uses URL-encoded project path (owner/repo)
            project_path = quote(parsed["full_name"], safe="")

            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.BASE_URL}/projects/{project_path}",
                    headers=self.headers,
                    timeout=10.0,
                )

                if response.status_code == 200:
                    data = response.json()
                    return {
                        "valid": True,
                        "repo_name": data["name"],
                        "owner": data["namespace"]["path"],
                        "full_name": data["path_with_namespace"],
                        "private": data["visibility"] == "private",
                        "project_id": data["id"],
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
                        "error": f"GitLab API error: {response.status_code}",
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
        """Grant repository access by adding user as project member."""
        try:
            parsed = self.parse_repo_url(repo_url)
            project_path = quote(parsed["full_name"], safe="")

            # First, get the user ID from username
            async with httpx.AsyncClient() as client:
                user_response = await client.get(
                    f"{self.BASE_URL}/users?username={username}",
                    headers=self.headers,
                    timeout=10.0,
                )

                if user_response.status_code != 200:
                    return {
                        "success": False,
                        "message": None,
                        "error": "User not found",
                    }

                users = user_response.json()
                if not users:
                    return {
                        "success": False,
                        "message": None,
                        "error": "User not found",
                    }

                user_id = users[0]["id"]

                # Add user as project member with Developer access (30)
                member_response = await client.post(
                    f"{self.BASE_URL}/projects/{project_path}/members",
                    headers=self.headers,
                    json={"user_id": user_id, "access_level": 30},  # Developer access
                    timeout=10.0,
                )

                if member_response.status_code in [201, 200]:
                    return {
                        "success": True,
                        "message": f"Access granted to {username}",
                        "error": None,
                    }
                elif member_response.status_code == 409:
                    # User is already a member
                    return {
                        "success": True,
                        "message": f"{username} already has access",
                        "error": None,
                    }
                else:
                    return {
                        "success": False,
                        "message": None,
                        "error": f"GitLab API error: {member_response.status_code}",
                    }

        except Exception as e:
            return {"success": False, "message": None, "error": str(e)}

    async def revoke_access(self, repo_url: str, username: str) -> Dict[str, Any]:
        """Revoke repository access by removing user as project member."""
        try:
            parsed = self.parse_repo_url(repo_url)
            project_path = quote(parsed["full_name"], safe="")

            # First, get the user ID from username
            async with httpx.AsyncClient() as client:
                user_response = await client.get(
                    f"{self.BASE_URL}/users?username={username}",
                    headers=self.headers,
                    timeout=10.0,
                )

                if user_response.status_code != 200:
                    return {
                        "success": False,
                        "message": None,
                        "error": "User not found",
                    }

                users = user_response.json()
                if not users:
                    return {
                        "success": False,
                        "message": None,
                        "error": "User not found",
                    }

                user_id = users[0]["id"]

                # Remove user from project
                member_response = await client.delete(
                    f"{self.BASE_URL}/projects/{project_path}/members/{user_id}",
                    headers=self.headers,
                    timeout=10.0,
                )

                if member_response.status_code == 204:
                    return {
                        "success": True,
                        "message": f"Access revoked from {username}",
                        "error": None,
                    }
                elif member_response.status_code == 404:
                    return {
                        "success": False,
                        "message": None,
                        "error": "User is not a member of this project",
                    }
                else:
                    return {
                        "success": False,
                        "message": None,
                        "error": f"GitLab API error: {member_response.status_code}",
                    }

        except Exception as e:
            return {"success": False, "message": None, "error": str(e)}

    async def get_pr_status(self, pr_url: str) -> Dict[str, Any]:
        """Get the status of a GitLab merge request."""
        try:
            # Parse MR URL: https://gitlab.com/owner/repo/-/merge_requests/123
            parts = pr_url.rstrip("/").split("/")
            if "merge_requests" not in parts:
                return {"error": "Invalid merge request URL"}

            mr_index = parts.index("merge_requests")
            # Extract owner/repo from parts before '/-/'
            dash_index = parts.index("-")
            owner_repo_parts = parts[3:dash_index]  # Skip 'https:', '', 'gitlab.com'
            full_name = "/".join(owner_repo_parts)
            mr_number = int(parts[mr_index + 1])

            project_path = quote(full_name, safe="")

            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.BASE_URL}/projects/{project_path}/merge_requests/{mr_number}",
                    headers=self.headers,
                    timeout=10.0,
                )

                if response.status_code == 200:
                    data = response.json()

                    # Determine if MR is merged
                    merged = data["state"] == "merged"
                    merged_at = None
                    if merged and data.get("merged_at"):
                        merged_at = datetime.fromisoformat(data["merged_at"].replace("Z", "+00:00"))

                    return {
                        "pr_number": mr_number,
                        "title": data["title"],
                        "state": data["state"],  # 'opened', 'closed', 'merged'
                        "merged": merged,
                        "merged_at": merged_at,
                        "commit_sha": data["sha"],
                        "author": data["author"]["username"],
                        "created_at": datetime.fromisoformat(data["created_at"].replace("Z", "+00:00")),
                        "updated_at": datetime.fromisoformat(data["updated_at"].replace("Z", "+00:00")),
                        "error": None,
                    }
                elif response.status_code == 404:
                    return {"error": "Merge request not found"}
                else:
                    return {"error": f"GitLab API error: {response.status_code}"}

        except Exception as e:
            return {"error": str(e)}

    async def create_webhook(self, repo_url: str, webhook_url: str, events: list) -> Dict[str, Any]:
        """Create a webhook for the GitLab repository."""
        try:
            parsed = self.parse_repo_url(repo_url)
            project_path = quote(parsed["full_name"], safe="")

            # Map generic events to GitLab-specific events
            gitlab_events = {}
            if "push" in events or "commit" in events:
                gitlab_events["push_events"] = True
            if "pull_request" in events or "pr" in events:
                gitlab_events["merge_requests_events"] = True

            webhook_config = {
                "url": webhook_url,
                "token": "",  # Optional secret token
                **gitlab_events,
                "enable_ssl_verification": True,
            }

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.BASE_URL}/projects/{project_path}/hooks",
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
                        "error": f"GitLab API error: {response.status_code}",
                    }

        except Exception as e:
            return {
                "success": False,
                "webhook_id": None,
                "message": None,
                "error": str(e),
            }

    async def delete_webhook(self, repo_url: str, webhook_id: str) -> Dict[str, Any]:
        """Delete a webhook from the GitLab repository."""
        try:
            parsed = self.parse_repo_url(repo_url)
            project_path = quote(parsed["full_name"], safe="")

            async with httpx.AsyncClient() as client:
                response = await client.delete(
                    f"{self.BASE_URL}/projects/{project_path}/hooks/{webhook_id}",
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
                        "error": f"GitLab API error: {response.status_code}",
                    }

        except Exception as e:
            return {"success": False, "message": None, "error": str(e)}

    async def get_pull_request_details(self, pr_url: str) -> Optional[Dict[str, Any]]:
        """Get detailed information about a merge request including description."""
        try:
            # Parse MR URL: https://gitlab.com/owner/repo/-/merge_requests/123
            parts = pr_url.rstrip("/").split("/")
            if "merge_requests" not in parts:
                return None

            mr_index = parts.index("merge_requests")
            dash_index = parts.index("-")
            owner_repo_parts = parts[3:dash_index]
            full_name = "/".join(owner_repo_parts)
            mr_number = int(parts[mr_index + 1])

            project_path = quote(full_name, safe="")

            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.BASE_URL}/projects/{project_path}/merge_requests/{mr_number}",
                    headers=self.headers,
                    timeout=10.0,
                )

                if response.status_code == 200:
                    data = response.json()

                    merged_at = None
                    if data["state"] == "merged" and data.get("merged_at"):
                        merged_at = data["merged_at"]

                    return {
                        "pr_number": mr_number,
                        "title": data["title"],
                        "description": data.get("description", ""),
                        "state": data["state"],
                        "merged": data["state"] == "merged",
                        "merged_at": merged_at,
                        "branch": data["source_branch"],
                        "commit_sha": data["sha"],
                        "author": data["author"]["username"],
                    }

                return None

        except Exception as e:
            logger.error("Error fetching MR details", exc_info=True)
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
            project_path = quote(repo_full_name, safe="")
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.BASE_URL}/projects/{project_path}/repository/commits/{commit_sha}",
                    headers=self.headers,
                    timeout=10.0,
                )

                if response.status_code == 200:
                    data = response.json()
                    return {
                        "sha": data["id"],
                        "message": data["message"],
                        "author": data["author_name"],
                        "stats": {
                            "additions": data.get("stats", {}).get("additions", 0),
                            "deletions": data.get("stats", {}).get("deletions", 0),
                            "total": data.get("stats", {}).get("total", 0),
                        },
                        "files": [],  # GitLab doesn't return files in this call by default
                    }

                return None

        except Exception as e:
            logger.error("Error fetching GitLab commit details", exc_info=True)
            return None

    async def get_commits_by_task_reference(self, repo_url: str, task_reference: str) -> list[Dict[str, Any]]:
        """Get commits that reference a specific task."""
        try:
            parsed = self.parse_repo_url(repo_url)
            project_path = quote(parsed["full_name"], safe="")

            # Get recent commits and filter by message
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.BASE_URL}/projects/{project_path}/repository/commits",
                    headers=self.headers,
                    params={"per_page": 100, "order": "desc"},
                    timeout=10.0,
                )

                if response.status_code == 200:
                    data = response.json()
                    commits = []

                    for item in data:
                        if task_reference in item["message"]:
                            commits.append(
                                {
                                    "sha": item["id"],
                                    "message": item["message"],
                                    "author": item["author_name"],
                                    "date": item["created_at"],
                                }
                            )

                    return commits[:20]  # Limit to 20 commits

                return []

        except Exception as e:
            logger.error("Error fetching commits", exc_info=True)
            return []


# Alias for backward compatibility
GitLabProvider = GitLabClient
