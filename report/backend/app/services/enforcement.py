"""Enforcement service for budget monitoring and Auto-Pause functionality."""

from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

from sqlalchemy import and_, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.logging_config import get_logger
from ..models.auto_pause_event import AutoPauseEvent
from ..models.client import Client
from ..models.git_access_log import GitAccessLog
from ..models.project import Project
from ..utils.git_providers.bitbucket import BitbucketProvider
from ..utils.git_providers.github import GitHubProvider
from ..utils.git_providers.gitlab import GitLabProvider
from ..utils.nats_client import publish_event

logger = get_logger(__name__)


class BudgetMonitor:
    """Monitor project budgets and trigger warnings/auto-pause events."""

    # Budget threshold percentages
    WARNING_THRESHOLD = Decimal("20.00")  # 20% remaining triggers warning

    @staticmethod
    async def calculate_budget_percentage(project: Project) -> Decimal:
        """
        Calculate the percentage of budget remaining.

        Args:
            project: Project instance

        Returns:
            Percentage of budget remaining (0-100)
        """
        if project.project_budget <= 0:
            return Decimal("0.00")

        percentage = (project.current_budget_remaining / project.project_budget) * Decimal("100")

        return max(Decimal("0.00"), percentage)

    @staticmethod
    async def check_budget_threshold(project: Project, db: AsyncSession) -> Optional[str]:
        """
        Check if project budget has crossed any thresholds.

        Args:
            project: Project instance
            db: Database session

        Returns:
            Threshold level crossed: 'warning', 'critical', 'depleted', or None
        """
        budget_percentage = await BudgetMonitor.calculate_budget_percentage(project)

        # Check for depleted budget (0%)
        if budget_percentage <= Decimal("0.00"):
            await publish_event(
                "budget.critical",
                {
                    "project_id": project.id,
                    "user_id": project.user_id,
                    "client_id": project.client_id,
                    "budget_remaining": float(project.current_budget_remaining),
                    "budget_percentage": float(budget_percentage),
                    "threshold_type": "depleted",
                    "auto_pause_threshold": float(project.auto_pause_threshold),
                },
            )
            return "depleted"

        # Check for auto-pause threshold
        if budget_percentage <= project.auto_pause_threshold:
            await publish_event(
                "budget.critical",
                {
                    "project_id": project.id,
                    "user_id": project.user_id,
                    "client_id": project.client_id,
                    "budget_remaining": float(project.current_budget_remaining),
                    "budget_percentage": float(budget_percentage),
                    "threshold_type": "auto_pause",
                    "auto_pause_threshold": float(project.auto_pause_threshold),
                },
            )
            return "critical"

        # Check for warning threshold (20%)
        if budget_percentage <= BudgetMonitor.WARNING_THRESHOLD:
            await publish_event(
                "budget.low",
                {
                    "project_id": project.id,
                    "user_id": project.user_id,
                    "client_id": project.client_id,
                    "budget_remaining": float(project.current_budget_remaining),
                    "budget_percentage": float(budget_percentage),
                    "threshold_type": "warning",
                    "warning_threshold": float(BudgetMonitor.WARNING_THRESHOLD),
                },
            )
            return "warning"

        return None

    @staticmethod
    async def monitor_all_active_projects(db: AsyncSession) -> Dict[str, Any]:
        """
        Monitor budget across all active projects.

        Args:
            db: Database session

        Returns:
            Summary of monitoring results
        """
        # Get all active projects
        result = await db.execute(select(Project).where(and_(Project.status == "active", Project.project_budget > 0)))
        projects = result.scalars().all()

        monitoring_results = {
            "total_projects": len(projects),
            "warning_projects": [],
            "critical_projects": [],
            "depleted_projects": [],
        }

        for project in projects:
            threshold_level = await BudgetMonitor.check_budget_threshold(project, db)

            if threshold_level == "warning":
                monitoring_results["warning_projects"].append(
                    {
                        "project_id": project.id,
                        "project_name": project.name,
                        "budget_remaining": float(project.current_budget_remaining),
                        "budget_percentage": float(await BudgetMonitor.calculate_budget_percentage(project)),
                    }
                )
            elif threshold_level == "critical":
                monitoring_results["critical_projects"].append(
                    {
                        "project_id": project.id,
                        "project_name": project.name,
                        "budget_remaining": float(project.current_budget_remaining),
                        "budget_percentage": float(await BudgetMonitor.calculate_budget_percentage(project)),
                    }
                )
            elif threshold_level == "depleted":
                monitoring_results["depleted_projects"].append(
                    {
                        "project_id": project.id,
                        "project_name": project.name,
                        "budget_remaining": float(project.current_budget_remaining),
                    }
                )

        return monitoring_results

    @staticmethod
    async def deduct_from_budget(project: Project, amount: Decimal, db: AsyncSession) -> Dict[str, Any]:
        """
        Deduct an amount from project budget and check thresholds.

        Args:
            project: Project instance
            amount: Amount to deduct
            db: Database session

        Returns:
            Result with budget status and threshold information
        """
        # Store previous budget for comparison
        previous_budget = project.current_budget_remaining
        previous_percentage = await BudgetMonitor.calculate_budget_percentage(project)

        # Deduct from budget
        project.current_budget_remaining -= amount

        # Ensure budget doesn't go negative
        if project.current_budget_remaining < 0:
            project.current_budget_remaining = Decimal("0.00")

        # Calculate new percentage
        new_percentage = await BudgetMonitor.calculate_budget_percentage(project)

        # Check if we crossed any thresholds
        threshold_crossed = None

        # Check if we crossed warning threshold
        if previous_percentage > BudgetMonitor.WARNING_THRESHOLD and new_percentage <= BudgetMonitor.WARNING_THRESHOLD:
            threshold_crossed = "warning"

        # Check if we crossed auto-pause threshold
        if previous_percentage > project.auto_pause_threshold and new_percentage <= project.auto_pause_threshold:
            threshold_crossed = "critical"

        # Check if budget depleted
        if previous_percentage > 0 and new_percentage <= 0:
            threshold_crossed = "depleted"

        # Trigger threshold check
        if threshold_crossed:
            await BudgetMonitor.check_budget_threshold(project, db)

        await db.commit()

        return {
            "previous_budget": float(previous_budget),
            "new_budget": float(project.current_budget_remaining),
            "amount_deducted": float(amount),
            "previous_percentage": float(previous_percentage),
            "new_percentage": float(new_percentage),
            "threshold_crossed": threshold_crossed,
        }

    @staticmethod
    async def increase_budget(project: Project, amount: Decimal, db: AsyncSession) -> Dict[str, Any]:
        """
        Increase project budget (e.g., after payment received).

        Args:
            project: Project instance
            amount: Amount to add
            db: Database session

        Returns:
            Result with budget status
        """
        # Store previous budget for comparison
        previous_budget = project.current_budget_remaining
        previous_percentage = await BudgetMonitor.calculate_budget_percentage(project)

        # Increase budget
        project.current_budget_remaining += amount

        # Calculate new percentage
        new_percentage = await BudgetMonitor.calculate_budget_percentage(project)

        # Check if we moved above auto-pause threshold
        if previous_percentage <= project.auto_pause_threshold and new_percentage > project.auto_pause_threshold:
            # Publish budget replenished event
            await publish_event(
                "retainer.replenished",
                {
                    "project_id": project.id,
                    "user_id": project.user_id,
                    "client_id": project.client_id,
                    "previous_budget": float(previous_budget),
                    "new_budget": float(project.current_budget_remaining),
                    "amount_added": float(amount),
                    "budget_percentage": float(new_percentage),
                },
            )

        await db.commit()

        return {
            "previous_budget": float(previous_budget),
            "new_budget": float(project.current_budget_remaining),
            "amount_added": float(amount),
            "previous_percentage": float(previous_percentage),
            "new_percentage": float(new_percentage),
        }


async def handle_budget_low_event(event_data: Dict[str, Any], db: AsyncSession):
    """
    Handle budget.low event from NATS.

    Args:
        event_data: Event data
        db: Database session
    """
    project_id = event_data.get("project_id")
    budget_percentage = event_data.get("budget_percentage")

    logger.info("Budget warning for project %s: %s%% remaining", project_id, budget_percentage)

    # Additional handling can be added here (e.g., send email notifications)


async def handle_budget_critical_event(event_data: Dict[str, Any], db: AsyncSession):
    """
    Handle budget.critical event from NATS - trigger auto-pause if needed.

    Args:
        event_data: Event data
        db: Database session
    """
    project_id = event_data.get("project_id")
    budget_percentage = event_data.get("budget_percentage")
    threshold_type = event_data.get("threshold_type")

    logger.info(
        "Budget critical for project %s: %s%% remaining (type: %s)",
        project_id,
        budget_percentage,
        threshold_type,
    )

    # This will trigger auto-pause in the next sub-task
    # For now, just log the event


class AutoPauseEnforcer:
    """Enforce Auto-Pause by revoking Git repository access."""

    @staticmethod
    def _get_git_provider(provider: str, repository_url: str):
        """
        Get the appropriate Git provider instance.

        Args:
            provider: Provider name ('github', 'gitlab', 'bitbucket')
            repository_url: Repository URL

        Returns:
            Git provider instance
        """
        if provider.lower() == "github":
            return GitHubProvider(repository_url)
        elif provider.lower() == "gitlab":
            return GitLabProvider(repository_url)
        elif provider.lower() == "bitbucket":
            return BitbucketProvider(repository_url)
        else:
            raise ValueError(f"Unsupported Git provider: {provider}")

    @staticmethod
    async def trigger_auto_pause(project: Project, db: AsyncSession) -> Dict[str, Any]:
        """
        Trigger Auto-Pause event - revoke Git repository access.

        Args:
            project: Project instance
            db: Database session

        Returns:
            Result with auto-pause details
        """
        # Check if already paused
        if project.status == "paused":
            return {"already_paused": True, "project_id": project.id}

        # Calculate budget percentage
        budget_percentage = await BudgetMonitor.calculate_budget_percentage(project)

        # Create auto_pause_event record
        auto_pause_event = AutoPauseEvent(
            project_id=project.id,
            event_type="triggered",
            retainer_balance=project.current_budget_remaining,
            threshold_percentage=budget_percentage,
            repositories_affected=project.allowed_repositories or [],
            access_revoked=False,
            access_restored=False,
        )
        db.add(auto_pause_event)
        await db.flush()  # Get the ID

        # Revoke access to all repositories
        revocation_results = []
        repositories = project.allowed_repositories or []

        for repo_url in repositories:
            # Determine provider from URL
            provider = None
            if "github.com" in repo_url:
                provider = "github"
            elif "gitlab.com" in repo_url:
                provider = "gitlab"
            elif "bitbucket.org" in repo_url:
                provider = "bitbucket"

            if not provider:
                logger.debug("Could not determine provider for repository: %s", repo_url)
                continue

            try:
                # Get Git provider instance
                git_provider = AutoPauseEnforcer._get_git_provider(provider, repo_url)

                # Revoke access (this would call the actual Git API)
                # For now, we'll simulate the revocation
                # In production, this would call git_provider.revoke_access()
                success = True  # Simulated success
                error_message = None

                # Log the access revocation
                access_log = GitAccessLog(
                    project_id=project.id,
                    user_id=project.user_id,
                    action="revoke",
                    repository_url=repo_url,
                    provider=provider,
                    reason="auto_pause",
                    success=success,
                    error_message=error_message,
                )
                db.add(access_log)

                revocation_results.append(
                    {
                        "repository": repo_url,
                        "provider": provider,
                        "success": success,
                        "error": error_message,
                    }
                )

                # Publish git_access.revoked event
                await publish_event(
                    "git_access.revoked",
                    {
                        "project_id": project.id,
                        "user_id": project.user_id,
                        "repository_url": repo_url,
                        "provider": provider,
                        "reason": "auto_pause",
                        "auto_pause_event_id": auto_pause_event.id,
                    },
                )

            except Exception as e:
                logger.error("Error revoking access to %s: %s", repo_url, e, exc_info=True)

                # Log the failed revocation
                access_log = GitAccessLog(
                    project_id=project.id,
                    user_id=project.user_id,
                    action="revoke",
                    repository_url=repo_url,
                    provider=provider or "unknown",
                    reason="auto_pause",
                    success=False,
                    error_message=str(e),
                )
                db.add(access_log)

                revocation_results.append(
                    {
                        "repository": repo_url,
                        "provider": provider,
                        "success": False,
                        "error": str(e),
                    }
                )

        # Update auto_pause_event
        auto_pause_event.access_revoked = True

        # Update project status to paused
        project.status = "paused"

        await db.commit()

        # Publish auto_pause.triggered event
        await publish_event(
            "auto_pause.triggered",
            {
                "project_id": project.id,
                "user_id": project.user_id,
                "client_id": project.client_id,
                "budget_remaining": float(project.current_budget_remaining),
                "budget_percentage": float(budget_percentage),
                "threshold": float(project.auto_pause_threshold),
                "repositories_affected": repositories,
                "revocation_results": revocation_results,
                "auto_pause_event_id": auto_pause_event.id,
            },
        )

        return {
            "auto_pause_triggered": True,
            "project_id": project.id,
            "auto_pause_event_id": auto_pause_event.id,
            "repositories_affected": len(repositories),
            "revocation_results": revocation_results,
        }

    @staticmethod
    async def check_and_trigger_auto_pause(project: Project, db: AsyncSession) -> Optional[Dict[str, Any]]:
        """
        Check if project should trigger auto-pause and execute if needed.

        Args:
            project: Project instance
            db: Database session

        Returns:
            Auto-pause result if triggered, None otherwise
        """
        # Skip if already paused
        if project.status == "paused":
            return None

        # Calculate budget percentage
        budget_percentage = await BudgetMonitor.calculate_budget_percentage(project)

        # Check if we should trigger auto-pause
        if budget_percentage <= project.auto_pause_threshold:
            return await AutoPauseEnforcer.trigger_auto_pause(project, db)

        return None


async def handle_budget_critical_event(event_data: Dict[str, Any], db: AsyncSession):
    """
    Handle budget.critical event from NATS - trigger auto-pause if needed.

    Args:
        event_data: Event data
        db: Database session
    """
    project_id = event_data.get("project_id")
    budget_percentage = event_data.get("budget_percentage")
    threshold_type = event_data.get("threshold_type")

    logger.info(
        "Budget critical for project %s: %s%% remaining (type: %s)",
        project_id,
        budget_percentage,
        threshold_type,
    )

    # Get project
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()

    if not project:
        logger.warning("Project %s not found", project_id)
        return

    # Check and resolve auto-pause if budget is above threshold
    resolution_result = await AutoPauseEnforcer.check_and_resolve_auto_pause(project, db)

    if resolution_result:
        logger.info("Auto-Pause resolved for project %s", project_id)
    else:
        logger.info("No auto-pause to resolve for project %s", project_id)
