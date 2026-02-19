"""Pydantic schemas for Git integration."""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, HttpUrl


class RepositoryValidateRequest(BaseModel):
    """Request to validate a repository."""

    repo_url: str
    provider: str  # 'github', 'gitlab', 'bitbucket'


class RepositoryValidateResponse(BaseModel):
    """Response from repository validation."""

    valid: bool
    repo_name: Optional[str] = None
    owner: Optional[str] = None
    full_name: Optional[str] = None
    private: Optional[bool] = None
    error: Optional[str] = None


class WebhookSetupRequest(BaseModel):
    """Request to setup webhooks for a repository."""

    project_id: UUID
    repo_url: str
    provider: str  # 'github', 'gitlab', 'bitbucket'
    events: List[str] = ["push", "pull_request"]


class LinkRepositoryRequest(BaseModel):
    """Request to link a repository to a project."""

    project_id: UUID
    repo_url: str
    provider: str
    repository_purpose: Optional[str] = None  # 'frontend', 'backend', etc.


class LinkRepositoryResponse(BaseModel):
    """Response from repository linking."""

    id: UUID
    repo_name: str
    repository_purpose: Optional[str] = None
    webhook_setup: bool = False
    message: Optional[str] = None


class WebhookSetupResponse(BaseModel):
    """Response from webhook setup."""

    success: bool
    webhook_id: Optional[str] = None
    message: Optional[str] = None
    error: Optional[str] = None


class AccessControlRequest(BaseModel):
    """Request to grant or revoke repository access."""

    project_id: UUID
    repo_url: str
    provider: str
    username: str


class AccessControlResponse(BaseModel):
    """Response from access control operation."""

    success: bool
    message: str
    error: Optional[str] = None


class PRStatusRequest(BaseModel):
    """Request to get PR status."""

    pr_url: str
    provider: str


class PRStatusResponse(BaseModel):
    """Response with PR status."""

    pr_number: Optional[int] = None
    title: Optional[str] = None
    state: Optional[str] = None
    merged: Optional[bool] = None
    merged_at: Optional[datetime] = None
    commit_sha: Optional[str] = None
    author: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    error: Optional[str] = None


class GitHubWebhookPayload(BaseModel):
    """GitHub webhook payload (simplified)."""

    action: Optional[str] = None
    repository: dict
    sender: dict
    # For push events
    ref: Optional[str] = None
    commits: Optional[List[dict]] = None
    # For pull request events
    pull_request: Optional[dict] = None


class GitLabWebhookPayload(BaseModel):
    """GitLab webhook payload (simplified)."""

    object_kind: str  # 'push', 'merge_request'
    project: dict
    user: dict
    # For push events
    ref: Optional[str] = None
    commits: Optional[List[dict]] = None
    # For merge request events
    object_attributes: Optional[dict] = None


class BitbucketWebhookPayload(BaseModel):
    """Bitbucket webhook payload (simplified)."""

    repository: dict
    actor: dict
    # For push events
    push: Optional[dict] = None
    # For pull request events
    pullrequest: Optional[dict] = None
