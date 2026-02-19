from abc import ABC, abstractmethod
from datetime import datetime
from typing import Dict, List, Optional


class GitProvider(ABC):
    """Abstract interface for Git platform integrations"""

    @abstractmethod
    async def exchange_code_for_token(self, code: str) -> Dict:
        """Exchange OAuth authorization code for access token"""
        pass

    @abstractmethod
    async def get_user_info(self, access_token: str) -> Dict:
        """Get authenticated user information"""
        pass

    @abstractmethod
    async def list_repositories(self, access_token: str) -> List[Dict]:
        """List user's accessible repositories"""
        pass

    @abstractmethod
    async def get_commits(
        self,
        access_token: str,
        repo_full_name: str,
        since: datetime,
        branch: Optional[str] = None,
    ) -> List[Dict]:
        """Fetch commits from a repository"""
        pass

    @abstractmethod
    async def create_webhook(
        self,
        access_token: str,
        repo_full_name: str,
        callback_url: str,
        events: List[str],
    ) -> Dict:
        """Create webhook for push events"""
        pass

    @abstractmethod
    def parse_webhook_payload(self, payload: Dict, headers: Dict) -> Dict:
        """Parse and validate webhook payload"""
        pass
