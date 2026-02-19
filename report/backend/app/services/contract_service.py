"""
Contract service for handling post-signature workflows
"""

import json
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging_config import get_logger
from app.models.client import Client
from app.models.contract_signature import ContractSignature
from app.models.payment_milestone import PaymentMilestone
from app.models.project import Project
from app.models.user import User
from app.utils.cloudinary_client import upload_file
from app.utils.email import send_contract_signed_email

logger = get_logger(__name__)


async def handle_contract_signed(project_id: UUID, db: AsyncSession):
    """
    Handle post-signature workflow:
    1. Generate signed contract PDF (placeholder for now)
    2. Upload PDF to Cloudinary (placeholder for now)
    3. Send signed PDF to both client and developer via email
    4. Parse payment terms and create payment schedule
    5. Update project status (already done in the sign endpoint)
    """
    # Get contract signature
    result = await db.execute(select(ContractSignature).filter(ContractSignature.project_id == project_id))
    contract_signature = result.scalar_one_or_none()

    if not contract_signature or not contract_signature.signed:
        logger.warning("Contract signature not found or not signed for project %s", project_id)
        return

    # Get project
    result = await db.execute(select(Project).filter(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        logger.warning("Project not found: %s", project_id)
        return

    # Get client
    result = await db.execute(select(Client).filter(Client.id == project.client_id))
    client = result.scalar_one_or_none()
    if not client:
        logger.warning("Client not found for project %s", project_id)
        return

    # Get developer (user)
    result = await db.execute(select(User).filter(User.id == project.user_id))
    developer = result.scalar_one_or_none()
    if not developer:
        logger.warning("Developer not found for project %s", project_id)
        return

    # Parse payment terms and create schedule
    await _parse_and_create_payment_schedule(project, contract_signature, db)

    # Format signed date
    signed_date = contract_signature.signed_at.strftime("%B %d, %Y at %I:%M %p UTC")

    # Build project URL for developer
    project_url = f"{settings.frontend_url}/projects/{project.id}"

    # Note: Email notifications are handled via NATS events:
    # - Developer gets contract signed confirmation via email.contract_signed_confirmation
    # - Client gets portal welcome email via email.client_portal_welcome
    # This function is kept for potential future PDF generation and attachment

    logger.info("Post-signature workflow completed for project %s", project_id)


async def _parse_and_create_payment_schedule(project: Project, contract_signature: ContractSignature, db: AsyncSession):
    """
    Parse payment terms from contract content and create payment milestones.
    If parsing fails or no terms found, skip (user can set up manually).
    """
    # Skip if payment schedule already configured
    if project.payment_schedule_status and project.payment_schedule_status != "not_configured":
        logger.info("Payment schedule already configured for project %s", project.id)
        return

    # Get contract content
    contract_content = contract_signature.contract_content
    if not contract_content:
        logger.info("No contract content to parse for project %s", project.id)
        return

    try:
        # Import parser here to avoid circular imports
        from app.services.payment_parser import payment_parser

        # Parse payment terms
        parse_result = await payment_parser.parse_contract(contract_content)

        if not parse_result.found or not parse_result.terms:
            logger.info("No payment terms found in contract for project %s", project.id)
            return

        # Create payment milestones
        budget = project.project_budget or Decimal("0")
        now = datetime.utcnow()

        for i, term in enumerate(parse_result.terms):
            amount = (term.percentage / 100) * budget
            milestone = PaymentMilestone(
                project_id=project.id,
                name=term.name,
                percentage=term.percentage,
                amount=amount,
                trigger_type=term.trigger_type.value,
                trigger_value=term.trigger_value,
                order=i,
                status="pending",
            )

            # Auto-trigger first milestone if it's contract_signed
            if i == 0 and term.trigger_type.value == "contract_signed":
                milestone.status = "triggered"
                milestone.triggered_at = now

            db.add(milestone)

        # Update project status
        project.payment_schedule_status = "active"
        await db.commit()

        logger.info(
            "Created %s payment milestones for project %s",
            len(parse_result.terms),
            project.id,
        )

    except Exception as e:
        logger.error(
            "Failed to parse payment terms for project %s: %s",
            project.id,
            e,
            exc_info=True,
        )
        # Don't raise - user can set up manually


async def handle_contract_signed_event(message: str, db: AsyncSession):
    """Handle contract.signed NATS event"""
    try:
        # Message format: "Contract signed for project {project_id}"
        if message.startswith("Contract signed for project "):
            project_id_str = message.replace("Contract signed for project ", "")
            project_id = int(project_id_str)

            await handle_contract_signed(project_id, db)
    except Exception as e:
        logger.error("Failed to handle contract signed event: %s", e, exc_info=True)
