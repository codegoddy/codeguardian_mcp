"""Bitbucket API client for repository management and webhook configuration."""

from datetime import datetime
from typing import Any, Dict, Optional

import httpx

from app.core.logging_config import get_logger

from .base import GitProviderClient

logger = get_logger(__name__)


class BitbucketClient(GitProviderClient):
    """Bitbucket API client implementation."""

    BASE_URL = "https://api.bitbucket.org/2.0"

    def __init__(self, access_token: str):
        """
        Initialize the Bitbucket client.

        Args:
            access_token: Bitbucket OAuth access token
        """
        super().__init__(access_token)
        self.headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

    async def validate_repository(self, repo_url: str) -> Dict[str, Any]:
        """Validate that the Bitbucket repository exists and is accessible."""
        try:
            parsed = self.parse_repo_url(repo_url)
            workspace = parsed["owner"]
            repo_slug = parsed["repo"]

            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.BASE_URL}/repositories/{workspace}/{repo_slug}",
                    headers=self.headers,
                    timeout=10.0,
                )

                if response.status_code == 200:
                    data = response.json()
                    return {
                        "valid": True,
                        "repo_name": data["name"],
                        "owner": data["workspace"]["slug"],
                        "full_name": data["full_name"],
                        "private": data["is_private"],
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
                        "error": f"Bitbucket API error: {response.status_code}",
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
        """
        Grant repository access by adding user with write permission.
        Note: Bitbucket uses workspace permissions, not individual repo permissions.
        """
        try:
            parsed = self.parse_repo_url(repo_url)
            workspace = parsed["owner"]
            repo_slug = parsed["repo"]

            # Bitbucket doesn't have a direct "add collaborator" API like GitHub
            # Instead, we need to use workspace permissions or repository permissions
            # For simplicity, we'll document this limitation

            async with httpx.AsyncClient() as client:
                # Try to add user to repository permissions
                response = await client.put(
                    f"{self.BASE_URL}/repositories/{workspace}/{repo_slug}/permissions-config/users/{username}",
                    headers=self.headers,
                    json={"permission": "write"},
                    timeout=10.0,
                )

                if response.status_code in [200, 201]:
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
                        "error": f"Bitbucket API error: {response.status_code}. Note: Bitbucket may require workspace-level permissions.",
                    }

        except Exception as e:
            return {"success": False, "message": None, "error": str(e)}

    async def revoke_access(self, repo_url: str, username: str) -> Dict[str, Any]:
        """Revoke repository access by removing user permissions."""
        try:
            parsed = self.parse_repo_url(repo_url)
            workspace = parsed["owner"]
            repo_slug = parsed["repo"]

            async with httpx.AsyncClient() as client:
                response = await client.delete(
                    f"{self.BASE_URL}/repositories/{workspace}/{repo_slug}/permissions-config/users/{username}",
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
                        "error": f"Bitbucket API error: {response.status_code}",
                    }

        except Exception as e:
            return {"success": False, "message": None, "error": str(e)}

    async def get_pr_status(self, pr_url: str) -> Dict[str, Any]:
        """Get the status of a Bitbucket pull request."""
        try:
            # Parse PR URL: https://bitbucket.org/workspace/repo/pull-requests/123
            parts = pr_url.rstrip("/").split("/")
            if "pull-requests" not in parts:
                return {"error": "Invalid pull request URL"}

            pr_index = parts.index("pull-requests")
            workspace = parts[pr_index - 2]
            repo_slug = parts[pr_index - 1]
            pr_number = int(parts[pr_index + 1])

            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.BASE_URL}/repositories/{workspace}/{repo_slug}/pullrequests/{pr_number}",
                    headers=self.headers,
                    timeout=10.0,
                )

                if response.status_code == 200:
                    data = response.json()

                    # Determine if PR is merged
                    state = data["state"]  # 'OPEN', 'MERGED', 'DECLINED', 'SUPERSEDED'
                    merged = state == "MERGED"
                    merged_at = None
                    if merged and data.get("updated_on"):
                        merged_at = datetime.fromisoformat(data["updated_on"].replace("Z", "+00:00"))

                    return {
                        "pr_number": pr_number,
                        "title": data["title"],
                        "state": state.lower(),
                        "merged": merged,
                        "merged_at": merged_at,
                        "commit_sha": data["source"]["commit"]["hash"],
                        "author": data["author"]["display_name"],
                        "created_at": datetime.fromisoformat(data["created_on"].replace("Z", "+00:00")),
                        "updated_at": datetime.fromisoformat(data["updated_on"].replace("Z", "+00:00")),
                        "error": None,
                    }
                elif response.status_code == 404:
                    return {"error": "Pull request not found"}
                else:
                    return {"error": f"Bitbucket API error: {response.status_code}"}

        except Exception as e:
            return {"error": str(e)}

    async def create_webhook(self, repo_url: str, webhook_url: str, events: list) -> Dict[str, Any]:
        """Create a webhook for the Bitbucket repository."""
        try:
            parsed = self.parse_repo_url(repo_url)
            workspace = parsed["owner"]
            repo_slug = parsed["repo"]

            # Map generic events to Bitbucket-specific events
            bitbucket_events = []
            if "push" in events or "commit" in events:
                bitbucket_events.append("repo:push")
            if "pull_request" in events or "pr" in events:
                bitbucket_events.extend(
                    [
                        "pullrequest:created",
                        "pullrequest:updated",
                        "pullrequest:fulfilled",
                    ]
                )

            webhook_config = {
                "description": "DevHQ Automation Webhook",
                "url": webhook_url,
                "active": True,
                "events": bitbucket_events,
            }

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.BASE_URL}/repositories/{workspace}/{repo_slug}/hooks",
                    headers=self.headers,
                    json=webhook_config,
                    timeout=10.0,
                )

                if response.status_code == 201:
                    data = response.json()
                    return {
                        "success": True,
                        "webhook_id": data["uuid"].strip("{}"),  # Remove curly braces from UUID
                        "message": "Webhook created successfully",
                        "error": None,
                    }
                elif response.status_code == 400:
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
                        "error": f"Bitbucket API error: {response.status_code}",
                    }

        except Exception as e:
            return {
                "success": False,
                "webhook_id": None,
                "message": None,
                "error": str(e),
            }

    async def delete_webhook(self, repo_url: str, webhook_id: str) -> Dict[str, Any]:
        """Delete a webhook from the Bitbucket repository."""
        try:
            parsed = self.parse_repo_url(repo_url)
            workspace = parsed["owner"]
            repo_slug = parsed["repo"]

            # Bitbucket uses UUID format with curly braces
            if not webhook_id.startswith("{"):
                webhook_id = f"{{{webhook_id}}}"

            async with httpx.AsyncClient() as client:
                response = await client.delete(
                    f"{self.BASE_URL}/repositories/{workspace}/{repo_slug}/hooks/{webhook_id}",
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
                        "error": f"Bitbucket API error: {response.status_code}",
                    }

        except Exception as e:
            return {"success": False, "message": None, "error": str(e)}

    async def get_pull_request_details(self, pr_url: str) -> Optional[Dict[str, Any]]:
        """Get detailed information about a pull request including description."""
        try:
            # Parse PR URL: https://bitbucket.org/workspace/repo/pull-requests/123
            parts = pr_url.rstrip("/").split("/")
            if "pull-requests" not in parts:
                return None

            pr_index = parts.index("pull-requests")
            workspace = parts[pr_index - 2]
            repo_slug = parts[pr_index - 1]
            pr_number = int(parts[pr_index + 1])

            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.BASE_URL}/repositories/{workspace}/{repo_slug}/pullrequests/{pr_number}",
                    headers=self.headers,
                    timeout=10.0,
                )

                if response.status_code == 200:
                    data = response.json()

                    state = data["state"]
                    merged_at = None
                    if state == "MERGED" and data.get("updated_on"):
                        merged_at = data["updated_on"]

                    return {
                        "pr_number": pr_number,
                        "title": data["title"],
                        "description": data.get("description", ""),
                        "state": state.lower(),
                        "merged": state == "MERGED",
                        "merged_at": merged_at,
                        "branch": data["source"]["branch"]["name"],
                        "commit_sha": data["source"]["commit"]["hash"],
                        "author": data["author"]["display_name"],
                    }

                return None

        except Exception as e:
            logger.error("Error fetching PR details: %s", e)
            return None

    async def get_commits_by_task_reference(self, repo_url: str, task_reference: str) -> list[Dict[str, Any]]:
        """Get commits that reference a specific task."""
        try:
            parsed = self.parse_repo_url(repo_url)
            workspace = parsed["owner"]
            repo_slug = parsed["repo"]

            # Get recent commits and filter by message
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.BASE_URL}/repositories/{workspace}/{repo_slug}/commits",
                    headers=self.headers,
                    params={"pagelen": 100},
                    timeout=10.0,
                )

                if response.status_code == 200:
                    data = response.json()
                    commits = []

                    for item in data.get("values", []):
                        if task_reference in item["message"]:
                            commits.append(
                                {
                                    "sha": item["hash"],
                                    "message": item["message"],
                                    "author": item["author"]["raw"],
                                    "date": item["date"],
                                }
                            )

                    return commits[:20]  # Limit to 20 commits

                return []

        except Exception as e:
            logger.error("Error fetching commits: %s", e)
            return []


# Alias for backward compatibility
BitbucketProvider = BitbucketClient
