"""
Budget Health Service
Calculates project-level budget health and tracks variance.
"""

import logging
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.client import Client
from app.models.deliverable import Deliverable
from app.models.project import Project

logger = logging.getLogger(__name__)


class BudgetHealthStatus:
    HEALTHY = "healthy"
    AT_RISK = "at_risk"
    OVER_BUDGET = "over_budget"


class BudgetHealthResult:
    """Result of budget health calculation"""

    def __init__(
        self,
        status: str,
        actual_hours: Decimal,
        remaining_estimated: Decimal,
        projected_total: Decimal,
        budget_hours: Decimal,
        progress_percent: float,
        budget_used_percent: float,
        overage_hours: Optional[Decimal] = None,
        overage_cost: Optional[Decimal] = None,
    ):
        self.status = status
        self.actual_hours = actual_hours
        self.remaining_estimated = remaining_estimated
        self.projected_total = projected_total
        self.budget_hours = budget_hours
        self.progress_percent = progress_percent
        self.budget_used_percent = budget_used_percent
        self.overage_hours = overage_hours
        self.overage_cost = overage_cost

    def to_dict(self) -> dict:
        return {
            "status": self.status,
            "actual_hours": float(self.actual_hours),
            "remaining_estimated": float(self.remaining_estimated),
            "projected_total": float(self.projected_total),
            "budget_hours": float(self.budget_hours),
            "progress_percent": round(self.progress_percent, 1),
            "budget_used_percent": round(self.budget_used_percent, 1),
            "overage_hours": float(self.overage_hours) if self.overage_hours else None,
            "overage_cost": float(self.overage_cost) if self.overage_cost else None,
        }


class BudgetHealthService:
    """Calculate and track project budget health"""

    COMPLETED_STATUSES = ["completed", "verified", "billed"]

    async def calculate_health(
        self, db: AsyncSession, project_id: UUID, hourly_rate: Optional[Decimal] = None
    ) -> Optional[BudgetHealthResult]:
        """
        Calculate budget health for a project.

        Args:
            db: Database session
            project_id: Project UUID
            hourly_rate: Optional hourly rate (fetched from client if not provided)

        Returns:
            BudgetHealthResult or None if project not found
        """
        # Fetch project with deliverables
        result = await db.execute(select(Project).options(selectinload(Project.deliverables)).where(Project.id == project_id))
        project = result.scalar_one_or_none()

        if not project:
            return None

        # Get hourly rate from client if not provided
        if hourly_rate is None:
            client_result = await db.execute(select(Client).where(Client.id == project.client_id))
            client = client_result.scalar_one_or_none()
            hourly_rate = client.default_hourly_rate if client else Decimal("0")

        if not hourly_rate or hourly_rate <= 0:
            logger.warning(f"No hourly rate for project {project_id}")
            return None

        # Calculate deliverable stats
        deliverables = project.deliverables or []
        total_count = len(deliverables)

        if total_count == 0:
            return BudgetHealthResult(
                status=BudgetHealthStatus.HEALTHY,
                actual_hours=Decimal("0"),
                remaining_estimated=Decimal("0"),
                projected_total=Decimal("0"),
                budget_hours=(project.project_budget / hourly_rate if project.project_budget else Decimal("0")),
                progress_percent=0,
                budget_used_percent=0,
            )

        completed = [d for d in deliverables if d.status in self.COMPLETED_STATUSES]
        remaining = [d for d in deliverables if d.status not in self.COMPLETED_STATUSES]

        # Calculate hours
        actual_hours = sum(Decimal(str(d.actual_hours or 0)) for d in deliverables)
        remaining_estimated = sum(Decimal(str(d.estimated_hours or 0)) for d in remaining)
        projected_total = actual_hours + remaining_estimated

        # Calculate budget hours
        budget_hours = project.project_budget / hourly_rate if project.project_budget else Decimal("0")

        # Calculate percentages
        progress_percent = (len(completed) / total_count * 100) if total_count > 0 else 0
        budget_used_percent = (float(actual_hours) / float(budget_hours) * 100) if budget_hours > 0 else 0

        # Determine status
        overage_hours = None
        overage_cost = None

        if projected_total > budget_hours:
            status = BudgetHealthStatus.OVER_BUDGET
            overage_hours = projected_total - budget_hours
            overage_cost = overage_hours * hourly_rate
        elif budget_used_percent > progress_percent + 15:
            # Budget consumption is significantly ahead of progress
            status = BudgetHealthStatus.AT_RISK
        else:
            status = BudgetHealthStatus.HEALTHY

        return BudgetHealthResult(
            status=status,
            actual_hours=actual_hours,
            remaining_estimated=remaining_estimated,
            projected_total=projected_total,
            budget_hours=budget_hours,
            progress_percent=progress_percent,
            budget_used_percent=budget_used_percent,
            overage_hours=overage_hours,
            overage_cost=overage_cost,
        )

    def calculate_from_data(
        self,
        deliverables: List[Deliverable],
        project_budget: Decimal,
        hourly_rate: Decimal,
    ) -> BudgetHealthResult:
        """
        Calculate health from pre-fetched data (no DB access).
        Useful when data is already loaded.
        """
        total_count = len(deliverables)

        if total_count == 0 or hourly_rate <= 0:
            return BudgetHealthResult(
                status=BudgetHealthStatus.HEALTHY,
                actual_hours=Decimal("0"),
                remaining_estimated=Decimal("0"),
                projected_total=Decimal("0"),
                budget_hours=(project_budget / hourly_rate if hourly_rate > 0 else Decimal("0")),
                progress_percent=0,
                budget_used_percent=0,
            )

        completed = [d for d in deliverables if d.status in self.COMPLETED_STATUSES]
        remaining = [d for d in deliverables if d.status not in self.COMPLETED_STATUSES]

        actual_hours = sum(Decimal(str(d.actual_hours or 0)) for d in deliverables)
        remaining_estimated = sum(Decimal(str(d.estimated_hours or 0)) for d in remaining)
        projected_total = actual_hours + remaining_estimated
        budget_hours = project_budget / hourly_rate

        progress_percent = len(completed) / total_count * 100
        budget_used_percent = (float(actual_hours) / float(budget_hours) * 100) if budget_hours > 0 else 0

        overage_hours = None
        overage_cost = None

        if projected_total > budget_hours:
            status = BudgetHealthStatus.OVER_BUDGET
            overage_hours = projected_total - budget_hours
            overage_cost = overage_hours * hourly_rate
        elif budget_used_percent > progress_percent + 15:
            status = BudgetHealthStatus.AT_RISK
        else:
            status = BudgetHealthStatus.HEALTHY

        return BudgetHealthResult(
            status=status,
            actual_hours=actual_hours,
            remaining_estimated=remaining_estimated,
            projected_total=projected_total,
            budget_hours=budget_hours,
            progress_percent=progress_percent,
            budget_used_percent=budget_used_percent,
            overage_hours=overage_hours,
            overage_cost=overage_cost,
        )


# Singleton instance
budget_health_service = BudgetHealthService()
