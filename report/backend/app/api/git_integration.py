"""Git integration API endpoints for webhook management and repository access control."""

import hashlib
import hmac
import json
from datetime import timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.auth import get_current_user
from ..core.logging_config import get_logger
from ..db.database import get_db
from ..models.git_commit import GitCommit
from ..models.git_integration import GitIntegration
from ..models.git_repository import GitRepository
from ..models.project import Project
from ..models.user import User
from ..schemas.git_integration import (
    AccessControlRequest,
    AccessControlResponse,
    BitbucketWebhookPayload,
    GitHubWebhookPayload,
    GitLabWebhookPayload,
    LinkRepositoryRequest,
    LinkRepositoryResponse,
    PRStatusRequest,
    PRStatusResponse,
    RepositoryValidateRequest,
    RepositoryValidateResponse,
    WebhookSetupRequest,
    WebhookSetupResponse,
)
from ..services.commit_parser import CommitMessageParser
from ..services.deliverable_linker import DeliverableLinker
from ..utils.git_providers import BitbucketClient, GitHubClient, GitLabClient
from ..utils.nats_client import publish_event

logger = get_logger(__name__)
router = APIRouter(prefix="/git", tags=["git-integration"])


def get_git_client(provider: str, access_token: str):
    """Get the appropriate Git provider client."""
    if provider == "github":
        return GitHubClient(access_token)
    elif provider == "gitlab":
        return GitLabClient(access_token)
    elif provider == "bitbucket":
        return BitbucketClient(access_token)
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported provider: {provider}")


@router.post("/validate-repository", response_model=RepositoryValidateResponse)
async def validate_repository(
    request: RepositoryValidateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Validate that a repository exists and is accessible.

    Requirements: 4.7
    """
    try:
        # Get user's OAuth token for the provider
        # For now, we'll use a placeholder - in production, this should come from user's OAuth tokens
        access_token = getattr(current_user, f"{request.provider}_access_token", None)

        if not access_token:
            raise HTTPException(
                status_code=400,
                detail=f"No {request.provider} access token found. Please connect your {request.provider} account.",
            )

        client = get_git_client(request.provider, access_token)
        result = await client.validate_repository(request.repo_url)

        return RepositoryValidateResponse(**result)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/link-repository", response_model=LinkRepositoryResponse)
async def link_repository(
    request: LinkRepositoryRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Link a repository to a project and optionally setup webhooks.
    """
    try:
        # Verify project ownership
        result = await db.execute(select(Project).where(Project.id == request.project_id, Project.user_id == current_user.id))
        project = result.scalar_one_or_none()

        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        # Get integration
        git_integration_result = await db.execute(
            select(GitIntegration).where(
                GitIntegration.user_id == current_user.id,
                GitIntegration.platform == request.provider,
                GitIntegration.is_active == True,
            )
        )
        git_integration = git_integration_result.scalar_one_or_none()

        if not git_integration:
            raise HTTPException(
                status_code=400,
                detail=f"No active {request.provider} integration found",
            )

        # Validate repo first
        from ..core.security import decrypt_token

        access_token = decrypt_token(git_integration.access_token)
        client = get_git_client(request.provider, access_token)
        repo_info = await client.validate_repository(request.repo_url)

        if not repo_info.get("valid"):
            raise HTTPException(status_code=400, detail=f"Invalid repository: {repo_info.get('error')}")

        # Check if already linked
        existing_repo = await db.execute(
            select(GitRepository).where(
                GitRepository.project_id == project.id,
                GitRepository.repo_full_name == repo_info.get("full_name"),
            )
        )
        if existing_repo.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Repository already linked to this project")

        # Create GitRepository
        new_repo = GitRepository(
            integration_id=git_integration.id,
            project_id=project.id,
            repo_url=request.repo_url,
            repo_name=repo_info.get("repo_name"),
            repo_full_name=repo_info.get("full_name"),
            repository_purpose=request.repository_purpose,
            default_branch="main",  # Should ideally come from repo_info
        )
        db.add(new_repo)
        await db.commit()
        await db.refresh(new_repo)

        # Attempt webhook setup
        webhook_setup = False
        try:
            from ..core.config import settings

            base_url = settings.backend_url
            webhook_url = f"{base_url}/api/git/webhooks/{request.provider}"
            webhook_result = await client.create_webhook(request.repo_url, webhook_url, ["push", "pull_request"])
            if webhook_result.get("success"):
                new_repo.webhook_id = webhook_result.get("webhook_id")
                webhook_setup = True
                await db.commit()
        except Exception as e:
            logger.warning("Webhook setup failed: %s", e)

        return LinkRepositoryResponse(
            id=new_repo.id,
            repo_name=new_repo.repo_name,
            repository_purpose=new_repo.repository_purpose,
            webhook_setup=webhook_setup,
            message="Repository linked successfully",
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/setup-webhooks", response_model=WebhookSetupResponse)
async def setup_webhooks(
    request: WebhookSetupRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Configure webhooks for a repository to receive commit and PR events.

    Requirements: 5.1, 8.1
    """
    try:
        # Verify project ownership
        result = await db.execute(select(Project).where(Project.id == request.project_id, Project.user_id == current_user.id))
        project = result.scalar_one_or_none()

        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        # Get user's Git integration for the provider
        git_integration_result = await db.execute(
            select(GitIntegration).where(
                GitIntegration.user_id == current_user.id,
                GitIntegration.platform == request.provider,
                GitIntegration.is_active == True,
            )
        )
        git_integration = git_integration_result.scalar_one_or_none()

        if not git_integration:
            raise HTTPException(
                status_code=400,
                detail=f"No {request.provider} integration found. Please connect your GitHub account in integrations settings.",
            )

        # Decrypt access token
        from ..core.security import decrypt_token

        access_token = decrypt_token(git_integration.access_token)

        # Construct webhook URL using backend_url from settings
        from ..core.config import settings

        base_url = settings.backend_url
        # Webhook URL must include the /api/git prefix where the router is mounted
        webhook_url = f"{base_url}/api/git/webhooks/{request.provider}"

        client = get_git_client(request.provider, access_token)
        result = await client.create_webhook(request.repo_url, webhook_url, request.events)

        if result["success"]:
            # Store webhook ID in project metadata for future reference
            # Publish event for webhook configuration (non-blocking)
            try:
                await publish_event(
                    "git.webhook_configured",
                    {
                        "project_id": str(project.id),
                        "repo_url": request.repo_url,
                        "provider": request.provider,
                        "events": request.events,
                    },
                    background=True,  # Non-blocking publish
                )
            except Exception as e:
                # Log but don't fail the request
                logger.warning("Failed to publish git.webhook_configured event: %s", e)

        return WebhookSetupResponse(**result)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/revoke-access", response_model=AccessControlResponse)
async def revoke_access(
    request: AccessControlRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Revoke repository access from a user (used for Auto-Pause enforcement).

    Requirements: 6.3
    """
    try:
        # Verify project ownership
        result = await db.execute(select(Project).where(Project.id == request.project_id, Project.user_id == current_user.id))
        project = result.scalar_one_or_none()

        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        # Get user's OAuth token for the provider
        access_token = getattr(current_user, f"{request.provider}_access_token", None)

        if not access_token:
            raise HTTPException(status_code=400, detail=f"No {request.provider} access token found.")

        client = get_git_client(request.provider, access_token)
        result = await client.revoke_access(request.repo_url, request.username)

        if result["success"]:
            # Log the access revocation
            await publish_event(
                "git_access.revoked",
                {
                    "project_id": str(request.project_id),
                    "repo_url": request.repo_url,
                    "username": request.username,
                    "provider": request.provider,
                },
            )

        return AccessControlResponse(**result)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/restore-access", response_model=AccessControlResponse)
async def restore_access(
    request: AccessControlRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Restore repository access to a user (used when Auto-Pause is resolved).

    Requirements: 6.5
    """
    try:
        # Verify project ownership
        result = await db.execute(select(Project).where(Project.id == request.project_id, Project.user_id == current_user.id))
        project = result.scalar_one_or_none()

        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        # Get user's OAuth token for the provider
        access_token = getattr(current_user, f"{request.provider}_access_token", None)

        if not access_token:
            raise HTTPException(status_code=400, detail=f"No {request.provider} access token found.")

        client = get_git_client(request.provider, access_token)
        result = await client.grant_access(request.repo_url, request.username)

        if result["success"]:
            # Log the access restoration
            await publish_event(
                "git_access.restored",
                {
                    "project_id": str(request.project_id),
                    "repo_url": request.repo_url,
                    "username": request.username,
                    "provider": request.provider,
                },
            )

        return AccessControlResponse(**result)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pr-status", response_model=PRStatusResponse)
async def get_pr_status(pr_url: str, provider: str, current_user: User = Depends(get_current_user)):
    """
    Get the status of a pull request.

    Requirements: 8.2
    """
    try:
        # Get user's OAuth token for the provider
        access_token = getattr(current_user, f"{provider}_access_token", None)

        if not access_token:
            raise HTTPException(status_code=400, detail=f"No {provider} access token found.")

        client = get_git_client(provider, access_token)
        result = await client.get_pr_status(pr_url)

        return PRStatusResponse(**result)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Webhook receiver endpoints (public, no authentication)


@router.post("/webhooks/github")
async def github_webhook(
    request: Request,
    x_hub_signature_256: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Receive and process GitHub webhook events.

    Requirements: 5.1, 8.1
    """
    try:
        body = await request.body()

        payload = await request.json()

        # Determine event type
        event_type = request.headers.get("X-GitHub-Event")

        if event_type == "push":
            # Process push event (commits)
            repo_full_name = payload.get("repository", {}).get("full_name")
            commits = payload.get("commits", [])
            pusher = payload.get("pusher", {})

            # Find the repository in our DB
            stmt = (
                select(GitRepository)
                .join(GitIntegration)
                .where(
                    GitRepository.repo_full_name == repo_full_name,
                    GitRepository.is_active == True,
                    GitIntegration.platform == "github",
                )
            )
            result = await db.execute(stmt)
            git_repo = result.scalar_one_or_none()

            if git_repo:
                # Initialize services
                parser = CommitMessageParser()
                linker = DeliverableLinker()

                processed_commits = []

                for commit_data in commits:
                    # Parse commit message to extract tracking code
                    message = commit_data.get("message", "")
                    branch_name = payload.get("ref", "").replace("refs/heads/", "")
                    author_email = commit_data.get("author", {}).get("email")

                    # Use DeliverableLinker to extract tracking code from message or branch
                    tracking_code = linker.extract_code(branch_name, message)

                    logger.debug(
                        "Extracted tracking code: %s from message: %s",
                        tracking_code,
                        message,
                    )

                    # Resolve tracking code to deliverable ID
                    deliverable_id = None
                    if tracking_code:
                        logger.debug("Attempting to resolve tracking code: %s", tracking_code)
                        logger.debug("Repository ID: %s", git_repo.id)
                        logger.debug("Author email: %s", author_email)

                        deliverable_id = await linker.resolve_deliverable_id(db, tracking_code, str(git_repo.id), author_email)

                        logger.debug("Resolved deliverable_id: %s", deliverable_id)

                    # Create GitCommit record
                    from datetime import datetime

                    from dateutil import parser as date_parser

                    try:
                        committed_at = date_parser.parse(commit_data.get("timestamp"))
                        # Convert to UTC and remove timezone info for database storage
                        if committed_at.tzinfo is not None:
                            committed_at = committed_at.astimezone(timezone.utc).replace(tzinfo=None)
                    except:
                        committed_at = datetime.utcnow()

                    # Check if commit already exists (idempotency)
                    existing_stmt = select(GitCommit).where(
                        GitCommit.repository_id == git_repo.id,
                        GitCommit.commit_sha == commit_data.get("id"),
                    )
                    existing = await db.execute(existing_stmt)

                    if not existing.scalar_one_or_none():
                        # Fetch detailed commit stats from GitHub API
                        insertions = 0
                        deletions = 0

                        try:
                            # Get the integration to fetch commit details
                            from ..core.security import decrypt_token

                            integration_result = await db.execute(
                                select(GitIntegration).where(GitIntegration.id == git_repo.integration_id)
                            )
                            integration = integration_result.scalar_one_or_none()

                            if integration:
                                access_token = decrypt_token(integration.access_token)
                                from ..utils.git_providers import GitHubClient

                                github_client = GitHubClient(access_token)

                                # Fetch commit details
                                commit_details = await github_client.get_commit_details(
                                    git_repo.repo_full_name, commit_data.get("id")
                                )

                                if commit_details:
                                    insertions = commit_details.get("stats", {}).get("additions", 0)
                                    deletions = commit_details.get("stats", {}).get("deletions", 0)
                                    logger.debug(
                                        "Fetched commit stats: +%s -%s",
                                        insertions,
                                        deletions,
                                    )
                        except Exception as e:
                            logger.warning("Failed to fetch commit stats: %s", e)
                            # Continue with 0 values

                        new_commit = GitCommit(
                            repository_id=git_repo.id,
                            commit_sha=commit_data.get("id"),
                            author_email=commit_data.get("author", {}).get("email"),
                            author_name=commit_data.get("author", {}).get("name"),
                            message=message,
                            committed_at=committed_at,
                            branch=payload.get("ref", "").replace("refs/heads/", ""),
                            files_changed=len(commit_data.get("added", []))
                            + len(commit_data.get("modified", []))
                            + len(commit_data.get("removed", [])),
                            insertions=insertions,
                            deletions=deletions,
                            deliverable_id=deliverable_id,
                        )
                        db.add(new_commit)
                        processed_commits.append(new_commit)

                if processed_commits:
                    await db.commit()

                    # Publish event for each processed commit
                    for commit in processed_commits:
                        await publish_event(
                            "git.commit_processed",
                            {
                                "commit_id": str(commit.id),
                                "repository_id": str(git_repo.id),
                                "deliverable_id": (str(commit.deliverable_id) if commit.deliverable_id else None),
                                "commit_sha": commit.commit_sha,
                            },
                        )

            await publish_event(
                "git.commit_detected",
                {
                    "provider": "github",
                    "repository": repo_full_name,
                    "ref": payload.get("ref"),
                    "commits": commits,
                    "pusher": pusher,
                    "processed_count": len(processed_commits) if git_repo else 0,
                },
                background=True,  # Non-blocking to prevent errors if NATS streams don't exist
            )

        elif event_type == "pull_request":
            # Process pull request event
            action = payload.get("action")
            pr = payload.get("pull_request", {})

            if action == "opened":
                await publish_event(
                    "git.pr_created",
                    {
                        "provider": "github",
                        "repository": payload.get("repository", {}).get("full_name"),
                        "pr_number": pr.get("number"),
                        "pr_title": pr.get("title"),
                        "pr_url": pr.get("html_url"),
                        "author": pr.get("user", {}).get("login"),
                        "commit_sha": pr.get("head", {}).get("sha"),
                    },
                )

            elif action == "closed" and pr.get("merged"):
                await publish_event(
                    "git.pr_merged",
                    {
                        "provider": "github",
                        "repository": payload.get("repository", {}).get("full_name"),
                        "pr_number": pr.get("number"),
                        "pr_title": pr.get("title"),
                        "pr_url": pr.get("html_url"),
                        "merged_by": pr.get("merged_by", {}).get("login"),
                        "commit_sha": pr.get("merge_commit_sha"),
                    },
                )

        return {"status": "success", "message": "Webhook processed"}

    except Exception as e:
        # Log error but return 200 to prevent webhook retries
        logger.error("Error processing GitHub webhook: %s", e, exc_info=True)
        return {"status": "error", "message": str(e)}


@router.post("/webhooks/gitlab")
async def gitlab_webhook(
    request: Request,
    x_gitlab_token: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Receive and process GitLab webhook events.

    Requirements: 5.1, 8.1
    """
    try:
        payload = await request.json()

        object_kind = payload.get("object_kind")

        if object_kind == "push":
            # Process push event
            repo_full_name = payload.get("project", {}).get("path_with_namespace")
            commits = payload.get("commits", [])
            ref = payload.get("ref", "")
            branch_name = ref.replace("refs/heads/", "")

            # Find the repository in our DB
            stmt = (
                select(GitRepository)
                .join(GitIntegration)
                .where(
                    GitRepository.repo_full_name == repo_full_name,
                    GitRepository.is_active == True,
                    GitIntegration.platform == "gitlab",
                )
            )
            result = await db.execute(stmt)
            git_repo = result.scalar_one_or_none()

            processed_commits = []

            if git_repo:
                # Initialize services
                linker = DeliverableLinker()

                # Get the integration to fetch commit details
                from ..core.security import decrypt_token

                integration_result = await db.execute(
                    select(GitIntegration).where(GitIntegration.id == git_repo.integration_id)
                )
                integration = integration_result.scalar_one_or_none()

                client = None
                if integration:
                    access_token = decrypt_token(integration.access_token)
                    client = GitLabClient(access_token)

                for commit_data in commits:
                    message = commit_data.get("message", "")
                    author_email = commit_data.get("author", {}).get("email")

                    # Extract tracking code
                    tracking_code = linker.extract_code(branch_name, message)

                    # Resolve tracking code to deliverable ID
                    deliverable_id = None
                    if tracking_code:
                        deliverable_id = await linker.resolve_deliverable_id(db, tracking_code, str(git_repo.id), author_email)

                    # Check if commit already exists
                    existing_stmt = select(GitCommit).where(
                        GitCommit.repository_id == git_repo.id,
                        GitCommit.commit_sha == commit_data.get("id"),
                    )
                    existing = await db.execute(existing_stmt)

                    if not existing.scalar_one_or_none():
                        # Fetch detailed commit stats if possible
                        insertions = 0
                        deletions = 0

                        if client:
                            try:
                                commit_details = await client.get_commit_details(repo_full_name, commit_data.get("id"))
                                if commit_details:
                                    insertions = commit_details.get("stats", {}).get("additions", 0)
                                    deletions = commit_details.get("stats", {}).get("deletions", 0)
                            except Exception as e:
                                logger.warning("Failed to fetch GitLab commit stats: %s", e)

                        # Parse timestamp
                        from datetime import datetime

                        from dateutil import parser as date_parser

                        try:
                            committed_at = date_parser.parse(commit_data.get("timestamp"))
                            if committed_at.tzinfo is not None:
                                committed_at = committed_at.astimezone(timezone.utc).replace(tzinfo=None)
                        except:
                            committed_at = datetime.utcnow()

                        new_commit = GitCommit(
                            repository_id=git_repo.id,
                            commit_sha=commit_data.get("id"),
                            author_email=author_email,
                            author_name=commit_data.get("author", {}).get("name"),
                            message=message,
                            committed_at=committed_at,
                            branch=branch_name,
                            files_changed=0,  # GitLab push payload doesn't easily show this without more API calls
                            insertions=insertions,
                            deletions=deletions,
                            deliverable_id=deliverable_id,
                        )
                        db.add(new_commit)
                        processed_commits.append(new_commit)

                if processed_commits:
                    await db.commit()

                    # Publish event for each processed commit
                    for commit in processed_commits:
                        await publish_event(
                            "git.commit_processed",
                            {
                                "commit_id": str(commit.id),
                                "repository_id": str(git_repo.id),
                                "deliverable_id": (str(commit.deliverable_id) if commit.deliverable_id else None),
                                "commit_sha": commit.commit_sha,
                            },
                        )

            await publish_event(
                "git.commit_detected",
                {
                    "provider": "gitlab",
                    "repository": repo_full_name,
                    "ref": ref,
                    "commits": commits,
                    "user": payload.get("user_name"),
                    "processed_count": len(processed_commits),
                },
                background=True,
            )

        elif object_kind == "merge_request":
            # Process merge request event
            mr = payload.get("object_attributes", {})
            action = mr.get("action")

            if action == "open":
                await publish_event(
                    "git.pr_created",
                    {
                        "provider": "gitlab",
                        "repository": payload.get("project", {}).get("path_with_namespace"),
                        "pr_number": mr.get("iid"),
                        "pr_title": mr.get("title"),
                        "pr_url": mr.get("url"),
                        "author": payload.get("user", {}).get("username"),
                        "commit_sha": mr.get("last_commit", {}).get("id"),
                    },
                )

            elif action == "merge":
                await publish_event(
                    "git.pr_merged",
                    {
                        "provider": "gitlab",
                        "repository": payload.get("project", {}).get("path_with_namespace"),
                        "pr_number": mr.get("iid"),
                        "pr_title": mr.get("title"),
                        "pr_url": mr.get("url"),
                        "merged_by": payload.get("user", {}).get("username"),
                        "commit_sha": mr.get("merge_commit_sha"),
                    },
                )

        return {"status": "success", "message": "Webhook processed"}

    except Exception as e:
        logger.error("Error processing GitLab webhook: %s", e, exc_info=True)
        return {"status": "error", "message": str(e)}


@router.post("/webhooks/bitbucket")
async def bitbucket_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Receive and process Bitbucket webhook events.

    Requirements: 5.1, 8.1
    """
    try:
        payload = await request.json()

        # Determine event type from headers
        event_type = request.headers.get("X-Event-Key")

        if event_type == "repo:push":
            # Process push event
            push_data = payload.get("push", {})
            changes = push_data.get("changes", [])

            # Extract commits from changes
            commits = []
            for change in changes:
                if change.get("commits"):
                    commits.extend(change["commits"])

            await publish_event(
                "git.commit_detected",
                {
                    "provider": "bitbucket",
                    "repository": payload.get("repository", {}).get("full_name"),
                    "commits": commits,
                    "user": payload.get("actor", {}).get("display_name"),
                },
            )

        elif event_type in [
            "pullrequest:created",
            "pullrequest:updated",
            "pullrequest:fulfilled",
        ]:
            # Process pull request event
            pr = payload.get("pullrequest", {})

            if event_type == "pullrequest:created":
                await publish_event(
                    "git.pr_created",
                    {
                        "provider": "bitbucket",
                        "repository": payload.get("repository", {}).get("full_name"),
                        "pr_number": pr.get("id"),
                        "pr_title": pr.get("title"),
                        "pr_url": pr.get("links", {}).get("html", {}).get("href"),
                        "author": pr.get("author", {}).get("display_name"),
                        "commit_sha": pr.get("source", {}).get("commit", {}).get("hash"),
                    },
                )

            elif event_type == "pullrequest:fulfilled":
                await publish_event(
                    "git.pr_merged",
                    {
                        "provider": "bitbucket",
                        "repository": payload.get("repository", {}).get("full_name"),
                        "pr_number": pr.get("id"),
                        "pr_title": pr.get("title"),
                        "pr_url": pr.get("links", {}).get("html", {}).get("href"),
                        "merged_by": payload.get("actor", {}).get("display_name"),
                        "commit_sha": pr.get("merge_commit", {}).get("hash"),
                    },
                )

        return {"status": "success", "message": "Webhook processed"}

    except Exception as e:
        logger.error("Error processing Bitbucket webhook: %s", e, exc_info=True)
        return {"status": "error", "message": str(e)}
