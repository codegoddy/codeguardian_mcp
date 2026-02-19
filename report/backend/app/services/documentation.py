"""
Documentation Generation Service

This service handles automatic generation of project documentation from:
- Deliverable acceptance criteria
- PR descriptions and commit messages
- Technical notes and implementation details
"""

import os
from datetime import datetime
from typing import Dict, List, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging_config import get_logger
from app.models.deliverable import Deliverable
from app.models.milestone import Milestone
from app.models.project import Project
from app.utils.git_providers.base import GitProviderClient
from app.utils.git_providers.bitbucket import BitbucketProvider
from app.utils.git_providers.github import GitHubProvider
from app.utils.git_providers.gitlab import GitLabProvider

logger = get_logger(__name__)


class DocumentationService:
    """Service for generating and managing project documentation"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def generate_deliverable_documentation(self, deliverable_id: UUID) -> str:
        """
        Generate documentation for a single deliverable.

        Extracts:
        - Acceptance criteria
        - Solution summary from PR description
        - Commit messages
        - Technical notes

        Returns formatted markdown documentation.
        """
        # Fetch deliverable with all details
        result = await self.db.execute(select(Deliverable).where(Deliverable.id == deliverable_id))
        deliverable = result.scalar_one_or_none()

        if not deliverable:
            raise ValueError(f"Deliverable {deliverable_id} not found")

        # Build documentation sections
        doc_sections = []

        # Header
        doc_sections.append(f"# {deliverable.title}")
        doc_sections.append("")

        # Task Reference
        if deliverable.task_reference:
            doc_sections.append(f"**Task Reference:** `{deliverable.task_reference}`")
            doc_sections.append("")

        # Description
        if deliverable.description:
            doc_sections.append("## Description")
            doc_sections.append("")
            doc_sections.append(deliverable.description)
            doc_sections.append("")

        # Acceptance Criteria
        if deliverable.acceptance_criteria:
            doc_sections.append("## Acceptance Criteria")
            doc_sections.append("")
            doc_sections.append(deliverable.acceptance_criteria)
            doc_sections.append("")

        # Implementation Details (from PR)
        if deliverable.git_pr_url:
            pr_details = await self._fetch_pr_details(deliverable)
            if pr_details:
                doc_sections.append("## Implementation")
                doc_sections.append("")
                doc_sections.append(pr_details)
                doc_sections.append("")

        # Commit History
        if deliverable.git_commit_hash:
            commit_details = await self._fetch_commit_details(deliverable)
            if commit_details:
                doc_sections.append("## Technical Notes")
                doc_sections.append("")
                doc_sections.append(commit_details)
                doc_sections.append("")

        # Preview URL
        if deliverable.preview_url:
            doc_sections.append("## Preview")
            doc_sections.append("")
            doc_sections.append(f"Preview URL: [{deliverable.preview_url}]({deliverable.preview_url})")
            doc_sections.append("")

        # Verification Status
        if deliverable.verified_at:
            doc_sections.append("## Verification")
            doc_sections.append("")
            doc_sections.append(f"- **Status:** Verified")
            doc_sections.append(f"- **Verified At:** {deliverable.verified_at.strftime('%Y-%m-%d %H:%M:%S UTC')}")
            if deliverable.auto_verified:
                doc_sections.append(f"- **Method:** Automatic (PR merged)")
            else:
                doc_sections.append(f"- **Method:** Manual verification")
            if deliverable.git_pr_url:
                doc_sections.append(f"- **Pull Request:** [{deliverable.git_pr_url}]({deliverable.git_pr_url})")
            doc_sections.append("")

        # Metrics
        doc_sections.append("## Metrics")
        doc_sections.append("")
        doc_sections.append(f"- **Estimated Hours:** {deliverable.estimated_hours or 'N/A'}")
        doc_sections.append(f"- **Actual Hours:** {deliverable.actual_hours}")
        doc_sections.append(f"- **Total Cost:** ${deliverable.total_cost}")
        doc_sections.append("")

        # Join all sections
        documentation = "\n".join(doc_sections)

        # Update deliverable with generated documentation
        deliverable.documentation_markdown = documentation
        deliverable.documentation_generated_at = datetime.utcnow()
        await self.db.commit()

        return documentation

    async def _fetch_pr_details(self, deliverable: Deliverable) -> Optional[str]:
        """Fetch PR description and details from Git provider"""
        if not deliverable.git_pr_url:
            return None

        try:
            # Determine Git provider from URL
            provider = self._get_git_provider(deliverable.git_pr_url)
            if not provider:
                return None

            # Extract PR details
            pr_info = await provider.get_pull_request_details(deliverable.git_pr_url)

            if not pr_info:
                return None

            # Format PR details
            details = []

            if pr_info.get("description"):
                details.append(pr_info["description"])
                details.append("")

            if pr_info.get("merged_at"):
                details.append(f"**Merged:** {pr_info['merged_at']}")

            if pr_info.get("branch"):
                details.append(f"**Branch:** `{pr_info['branch']}`")

            return "\n".join(details) if details else None

        except Exception as e:
            logger.error("Error fetching PR details: %s", e)
            return None

    async def _fetch_commit_details(self, deliverable: Deliverable) -> Optional[str]:
        """Fetch commit messages related to this deliverable"""
        if not deliverable.task_reference:
            return None

        try:
            # Fetch project to get repository info
            result = await self.db.execute(select(Project).where(Project.id == deliverable.project_id))
            project = result.scalar_one_or_none()

            if not project or not project.allowed_repositories:
                return None

            # Get commits from first repository (could be enhanced to check all repos)
            repo_url = project.allowed_repositories[0] if project.allowed_repositories else None
            if not repo_url:
                return None

            provider = self._get_git_provider(repo_url)
            if not provider:
                return None

            # Fetch commits with task reference
            commits = await provider.get_commits_by_task_reference(repo_url, deliverable.task_reference)

            if not commits:
                return None

            # Format commit messages
            commit_lines = []
            for commit in commits[:10]:  # Limit to 10 most recent
                commit_lines.append(f"- `{commit['sha'][:7]}` - {commit['message']}")

            return "\n".join(commit_lines) if commit_lines else None

        except Exception as e:
            logger.error("Error fetching commit details: %s", e)
            return None

    def _get_git_provider(self, url: str) -> Optional[GitProviderClient]:
        """Determine Git provider from URL and return appropriate provider instance"""
        # Get access token from environment (this should be improved to use user's token)
        access_token = (
            os.getenv("GITHUB_ACCESS_TOKEN") or os.getenv("GITLAB_ACCESS_TOKEN") or os.getenv("BITBUCKET_ACCESS_TOKEN")
        )

        if not access_token:
            return None

        if "github.com" in url:
            return GitHubProvider(access_token)
        elif "gitlab.com" in url:
            return GitLabProvider(access_token)
        elif "bitbucket.org" in url:
            return BitbucketProvider(access_token)
        return None

    async def compile_milestone_documentation(self, project_id: UUID, milestone_id: UUID) -> str:
        """
        Compile documentation for all deliverables in a milestone.

        Returns a comprehensive milestone report with all deliverable documentation.
        """
        # Fetch milestone
        result = await self.db.execute(select(Milestone).where(Milestone.id == milestone_id))
        milestone = result.scalar_one_or_none()

        if not milestone:
            raise ValueError(f"Milestone {milestone_id} not found")

        # Fetch all deliverables in milestone
        result = await self.db.execute(
            select(Deliverable).where(Deliverable.milestone_id == milestone_id).order_by(Deliverable.created_at)
        )
        deliverables = result.scalars().all()

        # Build milestone documentation
        doc_sections = []

        # Header
        doc_sections.append(f"# Milestone: {milestone.name}")
        doc_sections.append("")

        # Description
        if milestone.description:
            doc_sections.append("## Overview")
            doc_sections.append("")
            doc_sections.append(milestone.description)
            doc_sections.append("")

        # Milestone Status
        doc_sections.append("## Status")
        doc_sections.append("")
        doc_sections.append(f"- **Status:** {milestone.status.replace('_', ' ').title()}")
        doc_sections.append(f"- **Total Deliverables:** {milestone.total_deliverables}")
        doc_sections.append(f"- **Completed:** {milestone.completed_deliverables}")
        doc_sections.append(f"- **Ready to Bill:** {milestone.ready_to_bill_deliverables}")
        if milestone.completed_at:
            doc_sections.append(f"- **Completed At:** {milestone.completed_at.strftime('%Y-%m-%d %H:%M:%S UTC')}")
        doc_sections.append("")

        # Deliverables
        doc_sections.append("## Deliverables")
        doc_sections.append("")

        if not deliverables:
            doc_sections.append("*No deliverables in this milestone.*")
            doc_sections.append("")
        else:
            for i, deliverable in enumerate(deliverables, 1):
                # Generate documentation for each deliverable if not already generated
                if not deliverable.documentation_markdown:
                    await self.generate_deliverable_documentation(deliverable.id)
                    # Refresh deliverable
                    await self.db.refresh(deliverable)

                doc_sections.append(f"### {i}. {deliverable.title}")
                doc_sections.append("")

                # Add deliverable documentation (without the main header)
                if deliverable.documentation_markdown:
                    # Remove the first line (main header) from deliverable doc
                    deliverable_doc_lines = deliverable.documentation_markdown.split("\n")
                    if deliverable_doc_lines and deliverable_doc_lines[0].startswith("# "):
                        deliverable_doc_lines = deliverable_doc_lines[1:]
                    doc_sections.append("\n".join(deliverable_doc_lines))

                doc_sections.append("")
                doc_sections.append("---")
                doc_sections.append("")

        # Milestone Metrics
        total_estimated = sum(d.estimated_hours or 0 for d in deliverables)
        total_actual = sum(d.actual_hours for d in deliverables)
        total_cost = sum(d.total_cost for d in deliverables)

        doc_sections.append("## Milestone Metrics")
        doc_sections.append("")
        doc_sections.append(f"- **Total Estimated Hours:** {total_estimated}")
        doc_sections.append(f"- **Total Actual Hours:** {total_actual}")
        doc_sections.append(f"- **Total Cost:** ${total_cost}")
        if total_estimated > 0:
            variance = ((total_actual - total_estimated) / total_estimated) * 100
            doc_sections.append(f"- **Time Variance:** {variance:+.1f}%")
        doc_sections.append("")

        return "\n".join(doc_sections)

    async def generate_project_closeout_documentation(self, project_id: UUID) -> str:
        """
        Generate comprehensive project documentation for closeout.

        Includes:
        - All milestones and deliverables
        - Project metrics and summary
        - Financial summary
        """
        # Fetch project
        result = await self.db.execute(select(Project).where(Project.id == project_id))
        project = result.scalar_one_or_none()

        if not project:
            raise ValueError(f"Project {project_id} not found")

        # Fetch all milestones
        result = await self.db.execute(
            select(Milestone).where(Milestone.project_id == project_id).order_by(Milestone.order, Milestone.created_at)
        )
        milestones = result.scalars().all()

        # Fetch all deliverables (including those without milestones)
        result = await self.db.execute(
            select(Deliverable).where(Deliverable.project_id == project_id).order_by(Deliverable.created_at)
        )
        all_deliverables = result.scalars().all()

        # Build project documentation
        doc_sections = []

        # Header
        doc_sections.append(f"# Project Documentation: {project.name}")
        doc_sections.append("")
        doc_sections.append(f"**Generated:** {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}")
        doc_sections.append("")

        # Project Overview
        doc_sections.append("## Project Overview")
        doc_sections.append("")
        if project.description:
            doc_sections.append(project.description)
            doc_sections.append("")
        doc_sections.append(f"- **Status:** {project.status.replace('_', ' ').title()}")
        doc_sections.append(f"- **Created:** {project.created_at.strftime('%Y-%m-%d')}")
        if project.status == "completed":
            doc_sections.append(f"- **Completed:** {project.updated_at.strftime('%Y-%m-%d')}")
        doc_sections.append("")

        # Financial Summary
        doc_sections.append("## Financial Summary")
        doc_sections.append("")
        doc_sections.append(f"- **Project Budget:** ${project.project_budget}")
        doc_sections.append(f"- **Budget Remaining:** ${project.current_budget_remaining}")
        doc_sections.append(f"- **Total Revenue:** ${project.total_revenue}")
        doc_sections.append(f"- **Total Hours Tracked:** {project.total_hours_tracked}")
        if project.change_request_value_added > 0:
            doc_sections.append(f"- **Change Request Value:** ${project.change_request_value_added}")
            doc_sections.append(f"- **Scope Deviation:** {project.scope_deviation_percentage}%")
        doc_sections.append("")

        # Milestones
        if milestones:
            doc_sections.append("## Milestones")
            doc_sections.append("")

            for milestone in milestones:
                # Generate milestone documentation
                milestone_doc = await self.compile_milestone_documentation(project_id, milestone.id)
                doc_sections.append(milestone_doc)
                doc_sections.append("")
                doc_sections.append("---")
                doc_sections.append("")

        # Deliverables without milestones
        deliverables_without_milestone = [d for d in all_deliverables if not d.milestone_id]
        if deliverables_without_milestone:
            doc_sections.append("## Additional Deliverables")
            doc_sections.append("")

            for deliverable in deliverables_without_milestone:
                # Generate documentation if not already generated
                if not deliverable.documentation_markdown:
                    await self.generate_deliverable_documentation(deliverable.id)
                    await self.db.refresh(deliverable)

                if deliverable.documentation_markdown:
                    doc_sections.append(deliverable.documentation_markdown)
                    doc_sections.append("")
                    doc_sections.append("---")
                    doc_sections.append("")

        # Project Metrics
        doc_sections.append("## Project Metrics")
        doc_sections.append("")

        total_deliverables = len(all_deliverables)
        completed_deliverables = len([d for d in all_deliverables if d.status in ["completed", "verified", "billed"]])

        doc_sections.append(f"- **Total Deliverables:** {total_deliverables}")
        doc_sections.append(f"- **Completed Deliverables:** {completed_deliverables}")
        doc_sections.append(
            f"- **Completion Rate:** {(completed_deliverables / total_deliverables * 100) if total_deliverables > 0 else 0:.1f}%"
        )
        doc_sections.append(f"- **Total Milestones:** {len(milestones)}")
        doc_sections.append("")

        return "\n".join(doc_sections)
