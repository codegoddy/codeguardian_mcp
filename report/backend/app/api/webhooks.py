"""Git webhook handlers"""

import hashlib
import hmac
import json
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging_config import get_logger
from app.db.database import get_db
from app.models.git_repository import GitRepository
from app.models.time_tracking import CommitReview
from app.services.commit_parser import CommitMessageParser
from app.services.deliverable_linker import DeliverableLinker
from app.services.nats_service import TimeTrackingNATSService

logger = get_logger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


def verify_github_signature(payload_body: bytes, signature: str, secret: str) -> bool:
    """Verify GitHub webhook signature"""
    if not signature:
        return False

    # GitHub sends signature as "sha256=<hash>"
    if not signature.startswith("sha256="):
        return False

    expected_signature = signature.split("=")[1]

    # Calculate HMAC
    mac = hmac.new(secret.encode("utf-8"), msg=payload_body, digestmod=hashlib.sha256)

    return hmac.compare_digest(mac.hexdigest(), expected_signature)


def verify_gitlab_token(token: str, secret: str) -> bool:
    """Verify GitLab webhook token"""
    return token == secret


def verify_bitbucket_signature(payload_body: bytes, signature: str, secret: str) -> bool:
    """Verify Bitbucket webhook signature"""
    if not signature:
        return False

    if not signature.startswith("sha256="):
        return False

    expected_signature = signature.split("=")[1]

    mac = hmac.new(secret.encode("utf-8"), msg=payload_body, digestmod=hashlib.sha256)

    return hmac.compare_digest(mac.hexdigest(), expected_signature)


@router.post("/github")
async def handle_github_webhook(
    request: Request,
    x_hub_signature_256: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Handle GitHub push events

    Webhook URL: https://your-domain.com/api/webhooks/github
    Content type: application/json
    Events: push
    """

    # Get raw payload for signature verification
    payload_body = await request.body()

    # Verify signature (skip in development if secret not set)
    github_secret = settings.webhook_secrets.get("github", "")
    if github_secret and x_hub_signature_256:
        if not verify_github_signature(payload_body, x_hub_signature_256, github_secret):
            raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse payload
    payload = json.loads(payload_body)

    # Get repository and commits
    repository = payload.get("repository", {})
    repo_name = repository.get("full_name", "unknown")
    commits = payload.get("commits", [])

    if not commits:
        return {"status": "success", "message": "No commits to process"}

    # Find the linked GitRepository
    # We might have multiple projects linked to the same repo, so we get all matches
    repo_result = await db.execute(
        select(GitRepository).where(GitRepository.repo_full_name == repo_name, GitRepository.is_active == True)
    )
    git_repos = repo_result.scalars().all()

    if not git_repos:
        logger.warning("No active project found for repository: %s", repo_name)
        return {
            "status": "success",
            "message": "Repository not linked to any active project",
        }

    # Initialize services
    parser = CommitMessageParser()
    linker = DeliverableLinker()

    processed_commits = []

    for commit in commits:
        commit_message = commit["message"]
        commit_hash = commit["id"]
        author_email = commit["author"].get("email")

        # 1. Try to extract tracking code (e.g. WEB-123)
        # We check branch name (if available in payload) and commit message
        branch_name = payload.get("ref", "").replace("refs/heads/", "")
        tracking_code = linker.extract_code(branch_name, commit_message)

        deliverable_id = None
        project_id = None

        if tracking_code:
            # Try to resolve to a deliverable in one of the linked projects
            for repo in git_repos:
                resolved_id = await linker.resolve_deliverable_id(db, tracking_code, repo.id, author_email)
                if resolved_id:
                    deliverable_id = resolved_id
                    project_id = repo.project_id
                    break

        # 2. Parse time and status
        parsed = await parser.parse_commit(commit_message)

        # Only process if we found a valid deliverable ID (UUID)
        if deliverable_id and project_id:
            # Create commit review
            review = CommitReview(
                project_id=project_id,
                commit_hash=commit_hash,
                commit_message=commit_message,
                commit_author=author_email or commit["author"].get("username"),
                commit_timestamp=datetime.fromisoformat(commit["timestamp"].replace("Z", "+00:00")),
                deliverable_id=UUID(deliverable_id),
                parsed_hours=parsed["manual_time"],
                status="pending",
            )

            db.add(review)
            processed_commits.append(
                {
                    "commit_hash": commit_hash[:7],
                    "deliverable_id": str(deliverable_id),
                    "parsed_hours": parsed["manual_time"],
                    "status": parsed["status"],
                }
            )

    await db.commit()

    # Send NATS notification for pending reviews
    if processed_commits:
        for commit_data in processed_commits:
            await TimeTrackingNATSService.publish_commit_review(
                {
                    "commit_hash": commit_data["commit_hash"],
                    "deliverable_id": commit_data["deliverable_id"],
                    "parsed_hours": commit_data["parsed_hours"],
                    "status": commit_data["status"],
                    "repository": repo_name,
                    "provider": "github",
                }
            )

    return {
        "status": "success",
        "repository": repo_name,
        "total_commits": len(commits),
        "processed_commits": len(processed_commits),
        "commits": processed_commits,
    }


@router.post("/gitlab")
async def handle_gitlab_webhook(
    request: Request,
    x_gitlab_token: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Handle GitLab push events

    Webhook URL: https://your-domain.com/api/webhooks/gitlab
    Trigger: Push events
    """

    # Verify token
    gitlab_secret = settings.webhook_secrets.get("gitlab", "")
    if gitlab_secret and x_gitlab_token:
        if not verify_gitlab_token(x_gitlab_token, gitlab_secret):
            raise HTTPException(status_code=401, detail="Invalid token")

    # Parse payload
    payload = await request.json()

    # Get repository and commits
    repository = payload.get("project", {})
    repo_name = repository.get("path_with_namespace", "unknown")
    commits = payload.get("commits", [])

    if not commits:
        return {"status": "success", "message": "No commits to process"}

    # Initialize parser
    parser = CommitMessageParser()

    processed_commits = []

    for commit in commits:
        # Parse commit message
        parsed = await parser.parse_commit(commit["message"])

        # Only process if we found a deliverable ID
        if parsed["deliverable_id"]:
            # Create commit review
            review = CommitReview(
                project_id=1,  # TODO: Get actual project_id from repo mapping
                commit_hash=commit["id"],
                commit_message=commit["message"],
                commit_author=commit["author"].get("email"),
                commit_timestamp=datetime.fromisoformat(commit["timestamp"].replace("Z", "+00:00")),
                deliverable_id=parsed["deliverable_id"],
                parsed_hours=parsed["manual_time"],
                status="pending",
            )

            db.add(review)
            processed_commits.append(
                {
                    "commit_hash": commit["id"][:7],
                    "deliverable_id": parsed["deliverable_id"],
                    "parsed_hours": parsed["manual_time"],
                }
            )

    await db.commit()

    # Send NATS notification for pending reviews
    if processed_commits:
        for commit_data in processed_commits:
            await TimeTrackingNATSService.publish_commit_review(
                {
                    "commit_hash": commit_data["commit_hash"],
                    "deliverable_id": commit_data["deliverable_id"],
                    "parsed_hours": commit_data["parsed_hours"],
                    "repository": repo_name,
                    "provider": "gitlab",
                }
            )

    return {
        "status": "success",
        "repository": repo_name,
        "total_commits": len(commits),
        "processed_commits": len(processed_commits),
        "commits": processed_commits,
    }


@router.post("/bitbucket")
async def handle_bitbucket_webhook(
    request: Request,
    x_hub_signature: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Handle Bitbucket push events

    Webhook URL: https://your-domain.com/api/webhooks/bitbucket
    Trigger: Repository push
    """

    # Get raw payload for signature verification
    payload_body = await request.body()

    # Verify signature
    bitbucket_secret = settings.webhook_secrets.get("bitbucket", "")
    if bitbucket_secret and x_hub_signature:
        if not verify_bitbucket_signature(payload_body, x_hub_signature, bitbucket_secret):
            raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse payload
    payload = json.loads(payload_body)

    # Get repository and commits
    repository = payload.get("repository", {})
    repo_name = repository.get("full_name", "unknown")

    # Bitbucket structure is different
    push = payload.get("push", {})
    changes = push.get("changes", [])

    all_commits = []
    for change in changes:
        commits = change.get("commits", [])
        all_commits.extend(commits)

    if not all_commits:
        return {"status": "success", "message": "No commits to process"}

    # Initialize parser
    parser = CommitMessageParser()

    processed_commits = []

    for commit in all_commits:
        # Parse commit message
        parsed = await parser.parse_commit(commit["message"])

        # Only process if we found a deliverable ID
        if parsed["deliverable_id"]:
            # Create commit review
            review = CommitReview(
                project_id=1,  # TODO: Get actual project_id from repo mapping
                commit_hash=commit["hash"],
                commit_message=commit["message"],
                commit_author=commit["author"].get("raw"),
                commit_timestamp=datetime.fromisoformat(commit["date"].replace("Z", "+00:00")),
                deliverable_id=parsed["deliverable_id"],
                parsed_hours=parsed["manual_time"],
                status="pending",
            )

            db.add(review)
            processed_commits.append(
                {
                    "commit_hash": commit["hash"][:7],
                    "deliverable_id": parsed["deliverable_id"],
                    "parsed_hours": parsed["manual_time"],
                }
            )

    await db.commit()

    # Send NATS notification for pending reviews
    if processed_commits:
        for commit_data in processed_commits:
            await TimeTrackingNATSService.publish_commit_review(
                {
                    "commit_hash": commit_data["commit_hash"],
                    "deliverable_id": commit_data["deliverable_id"],
                    "parsed_hours": commit_data["parsed_hours"],
                    "repository": repo_name,
                    "provider": "bitbucket",
                }
            )

    return {
        "status": "success",
        "repository": repo_name,
        "total_commits": len(all_commits),
        "processed_commits": len(processed_commits),
        "commits": processed_commits,
    }


@router.get("/test")
async def test_webhook():
    """Test endpoint to verify webhooks are working"""
    return {
        "status": "ok",
        "message": "Webhook endpoint is accessible",
        "endpoints": {
            "github": "/api/webhooks/github",
            "gitlab": "/api/webhooks/gitlab",
            "bitbucket": "/api/webhooks/bitbucket",
        },
    }
