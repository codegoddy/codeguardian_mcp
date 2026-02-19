"""
Payment Milestones API
Handles payment schedule configuration and tracking.
"""

from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.common.exceptions import InternalException, NotFoundException, ValidationException
from app.core.auth import get_current_user
from app.core.logging_config import get_logger
from app.db.database import get_db
from app.models.client import Client
from app.models.payment_milestone import PaymentMilestone
from app.models.project import Project
from app.models.user import User
from app.schemas.payment_milestone import (
    PaymentMilestoneCreate,
    PaymentMilestoneResponse,
    PaymentMilestoneUpdate,
    PaymentScheduleResponse,
    PaymentScheduleSetup,
    PaymentTermsParseResult,
    TriggerType,
)
from app.services.activity_service import create_activity
from app.services.budget_health import budget_health_service
from app.services.payment_parser import payment_parser

logger = get_logger(__name__)

router = APIRouter()


# ============================================================================
# Payment Schedule Endpoints
# ============================================================================


@router.get("/projects/{project_id}/payment-schedule", response_model=PaymentScheduleResponse)
async def get_payment_schedule(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get payment schedule for a project."""
    # Get project with milestones
    result = await db.execute(
        select(Project)
        .options(selectinload(Project.payment_milestones))
        .where(Project.id == project_id, Project.user_id == current_user.id)
    )
    project = result.scalar_one_or_none()

    if not project:
        raise NotFoundException("Project", project_id)

    # Get client for hourly rate
    client_result = await db.execute(select(Client).where(Client.id == project.client_id))
    client = client_result.scalar_one_or_none()

    milestones = project.payment_milestones or []
    total_paid = sum(m.amount for m in milestones if m.status == "paid")
    total_pending = sum(m.amount for m in milestones if m.status != "paid")

    # Find next unpaid milestone
    next_payment = None
    for m in sorted(milestones, key=lambda x: x.order):
        if m.status in ["pending", "triggered", "invoiced", "awaiting_confirmation"]:
            next_payment = m
            break

    return PaymentScheduleResponse(
        project_id=project_id,
        status=project.payment_schedule_status or "not_configured",
        total_budget=project.project_budget or Decimal("0"),
        milestones=[PaymentMilestoneResponse.model_validate(m) for m in milestones],
        total_paid=total_paid,
        total_pending=total_pending,
        next_payment=(PaymentMilestoneResponse.model_validate(next_payment) if next_payment else None),
    )


@router.post("/projects/{project_id}/payment-schedule/parse")
async def parse_payment_terms(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Parse contract content to extract payment terms using AI."""
    from app.models.contract_signature import ContractSignature

    # Get project
    result = await db.execute(select(Project).where(Project.id == project_id, Project.user_id == current_user.id))
    project = result.scalar_one_or_none()

    if not project:
        raise NotFoundException("Project", project_id)

    # Get contract signature to access contract content
    contract_result = await db.execute(select(ContractSignature).where(ContractSignature.project_id == project_id))
    contract = contract_result.scalar_one_or_none()

    if not contract or not contract.contract_content:
        return PaymentTermsParseResult(
            found=False,
            terms=[],
            raw_text="No contract found for this project. Please send a contract first.",
        )

    # Parse contract content using AI
    try:
        parse_result = await payment_parser.parse_contract(contract.contract_content)
        return parse_result
    except Exception as e:
        logger.error("Failed to parse payment terms", exc_info=True)
        return PaymentTermsParseResult(found=False, terms=[], raw_text=f"Failed to parse contract: {str(e)}")


@router.post("/projects/{project_id}/payment-schedule/setup")
async def setup_payment_schedule(
    project_id: UUID,
    data: PaymentScheduleSetup,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Set up payment schedule for a project (manual or from parsed terms)."""
    # Get project
    result = await db.execute(select(Project).where(Project.id == project_id, Project.user_id == current_user.id))
    project = result.scalar_one_or_none()

    if not project:
        raise NotFoundException("Project", project_id)

    # Validate percentages sum to 100
    total_percentage = sum(m.percentage for m in data.milestones)
    if abs(total_percentage - Decimal("100")) > Decimal("0.01"):
        raise ValidationException(
            f"Payment percentages must sum to 100%. Current total: {total_percentage}%",
            details={
                "expected_total": 100,
                "actual_total": float(total_percentage),
                "milestones": [{"name": m.name, "percentage": float(m.percentage)} for m in data.milestones],
            },
        )

    # Delete existing milestones
    await db.execute(delete(PaymentMilestone).where(PaymentMilestone.project_id == project_id))

    # Create new milestones
    budget = project.project_budget or Decimal("0")
    milestones = []

    for i, m in enumerate(data.milestones):
        amount = (m.percentage / 100) * budget
        milestone = PaymentMilestone(
            project_id=project_id,
            name=m.name,
            percentage=m.percentage,
            amount=amount,
            trigger_type=m.trigger_type.value,
            trigger_value=m.trigger_value,
            order=m.order if m.order else i,
            status="pending",
        )
        db.add(milestone)
        milestones.append(milestone)

    # Update project status
    project.payment_schedule_status = "configured"

    # Get client for invoice generation
    from app.models.client import Client

    client_result = await db.execute(select(Client).where(Client.id == project.client_id))
    client = client_result.scalar_one_or_none()

    # If first milestone is contract_signed and contract is already signed, trigger it
    invoice_generated = False
    if milestones and milestones[0].trigger_type == "contract_signed" and project.contract_signed:
        from datetime import datetime

        milestones[0].status = "triggered"
        milestones[0].triggered_at = datetime.utcnow()
        project.payment_schedule_status = "active"

        # Auto-generate invoice for this milestone
        if client:
            from app.services.payment_milestone_service import auto_generate_invoice_for_payment_milestone

            invoice = await auto_generate_invoice_for_payment_milestone(db, milestones[0], project, client)
            invoice_generated = invoice is not None

    await db.commit()

    message = "Payment schedule configured successfully"
    if invoice_generated:
        message += f". Invoice auto-generated for '{milestones[0].name}'"

    return {
        "message": message,
        "milestones_count": len(milestones),
        "total_budget": float(budget),
        "invoice_generated": invoice_generated,
    }

    # Note: Activity logging done after return to avoid blocking
    # The activity is logged in the calling frontend or could be moved to a background task


@router.post("/projects/{project_id}/payment-milestones/{milestone_id}/trigger")
async def trigger_milestone(
    project_id: UUID,
    milestone_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Manually trigger a payment milestone."""
    result = await db.execute(
        select(PaymentMilestone).where(
            PaymentMilestone.id == milestone_id,
            PaymentMilestone.project_id == project_id,
        )
    )
    milestone = result.scalar_one_or_none()

    if not milestone:
        raise NotFoundException("Payment milestone", milestone_id)

    # Verify project ownership
    project_result = await db.execute(select(Project).where(Project.id == project_id, Project.user_id == current_user.id))
    if not project_result.scalar_one_or_none():
        raise NotFoundException("Project", project_id)

    if milestone.status != "pending":
        raise ValidationException(
            f"Milestone already {milestone.status}",
            details={"current_status": milestone.status, "expected_status": "pending"},
        )

    from datetime import datetime

    milestone.status = "triggered"
    milestone.triggered_at = datetime.utcnow()

    await db.commit()

    return {"message": "Payment milestone triggered", "milestone_id": str(milestone_id)}


@router.post("/projects/{project_id}/payment-milestones/{milestone_id}/mark-paid")
async def mark_milestone_paid(
    project_id: UUID,
    milestone_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark a payment milestone as paid (developer confirmation)."""
    result = await db.execute(
        select(PaymentMilestone).where(
            PaymentMilestone.id == milestone_id,
            PaymentMilestone.project_id == project_id,
        )
    )
    milestone = result.scalar_one_or_none()

    if not milestone:
        raise NotFoundException("Payment milestone", milestone_id)

    # Verify project ownership
    project_result = await db.execute(select(Project).where(Project.id == project_id, Project.user_id == current_user.id))
    if not project_result.scalar_one_or_none():
        raise NotFoundException("Project", project_id)

    from datetime import datetime

    milestone.status = "paid"
    milestone.paid_at = datetime.utcnow()

    await db.commit()

    # Get project for activity log
    project = project_result.scalar_one_or_none()

    # Log activity for milestone paid
    try:
        await create_activity(
            db=db,
            user_id=current_user.id,
            entity_type="payment_milestone",
            entity_id=milestone.id,
            action="paid",
            title=f"Payment received: {milestone.name}",
            description=f"Amount: {milestone.amount:,.2f}",
        )
    except Exception as e:
        logger.warning("Failed to log payment milestone activity", exc_info=True)

    return {
        "message": "Payment milestone marked as paid",
        "milestone_id": str(milestone_id),
    }


@router.delete("/projects/{project_id}/payment-schedule")
async def delete_payment_schedule(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete entire payment schedule for a project."""
    # Verify project ownership
    result = await db.execute(select(Project).where(Project.id == project_id, Project.user_id == current_user.id))
    project = result.scalar_one_or_none()

    if not project:
        raise NotFoundException("Project", project_id)

    # Delete all milestones
    await db.execute(delete(PaymentMilestone).where(PaymentMilestone.project_id == project_id))

    # Reset project status
    project.payment_schedule_status = "not_configured"

    await db.commit()

    return {"message": "Payment schedule deleted"}


# ============================================================================
# Budget Health Endpoints
# ============================================================================


@router.get("/projects/{project_id}/budget-health")
async def get_budget_health(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get budget health status for a project."""
    # Verify project ownership
    result = await db.execute(select(Project).where(Project.id == project_id, Project.user_id == current_user.id))
    project = result.scalar_one_or_none()

    if not project:
        raise NotFoundException("Project", project_id)

    health = await budget_health_service.calculate_health(db, project_id)

    if not health:
        return {"status": "unknown", "message": "Unable to calculate budget health"}

    return health.to_dict()
