import hashlib
import hmac
from datetime import datetime
from typing import Dict, List, Optional

import httpx

from app.core.config import settings
from app.services.git_provider import GitProvider


class GitHubProvider(GitProvider):
    """GitHub API integration"""

    BASE_URL = "https://api.github.com"

    async def exchange_code_for_token(self, code: str) -> Dict:
        """Exchange OAuth code for access token"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://github.com/login/oauth/access_token",
                json={
                    "client_id": settings.GITHUB_CLIENT_ID,
                    "client_secret": settings.GITHUB_CLIENT_SECRET,
                    "code": code,
                },
                headers={"Accept": "application/json"},
            )
            response.raise_for_status()
            return response.json()

    async def get_user_info(self, access_token: str) -> Dict:
        """Get authenticated user information"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.BASE_URL}/user",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/vnd.github.v3+json",
                },
            )
            response.raise_for_status()
            return response.json()

    async def list_repositories(self, access_token: str) -> List[Dict]:
        """List user's accessible repositories"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.BASE_URL}/user/repos",
                params={"per_page": 100, "sort": "updated"},
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/vnd.github.v3+json",
                },
            )
            response.raise_for_status()
            return response.json()

    async def get_commits(
        self,
        access_token: str,
        repo_full_name: str,
        since: datetime,
        branch: Optional[str] = None,
    ) -> List[Dict]:
        """Fetch commits from a repository"""
        params = {"since": since.isoformat()}
        if branch:
            params["sha"] = branch

        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.BASE_URL}/repos/{repo_full_name}/commits",
                params=params,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/vnd.github.v3+json",
                },
            )
            response.raise_for_status()
            commits = response.json()

            # Fetch detailed stats for each commit
            detailed_commits = []
            for commit in commits:
                detail_response = await client.get(
                    f"{self.BASE_URL}/repos/{repo_full_name}/commits/{commit['sha']}",
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Accept": "application/vnd.github.v3+json",
                    },
                )
                if detail_response.status_code == 200:
                    detailed_commits.append(detail_response.json())

            return detailed_commits

    async def create_webhook(
        self,
        access_token: str,
        repo_full_name: str,
        callback_url: str,
        events: List[str],
    ) -> Dict:
        """Create webhook for push events"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.BASE_URL}/repos/{repo_full_name}/hooks",
                json={
                    "name": "web",
                    "active": True,
                    "events": events,
                    "config": {
                        "url": callback_url,
                        "content_type": "json",
                        "secret": settings.GITHUB_WEBHOOK_SECRET,
                        "insecure_ssl": "0",
                    },
                },
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/vnd.github.v3+json",
                },
            )
            response.raise_for_status()
            return response.json()

    def parse_webhook_payload(self, payload: Dict, headers: Dict) -> Dict:
        """Parse and validate webhook payload"""
        # Validate webhook signature
        signature = headers.get("X-Hub-Signature-256", "")
        if signature:
            expected_signature = (
                "sha256="
                + hmac.new(
                    settings.GITHUB_WEBHOOK_SECRET.encode(),
                    str(payload).encode(),
                    hashlib.sha256,
                ).hexdigest()
            )

            if not hmac.compare_digest(signature, expected_signature):
                raise ValueError("Invalid webhook signature")

        # Extract relevant data
        return {
            "repository": payload["repository"]["full_name"],
            "branch": payload["ref"].replace("refs/heads/", ""),
            "commits": payload.get("commits", []),
        }
