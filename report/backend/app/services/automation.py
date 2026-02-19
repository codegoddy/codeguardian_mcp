"""Automation service for Git-driven deliverable management."""

from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..core.logging_config import get_logger
from ..models.deliverable import Deliverable
from ..models.git_commit import GitCommit
from ..models.git_repository import GitRepository
from ..models.project import Project
from ..services.changelog_generator import ChangelogGenerator
from ..services.commit_parser import CommitMessageParser
from ..services.deliverable_linker import DeliverableLinker
from ..utils.nats_client import publish_event

logger = get_logger(__name__)


class CommitProcessor:
    """Process Git commits for deliverable updates (status, documentation)."""

    @staticmethod
    async def update_deliverables_from_commits(
        commits: List[Dict[str, Any]], repository: str, provider: str, db: AsyncSession
    ) -> None:
        """
        Process a list of commits to update linked deliverables.

        Args:
            commits: List of commit data from webhook
            repository: Repository full name (e.g., "owner/repo")
            provider: Git provider ('github', 'gitlab', 'bitbucket')
            db: Database session
        """
        # Find GitRepository - try multiple lookup strategies
        logger.debug("Looking for repository: %s", repository)

        # Strategy 1: Exact match on repo_full_name
        repo_result = await db.execute(
            select(GitRepository).where(
                GitRepository.repo_full_name == repository,
                GitRepository.is_active == True,
            )
        )
        git_repo = repo_result.scalar_one_or_none()

        # Strategy 2: If not found, try matching repo_url containing the repository name
        if not git_repo:
            logger.debug("Exact match failed, trying URL match...")
            repo_result = await db.execute(
                select(GitRepository).where(
                    GitRepository.repo_url.contains(repository),
                    GitRepository.is_active == True,
                )
            )
            git_repo = repo_result.scalar_one_or_none()

        # Strategy 3: If still not found, try extracting owner/repo from URL format
        if not git_repo and "/" in repository:
            # Extract just the repo name part
            repo_name = repository.split("/")[-1]
            logger.debug("Trying repo name only: %s", repo_name)
            repo_result = await db.execute(
                select(GitRepository).where(
                    GitRepository.repo_name == repo_name,
                    GitRepository.is_active == True,
                )
            )
            git_repo = repo_result.scalar_one_or_none()

        if not git_repo:
            # List all active repositories for debugging
            all_repos_result = await db.execute(select(GitRepository).where(GitRepository.is_active == True))
            all_repos = all_repos_result.scalars().all()
            logger.debug("No repository found for: %s", repository)
            logger.debug("Active repositories in database:")
            for repo in all_repos:
                logger.debug(
                    "  - repo_full_name: %s, repo_url: %s, repo_name: %s",
                    repo.repo_full_name,
                    repo.repo_url,
                    repo.repo_name,
                )
            return

        for commit_data in commits:
            commit_sha = commit_data.get("id") or commit_data.get("hash")
            if not commit_sha:
                continue

            # Find the GitCommit record (should have been created by webhook handler)
            commit_result = await db.execute(
                select(GitCommit).where(
                    GitCommit.repository_id == git_repo.id,
                    GitCommit.commit_sha == commit_sha,
                )
            )
            git_commit = commit_result.scalar_one_or_none()

            if not git_commit or not git_commit.deliverable_id:
                continue

            # Load Deliverable with git_commits relationship
            deliverable_result = await db.execute(
                select(Deliverable)
                .options(selectinload(Deliverable.git_commits))
                .where(Deliverable.id == git_commit.deliverable_id)
            )
            deliverable = deliverable_result.scalar_one_or_none()

            if not deliverable:
                continue

            # Update Deliverable Status
            if deliverable.status == "pending":
                deliverable.status = "in_progress"
                logger.debug("Auto-started deliverable %s", deliverable.id)

            # Update Work Type if missing
            if not deliverable.work_type:
                # Parse message to guess type
                parser = CommitMessageParser()
                parse_result = await parser.parse_commit(git_commit.message)
                commit_type = parse_result.get("commit_type")

                if commit_type:
                    type_map = {
                        "feat": "feature",
                        "fix": "bugfix",
                        "docs": "documentation",
                        "style": "refactor",
                        "refactor": "refactor",
                        "test": "other",
                        "chore": "other",
                    }
                    deliverable.work_type = type_map.get(commit_type, "other")
                    logger.debug(
                        "Auto-set work type for deliverable %s to %s",
                        deliverable.id,
                        deliverable.work_type,
                    )

            # Generate/Update Documentation (git_commits already loaded)
            if ChangelogGenerator.update_deliverable_documentation(deliverable):
                logger.debug("Updated documentation for deliverable %s", deliverable.id)

            await db.commit()

            # Publish real-time deliverable stats update
            try:
                from app.utils.nats_publishers import publish_deliverable_stats_updated

                # Get project to find user_id
                project_result = await db.execute(select(Project).where(Project.id == deliverable.project_id))
                project = project_result.scalar_one_or_none()

                if project:
                    # Calculate budget used percentage
                    budget_used = 0
                    if deliverable.estimated_hours and deliverable.estimated_hours > 0:
                        budget_used = (float(deliverable.actual_hours or 0) / float(deliverable.estimated_hours)) * 100

                    await publish_deliverable_stats_updated(
                        {
                            "deliverable_id": str(deliverable.id),
                            "project_id": str(deliverable.project_id),
                            "actual_hours": float(deliverable.actual_hours or 0),
                            "total_cost": float(deliverable.total_cost or 0),
                            "budget_used_percentage": float(budget_used),
                            "user_id": str(project.user_id),
                        }
                    )
            except Exception as e:
                logger.warning("Failed to publish deliverable stats update in automation: %s", e)


class DeliverableAutomation:
    """Automate deliverable status updates based on PR events."""

    @staticmethod
    async def link_pr_to_deliverable(pr_data: Dict[str, Any], repository: str, db: AsyncSession) -> Optional[Dict[str, Any]]:
        """
        Link a pull request to a deliverable based on task reference.

        Args:
            pr_data: PR data from webhook
            repository: Repository full name
            db: Database session

        Returns:
            Updated deliverable data or None
        """
        linker = DeliverableLinker()

        # Extract task reference from PR title or description
        pr_title = pr_data.get("pr_title", pr_data.get("title", ""))
        task_ref = linker.extract_code(None, pr_title)

        if not task_ref:
            logger.debug("No task reference found in PR: %s", pr_title)
            return None

        # Publish event for deliverable service to handle
        await publish_event(
            "git.pr_created",
            {
                "repository": repository,
                "pr_number": pr_data.get("pr_number"),
                "pr_title": pr_title,
                "pr_url": pr_data.get("pr_url"),
                "task_reference": task_ref,
                "author": pr_data.get("author"),
                "commit_sha": pr_data.get("commit_sha"),
            },
        )

        return {"task_reference": task_ref, "pr_linked": True}

    @staticmethod
    async def handle_pr_merged(pr_data: Dict[str, Any], repository: str, db: AsyncSession) -> Optional[Dict[str, Any]]:
        """
        Handle PR merge event - mark deliverable as completed.

        Args:
            pr_data: PR data from webhook
            repository: Repository full name
            db: Database session

        Returns:
            Updated deliverable data or None
        """
        linker = DeliverableLinker()

        # Extract task reference
        pr_title = pr_data.get("pr_title", pr_data.get("title", ""))
        task_ref = linker.extract_code(None, pr_title)

        if not task_ref:
            return None

        # Publish event for deliverable service to handle
        await publish_event(
            "git.pr_merged",
            {
                "repository": repository,
                "pr_number": pr_data.get("pr_number"),
                "pr_title": pr_title,
                "pr_url": pr_data.get("pr_url"),
                "task_reference": task_ref,
                "merged_by": pr_data.get("merged_by"),
                "commit_sha": pr_data.get("commit_sha"),
            },
        )

        return {"task_reference": task_ref, "deliverable_completed": True}


async def handle_commit_event(event_data: Dict[str, Any], db: AsyncSession):
    """
    Handle commit detected event from NATS.

    Args:
        event_data: Event data from webhook
        db: Database session
    """
    commits = event_data.get("commits", [])
    repository = event_data.get("repository")
    provider = event_data.get("provider")

    if not commits or not repository:
        return

    await CommitProcessor.update_deliverables_from_commits(commits, repository, provider, db)


async def handle_pr_created_event(event_data: Dict[str, Any], db: AsyncSession):
    """
    Handle PR created event from NATS.

    Args:
        event_data: Event data from webhook
        db: Database session
    """
    repository = event_data.get("repository")

    if not repository:
        return

    result = await DeliverableAutomation.link_pr_to_deliverable(event_data, repository, db)

    if result:
        logger.info("Linked PR to deliverable: %s", result["task_reference"])


async def handle_pr_merged_event(event_data: Dict[str, Any], db: AsyncSession):
    """
    Handle PR merged event from NATS.

    Args:
        event_data: Event data from webhook
        db: Database session
    """
    repository = event_data.get("repository")

    if not repository:
        return

    result = await DeliverableAutomation.handle_pr_merged(event_data, repository, db)

    if result:
        logger.info("Marked deliverable as completed: %s", result["task_reference"])

        # Publish deliverable status changed event for client notification
        await publish_event(
            "deliverable.status_changed",
            {
                "task_reference": result["task_reference"],
                "status": "completed",
                "pr_url": event_data.get("pr_url"),
                "repository": repository,
            },
        )
