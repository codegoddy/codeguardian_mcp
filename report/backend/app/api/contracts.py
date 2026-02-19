import re
import secrets
import string
import traceback
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.common.errors import ErrorCodes
from app.common.responses import error_response, success_response
from app.core.auth import get_current_user
from app.core.logging_config import get_logger
from app.db.database import get_db
from app.models.client import Client
from app.models.contract import ContractTemplate
from app.models.contract_signature import ContractSignature
from app.models.deliverable import Deliverable
from app.models.milestone import Milestone
from app.models.project import Project
from app.models.user import User
from app.schemas.contract import (
    ContractGenerate,
    ContractSend,
    ContractSign,
    ContractSignatureResponse,
    ContractTemplateCreate,
    ContractTemplateResponse,
    ContractTemplateSave,
    ContractTemplateUpdate,
    ContractUpload,
    DeveloperContractSign,
)
from app.services.activity_service import create_activity, log_contract_activity
from app.services.notification_service import create_notification
from app.utils.cloudinary_client import delete_file, upload_file
from app.utils.email import send_email
from app.utils.nats_client import publish_message

logger = get_logger(__name__)

router = APIRouter()


# Default contract template content
DEFAULT_CONTRACT_TEMPLATE = """# Service Agreement

This Service Agreement ("Agreement") is entered into between **{{DEVELOPER_NAME}}** and **{{CLIENT_NAME}}**.

## Project Details

**Project Name:** {{PROJECT_NAME}}

**Project Budget:** {{PROJECT_BUDGET}}

**Hourly Rate:** {{HOURLY_RATE}}

**Change Request Rate:** {{CHANGE_REQUEST_RATE}}

**Maximum Revisions:** {{MAX_REVISIONS}}

## Scope of Work

The Developer agrees to provide the following services:

{{MILESTONES_AND_DELIVERABLES}}

## Payment Terms

- **Total Project Cost:** {{PROJECT_BUDGET}}
- **Payment Schedule:**
  - 30% upfront payment
  - 40% at midpoint
  - 30% upon completion

## Timeline

- **Project Start Date:** {{START_DATE}}
- **Estimated Completion:** {{END_DATE}}
- **Maximum Revisions:** {{MAX_REVISIONS}}

## Terms and Conditions

1. **Intellectual Property:** Upon full payment, the Client will own all rights to the final deliverables.

2. **Revisions:** The Client is entitled to **{{MAX_REVISIONS}}** per deliverable at no additional cost.

3. **Change Requests:** Additional work beyond the agreed scope will be billed at the hourly rate.

4. **Timeline:** The Developer will make reasonable efforts to meet the project timeline.

5. **Communication:** Both parties agree to maintain open communication throughout the project.

## Contact Information

**Developer:** {{DEVELOPER_NAME}}  
**Client:** {{CLIENT_NAME}}  
**Email:** {{CLIENT_EMAIL}}

---

By signing below, both parties agree to the terms and conditions outlined in this Agreement.
"""


@router.get("/")
async def list_contracts(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """List all contract signatures for the authenticated user"""
    # Get all contract signatures for projects owned by the user
    result = await db.execute(
        select(ContractSignature, Project, Client)
        .join(Project, ContractSignature.project_id == Project.id)
        .join(Client, ContractSignature.client_id == Client.id)
        .where(Project.user_id == current_user.id)
        .order_by(ContractSignature.created_at.desc())
    )
    contracts_data = result.all()

    # Format the response
    contracts_list = []
    for contract_sig, project, client in contracts_data:
        contracts_list.append(
            {
                "id": contract_sig.id,
                "project_name": project.name,
                "client_name": client.name,
                "client_email": client.email,
                "signed": contract_sig.signed,  # Add the signed boolean field
                "status": ("signed" if contract_sig.signed else "sent" if contract_sig.created_at else "draft"),
                "created_at": (contract_sig.created_at.isoformat() if contract_sig.created_at else None),
                "expires_at": (
                    contract_sig.signing_token_expires_at.isoformat() if contract_sig.signing_token_expires_at else None
                ),
                "signing_token": (contract_sig.signing_token if not contract_sig.signed else None),
                "signed_at": (contract_sig.signed_at.isoformat() if contract_sig.signed_at else None),
            }
        )

    return success_response(data=contracts_list, message=f"Retrieved {len(contracts_list)} contract(s)")


@router.get("/templates")
async def list_templates(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """List all contract templates for the authenticated user"""
    result = await db.execute(select(ContractTemplate).where(ContractTemplate.user_id == current_user.id))
    templates = result.scalars().all()

    return success_response(
        data=[ContractTemplateResponse.model_validate(t) for t in templates],
        message=f"Retrieved {len(templates)} template(s)",
    )


@router.post("/templates")
async def create_contract_template(
    template: ContractTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new contract template"""
    # If setting as default, unset other defaults
    if template.is_default:
        await db.execute(
            select(ContractTemplate).where(
                and_(
                    ContractTemplate.user_id == current_user.id,
                    ContractTemplate.is_default == True,
                )
            )
        )
        # Note: For updates, we need to fetch and update, or use update() but it's more complex with async
        # For now, let's fetch and update
        result = await db.execute(
            select(ContractTemplate).where(
                and_(
                    ContractTemplate.user_id == current_user.id,
                    ContractTemplate.is_default == True,
                )
            )
        )
        existing_defaults = result.scalars().all()
        for default_template in existing_defaults:
            default_template.is_default = False

    db_template = ContractTemplate(
        user_id=current_user.id,
        name=template.name,
        description=template.description,
        template_content=template.template_content,
        is_default=template.is_default,
    )

    db.add(db_template)
    await db.commit()
    await db.refresh(db_template)

    # Log activity for contract template creation (user customizing system template)
    try:
        await create_activity(
            db=db,
            user_id=current_user.id,
            entity_type="contract_template",
            entity_id=db_template.id,
            action="created",
            title="Saved custom contract template",
            description=f"Template: {db_template.name}",
        )
    except Exception as e:
        logger.warning("Failed to log contract template creation activity", exc_info=True)

    return success_response(
        data=ContractTemplateResponse.model_validate(db_template),
        message="Contract template created successfully",
    )


@router.put("/templates/{template_id}")
async def update_contract_template(
    template_id: UUID,
    template: ContractTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a contract template"""
    result = await db.execute(
        select(ContractTemplate).where(
            and_(
                ContractTemplate.id == template_id,
                ContractTemplate.user_id == current_user.id,
            )
        )
    )
    db_template = result.scalar_one_or_none()

    if not db_template:
        return error_response(ErrorCodes.NOT_FOUND, "Contract template not found", status_code=404)

    # If setting as default, unset other defaults
    if template.is_default:
        result = await db.execute(
            select(ContractTemplate).where(
                and_(
                    ContractTemplate.user_id == current_user.id,
                    ContractTemplate.is_default == True,
                    ContractTemplate.id != template_id,
                )
            )
        )
        other_defaults = result.scalars().all()
        for other_template in other_defaults:
            other_template.is_default = False

    # Update fields
    update_data = template.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_template, field, value)

    db_template.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(db_template)

    # Log activity for contract template update
    try:
        await create_activity(
            db=db,
            user_id=current_user.id,
            entity_type="contract_template",
            entity_id=db_template.id,
            action="updated",
            title="Updated contract template",
            description=f"Template: {db_template.name}",
        )
    except Exception as e:
        logger.warning("Failed to log contract template update activity", exc_info=True)

    return success_response(
        data=ContractTemplateResponse.model_validate(db_template),
        message="Contract template updated successfully",
    )


@router.delete("/templates/{template_id}")
async def delete_contract_template(
    template_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a contract template"""
    result = await db.execute(
        select(ContractTemplate).where(
            and_(
                ContractTemplate.id == template_id,
                ContractTemplate.user_id == current_user.id,
            )
        )
    )
    db_template = result.scalar_one_or_none()

    if not db_template:
        return error_response(ErrorCodes.NOT_FOUND, "Contract template not found", status_code=404)

    await db.delete(db_template)
    await db.commit()

    return success_response(data={"id": template_id}, message="Contract template deleted successfully")


@router.get("/templates/default")
async def get_default_template(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get the user's saved template or the hardcoded default"""
    # Check if user has any saved templates (get the most recent one)
    result = await db.execute(
        select(ContractTemplate)
        .where(ContractTemplate.user_id == current_user.id)
        .order_by(ContractTemplate.updated_at.desc())
        .limit(1)
    )
    saved_template = result.scalar_one_or_none()

    if saved_template:
        # Return the user's saved template
        return {
            "id": saved_template.id,
            "template_content": saved_template.template_content,
            "is_saved": True,
        }

    # Return the hardcoded default template if no saved template exists
    return {
        "id": None,
        "template_content": DEFAULT_CONTRACT_TEMPLATE,
        "is_saved": False,
    }


@router.post("/templates/default")
async def save_default_template(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new contract template from user's changes to the default template"""
    logger.debug("save_default_template called with user_id=%s", current_user.id)

    # Read and parse body manually (workaround for Content-Type: text/plain issue)
    try:
        raw_body = await request.body()
        import json

        body_data = json.loads(raw_body)
        template_update = ContractTemplateSave(**body_data)
        logger.debug("template_content length: %d", len(template_update.template_content))
    except Exception as e:
        logger.error("Failed to parse request body", exc_info=True)
        return error_response(ErrorCodes.INVALID_INPUT, f"Invalid request body: {str(e)}", status_code=400)

    try:
        # Check if user already has a saved template
        result = await db.execute(
            select(ContractTemplate)
            .where(ContractTemplate.user_id == current_user.id)
            .order_by(ContractTemplate.updated_at.desc())
            .limit(1)
        )
        existing_template = result.scalar_one_or_none()

        if existing_template:
            # Update existing template
            existing_template.template_content = template_update.template_content
            existing_template.updated_at = datetime.utcnow()
            db_template = existing_template
            logger.debug("Template updated successfully with id=%s", db_template.id)
        else:
            # Create new template
            db_template = ContractTemplate(
                user_id=current_user.id,
                name="My Contract Template",
                description="Custom contract template based on default",
                template_content=template_update.template_content,
                is_default=False,
            )
            db.add(db_template)
            logger.debug("New template created")

        await db.commit()
        await db.refresh(db_template)

        return success_response(
            data=ContractTemplateResponse.model_validate(db_template),
            message="Contract template saved successfully",
        )
    except Exception as e:
        logger.error("Failed to save default template", exc_info=True)
        await db.rollback()
        return error_response(
            ErrorCodes.INTERNAL_ERROR,
            f"Failed to save template: {str(e)}",
            status_code=500,
        )


@router.post("/templates/create-default")
async def create_default_template(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Create the default contract template for a user if they don't have one"""
    # Check if user already has a default template
    result = await db.execute(
        select(ContractTemplate).where(
            and_(
                ContractTemplate.user_id == current_user.id,
                ContractTemplate.is_default == True,
            )
        )
    )
    existing_default = result.scalar_one_or_none()

    if existing_default:
        return {
            "message": "Default template already exists",
            "template_id": existing_default.id,
        }

    # Create default template
    db_template = ContractTemplate(
        user_id=current_user.id,
        name="Default Contract Template",
        description="Standard service agreement template",
        template_content=DEFAULT_CONTRACT_TEMPLATE,
        is_default=True,
    )

    db.add(db_template)
    await db.commit()
    await db.refresh(db_template)

    return {
        "message": "Default template created successfully",
        "template_id": db_template.id,
    }


async def replace_placeholders(template_content: str, project: Project, client: Client, user: User, db) -> str:
    """Replace placeholders in contract template with actual project data"""
    from app.models.user import UserSettings
    from app.utils.currency import format_currency, get_currency_symbol

    # Get user's currency setting
    result = await db.execute(select(UserSettings).where(UserSettings.user_id == user.id))
    user_settings = result.scalar_one_or_none()
    currency_code = user_settings.default_currency if user_settings else "USD"

    # Get milestones and deliverables for this project
    result = await db.execute(select(Milestone).where(Milestone.project_id == project.id).order_by(Milestone.order))
    milestones = result.scalars().all()
    logger.debug(
        "replace_placeholders: Found %d milestones for project %s",
        len(milestones),
        project.id,
    )

    milestones_and_deliverables_text = ""
    if milestones:
        for i, milestone in enumerate(milestones):
            # Use proper markdown hierarchy with better spacing
            milestones_and_deliverables_text += f"### {milestone.name}\n\n"

            # Get deliverables for this milestone
            deliverables_result = await db.execute(select(Deliverable).where(Deliverable.milestone_id == milestone.id))
            deliverables = deliverables_result.scalars().all()

            if deliverables:
                for deliverable in deliverables:
                    milestones_and_deliverables_text += f"- {deliverable.title}\n"
            else:
                milestones_and_deliverables_text += "- Deliverables to be defined\n"

            # Add extra spacing between milestones (but not after the last one)
            if i < len(milestones) - 1:
                milestones_and_deliverables_text += "\n"
    else:
        milestones_and_deliverables_text = "Milestones and deliverables will be defined from the selected template.\n"

    # Format currency values
    replacements = {
        "{{CONTRACT_DATE}}": datetime.utcnow().strftime("%B %d, %Y"),
        "{{DEVELOPER_NAME}}": user.full_name,
        "{{DEVELOPER_EMAIL}}": user.email,
        "{{CLIENT_NAME}}": client.name,
        "{{CLIENT_EMAIL}}": client.email,
        "{{CLIENT_COMPANY}}": client.company or "N/A",
        "{{PROJECT_NAME}}": project.name,
        "{{PROJECT_DESCRIPTION}}": project.description or "To be defined",
        "{{PROJECT_BUDGET}}": format_currency(float(project.project_budget), currency_code),
        "{{CURRENCY}}": currency_code,
        "{{HOURLY_RATE}}": f"{format_currency(float(client.default_hourly_rate), currency_code)}/hr",
        "{{CHANGE_REQUEST_RATE}}": f"{format_currency(float(client.change_request_rate), currency_code)}/hr",
        "{{PAYMENT_METHOD}}": client.payment_method.replace("_", " ").title(),
        "{{MILESTONES_AND_DELIVERABLES}}": milestones_and_deliverables_text,
        "{{MAX_REVISIONS}}": str(project.max_revisions),
        "{{AUTO_PAUSE_THRESHOLD}}": f"{project.auto_pause_threshold}%",
        "{{START_DATE}}": (project.start_date.strftime("%B %d, %Y") if project.start_date else "To be determined"),
        "{{END_DATE}}": (project.due_date.strftime("%B %d, %Y") if project.due_date else "To be determined"),
        "{{SIGNATURE_DATE}}": "_________________",
    }

    contract_content = template_content
    for placeholder, value in replacements.items():
        # Use regex to replace placeholders with optional whitespace (e.g. {{ KEY }} or {{KEY}})
        key = placeholder.replace("{{", "").replace("}}", "")
        pattern = r"\{\{\s*" + re.escape(key) + r"\s*\}\}"
        contract_content = re.sub(pattern, lambda m: str(value), contract_content)

    return contract_content


async def generate_and_send_contract(project_id: UUID, template_id: Optional[UUID], current_user: User, db):
    """
    Helper function to generate contract (but NOT send to client yet).
    Developer must sign first before the contract is sent to the client.
    Returns the contract signature or None if failed.
    """
    try:
        logger.info("Generating contract for project %s", project_id)

        # Get the project
        result = await db.execute(select(Project).where(and_(Project.id == project_id, Project.user_id == current_user.id)))
        project = result.scalar_one_or_none()

        if not project:
            logger.error("Project %s not found for contract generation", project_id)
            return None

        # Get the client
        result = await db.execute(select(Client).where(Client.id == project.client_id))
        client = result.scalar_one_or_none()
        if not client:
            logger.error("Client not found for project %s", project_id)
            return None

        # Check if contract already exists
        result = await db.execute(select(ContractSignature).where(ContractSignature.project_id == project.id))
        existing_contract = result.scalar_one_or_none()

        if existing_contract:
            logger.info("Contract already exists for project %s", project_id)
            return existing_contract

        # Get the template
        if template_id:
            result = await db.execute(
                select(ContractTemplate).where(
                    and_(
                        ContractTemplate.id == template_id,
                        ContractTemplate.user_id == current_user.id,
                    )
                )
            )
            template = result.scalar_one_or_none()
            if not template:
                logger.error("Contract template %s not found", template_id)
                return None
        else:
            # Use default template or create one
            result = await db.execute(
                select(ContractTemplate)
                .where(ContractTemplate.user_id == current_user.id)
                .order_by(ContractTemplate.updated_at.desc())
                .limit(1)
            )
            template = result.scalar_one_or_none()

            if not template:
                # Create default template
                template = ContractTemplate(
                    user_id=current_user.id,
                    name="Default Contract Template",
                    description="Standard freelance development contract with scope protection",
                    template_content=DEFAULT_CONTRACT_TEMPLATE,
                    is_default=True,
                )
                db.add(template)
                await db.commit()
                await db.refresh(template)

        # Generate contract content by replacing placeholders
        contract_content = await replace_placeholders(template.template_content, project, client, current_user, db)

        # Get user's currency setting
        from app.models.user import UserSettings

        result = await db.execute(select(UserSettings).where(UserSettings.user_id == current_user.id))
        user_settings = result.scalar_one_or_none()
        currency_code = user_settings.default_currency if user_settings else "USD"

        # Generate signing token (use timezone-aware datetime)
        signing_token = secrets.token_urlsafe(32)
        signing_token_expires_at = datetime.now(timezone.utc) + timedelta(days=7)

        # Create contract signature record
        contract_signature = ContractSignature(
            project_id=project.id,
            client_id=client.id,
            contract_content=contract_content,
            signing_token=signing_token,
            signing_token_expires_at=signing_token_expires_at,
        )

        db.add(contract_signature)

        # Update project - awaiting developer signature first
        project.contract_type = "auto_generated"
        project.status = "awaiting_developer_signature"  # Developer must sign before sending to client

        await db.commit()
        await db.refresh(contract_signature)

        # NOTE: Email is NOT sent here anymore.
        # Developer must sign the contract first via the /developer-sign endpoint
        # which will then trigger the email to the client.

        logger.info(
            "Contract generated for project %s - awaiting developer signature",
            project_id,
        )

        # Log activity for contract generation
        await log_contract_activity(
            db=db,
            user_id=current_user.id,
            contract_id=contract_signature.id,
            action="created",
            title=f"Contract generated for: {project.name}",
            description=f"Awaiting your signature before sending to {client.name}",
        )

        # Create notification for developer to sign contract
        await create_notification(
            db=db,
            user_id=current_user.id,
            notification_type="reminder",
            title="Sign your contract",
            message=f"Contract for {project.name} is ready. Please sign it before it can be sent to {client.name}.",
            action_url=f"/projects?tab=contract",
            entity_type="contract",
            entity_id=contract_signature.id,
        )

        return contract_signature

    except Exception as e:
        logger.error("Failed to generate and send contract", exc_info=True)
        return None


@router.get("/test-email")
async def test_contract_email():
    """Test endpoint to verify NATS contract email sending"""
    logger.info("Testing contract signing email via NATS")
    try:
        from app.utils.currency import format_currency
        from app.utils.nats_client import publish_event

        # Format test budget with currency
        test_budget = format_currency(10000, "USD")

        await publish_event(
            "email.contract_signing",
            {
                "to_email": "devhq.test@gmail.com",
                "client_name": "Test Client",
                "developer_name": "Test Developer",
                "developer_email": "developer@test.com",
                "project_name": "Test Project",
                "project_budget": test_budget,
                "currency": "USD",
                "signing_url": "http://localhost:3000/contracts/sign/test-token-123",
            },
        )
        logger.info("Contract signing email event published to NATS successfully")
        return {
            "message": "Test email event published to NATS",
            "check": "Check devhq.test@gmail.com inbox",
        }
    except Exception as e:
        logger.error("Failed to publish test email event", exc_info=True)
        return {"error": str(e), "traceback": traceback.format_exc()}


@router.get("/{contract_id}/developer-preview")
async def get_developer_contract_preview(
    contract_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get contract preview for developer to review before signing"""
    # Get contract with project verification
    result = await db.execute(
        select(ContractSignature, Project)
        .join(Project, ContractSignature.project_id == Project.id)
        .where(and_(ContractSignature.id == contract_id, Project.user_id == current_user.id))
    )
    row = result.first()

    if not row:
        raise HTTPException(status_code=404, detail="Contract not found")

    contract_signature, project = row

    # Get client info
    result = await db.execute(select(Client).where(Client.id == contract_signature.client_id))
    client = result.scalar_one_or_none()

    return {
        "id": str(contract_signature.id),
        "project_id": str(project.id),
        "project_name": project.name,
        "client_name": client.name if client else "Unknown",
        "client_email": client.email if client else "Unknown",
        "contract_content": contract_signature.contract_content,
        "developer_signed": contract_signature.developer_signed,
        "developer_signed_at": (
            contract_signature.developer_signed_at.isoformat() if contract_signature.developer_signed_at else None
        ),
        "developer_name_typed": contract_signature.developer_name_typed,
        "client_signed": contract_signature.signed,
        "created_at": contract_signature.created_at.isoformat(),
    }


@router.post("/{contract_id}/developer-sign")
async def developer_sign_contract(
    contract_id: UUID,
    signature_data: DeveloperContractSign,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Developer signs the contract.
    After developer signs, the contract is sent to the client for their signature.
    """
    # Get contract with project verification
    result = await db.execute(
        select(ContractSignature, Project)
        .join(Project, ContractSignature.project_id == Project.id)
        .where(and_(ContractSignature.id == contract_id, Project.user_id == current_user.id))
    )
    row = result.first()

    if not row:
        raise HTTPException(status_code=404, detail="Contract not found")

    contract_signature, project = row

    # Check if developer already signed
    if contract_signature.developer_signed:
        raise HTTPException(status_code=400, detail="Contract already signed by developer")

    # Get client info
    result = await db.execute(select(Client).where(Client.id == contract_signature.client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    # Update contract with developer signature
    now_utc = datetime.now(timezone.utc)
    contract_signature.developer_signed = True
    contract_signature.developer_signed_at = now_utc
    contract_signature.developer_name_typed = signature_data.developer_name_typed

    # Update project status to contract_sent
    project.status = "contract_sent"

    await db.commit()
    await db.refresh(contract_signature)

    # Now send the contract to the client
    from app.core.config import settings

    signing_url = f"{settings.frontend_url}/contracts/sign/{contract_signature.signing_token}"

    # Get user's currency setting
    from app.models.user import UserSettings

    result = await db.execute(select(UserSettings).where(UserSettings.user_id == current_user.id))
    user_settings = result.scalar_one_or_none()
    currency_code = user_settings.default_currency if user_settings else "USD"

    # Send email to client via NATS
    logger.info(
        "Developer signed - Publishing contract signing email to NATS for project %s",
        project.id,
    )
    try:
        from app.utils.currency import format_currency
        from app.utils.nats_client import publish_event

        await publish_event(
            "email.contract_signing",
            {
                "to_email": client.email,
                "client_name": client.name,
                "developer_name": current_user.full_name,
                "developer_email": current_user.email,
                "project_name": project.name,
                "project_budget": format_currency(float(project.project_budget), currency_code),
                "currency": currency_code,
                "signing_url": signing_url,
            },
        )
        logger.info("Contract signing email published to NATS successfully")
    except Exception as e:
        logger.error("Failed to publish contract signing email", exc_info=True)

    # Log activity
    await log_contract_activity(
        db=db,
        user_id=current_user.id,
        contract_id=contract_signature.id,
        action="developer_signed",
        title=f"Developer signed contract for: {project.name}",
        description=f"Contract sent to {client.name} for signing",
    )

    # Create notification
    await create_notification(
        db=db,
        user_id=current_user.id,
        notification_type="success",
        title="Contract signed and sent",
        message=f"Contract for {project.name} has been sent to {client.name} for their signature.",
        action_url=f"/projects?tab=contract",
        entity_type="contract",
        entity_id=contract_signature.id,
    )

    return success_response(
        data={
            "id": str(contract_signature.id),
            "developer_signed": True,
            "developer_signed_at": contract_signature.developer_signed_at.isoformat(),
            "project_status": project.status,
            "signing_url": signing_url,
        },
        message="Contract signed successfully. It has been sent to the client for their signature.",
    )


@router.post("/generate", response_model=ContractSignatureResponse)
async def generate_contract(
    contract_data: ContractGenerate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate a contract from a template for a project"""
    # Get the project
    result = await db.execute(
        select(Project).where(
            and_(
                Project.id == contract_data.project_id,
                Project.user_id == current_user.id,
            )
        )
    )
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get the client
    result = await db.execute(select(Client).where(Client.id == project.client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    # Check if contract already exists
    result = await db.execute(select(ContractSignature).where(ContractSignature.project_id == project.id))
    existing_contract = result.scalar_one_or_none()

    if existing_contract:
        raise HTTPException(status_code=400, detail="Contract already exists for this project")

    # Get the template
    if contract_data.template_id:
        result = await db.execute(
            select(ContractTemplate).where(
                and_(
                    ContractTemplate.id == contract_data.template_id,
                    ContractTemplate.user_id == current_user.id,
                )
            )
        )
        template = result.scalar_one_or_none()
        if not template:
            raise HTTPException(status_code=404, detail="Contract template not found")
    else:
        # Use default template
        result = await db.execute(
            select(ContractTemplate).where(
                and_(
                    ContractTemplate.user_id == current_user.id,
                    ContractTemplate.is_default == True,
                )
            )
        )
        template = result.scalar_one_or_none()

        if not template:
            # Create default template if it doesn't exist
            template = ContractTemplate(
                user_id=current_user.id,
                name="Default Contract Template",
                description="Standard freelance development contract with scope protection",
                template_content=DEFAULT_CONTRACT_TEMPLATE,
                is_default=True,
            )
            db.add(template)
            await db.commit()
            await db.refresh(template)

    # Generate contract content by replacing placeholders
    contract_content = await replace_placeholders(template.template_content, project, client, current_user, db)

    # Generate signing token (use timezone-aware datetime)
    signing_token = secrets.token_urlsafe(32)
    signing_token_expires_at = datetime.now(timezone.utc) + timedelta(days=7)

    # Create contract signature record
    contract_signature = ContractSignature(
        project_id=project.id,
        client_id=client.id,
        contract_content=contract_content,
        signing_token=signing_token,
        signing_token_expires_at=signing_token_expires_at,
    )

    db.add(contract_signature)

    # Update project
    project.contract_type = "auto_generated"
    project.status = "contract_sent"

    await db.commit()
    await db.refresh(contract_signature)

    # Publish event
    try:
        from app.utils.nats_client import publish_event

        await publish_event(
            "project.contract_generated",
            {
                "event_type": "contract_generated",
                "timestamp": datetime.utcnow().isoformat(),
                "data": {
                    "project_id": project.id,
                    "contract_id": contract_signature.id,
                    "user_id": current_user.id,
                    "message": f"Contract generated for project {project.id}",
                },
            },
        )
    except Exception as e:
        logger.warning("Failed to publish contract generated event", exc_info=True)

    return contract_signature


@router.post("/upload", response_model=ContractSignatureResponse)
async def upload_contract(
    contract_data: ContractUpload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a custom contract PDF for a project"""
    # Get the project
    result = await db.execute(
        select(Project).where(
            and_(
                Project.id == contract_data.project_id,
                Project.user_id == current_user.id,
            )
        )
    )
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get the client
    result = await db.execute(select(Client).where(Client.id == project.client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    # Check if contract already exists
    result = await db.execute(select(ContractSignature).where(ContractSignature.project_id == project.id))
    existing_contract = result.scalar_one_or_none()

    if existing_contract:
        raise HTTPException(status_code=400, detail="Contract already exists for this project")

    # Generate signing token (use timezone-aware datetime)
    signing_token = secrets.token_urlsafe(32)
    signing_token_expires_at = datetime.now(timezone.utc) + timedelta(days=7)

    # Create contract signature record with uploaded PDF
    contract_signature = ContractSignature(
        project_id=project.id,
        client_id=client.id,
        contract_content="Custom uploaded contract",  # Placeholder since we have the PDF
        contract_pdf_url=contract_data.contract_pdf_url,
        signing_token=signing_token,
        signing_token_expires_at=signing_token_expires_at,
    )

    db.add(contract_signature)

    # Update project
    project.contract_type = "custom_upload"
    project.contract_file_url = contract_data.contract_pdf_url
    project.status = "contract_sent"

    await db.commit()
    await db.refresh(contract_signature)

    # Publish event
    try:
        from app.utils.nats_client import publish_event

        await publish_event(
            "project.contract_generated",
            {
                "event_type": "contract_generated",
                "timestamp": datetime.utcnow().isoformat(),
                "data": {
                    "project_id": project.id,
                    "contract_id": contract_signature.id,
                    "user_id": current_user.id,
                    "message": f"Custom contract uploaded for project {project.id}",
                },
            },
        )
    except Exception as e:
        logger.warning("Failed to publish contract uploaded event", exc_info=True)

    return contract_signature


@router.post("/send")
async def send_contract(
    contract_data: ContractSend,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send contract signing link to client via email"""
    # Get the project
    result = await db.execute(
        select(Project).where(
            and_(
                Project.id == contract_data.project_id,
                Project.user_id == current_user.id,
            )
        )
    )
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get the client
    result = await db.execute(select(Client).where(Client.id == project.client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    # Get the contract signature
    result = await db.execute(select(ContractSignature).where(ContractSignature.project_id == project.id))
    contract_signature = result.scalar_one_or_none()

    if not contract_signature:
        raise HTTPException(
            status_code=404,
            detail="Contract not found. Please generate or upload a contract first.",
        )

    if contract_signature.signed:
        raise HTTPException(status_code=400, detail="Contract already signed")

    # Check if signing token is expired (use timezone-aware datetime)
    now_utc = datetime.now(timezone.utc)
    if contract_signature.signing_token_expires_at < now_utc:
        # Generate new signing token
        contract_signature.signing_token = secrets.token_urlsafe(32)
        contract_signature.signing_token_expires_at = now_utc + timedelta(days=7)
        await db.commit()

    # Build signing URL
    from app.core.config import settings

    signing_url = f"{settings.frontend_url}/contracts/sign/{contract_signature.signing_token}"

    # Get user's currency setting
    from app.models.user import UserSettings
    from app.utils.currency import format_currency

    result = await db.execute(select(UserSettings).where(UserSettings.user_id == current_user.id))
    user_settings = result.scalar_one_or_none()
    currency_code = user_settings.default_currency if user_settings else "USD"

    # Send email
    from app.utils.email import send_contract_signing_email

    try:
        await send_contract_signing_email(
            to_email=client.email,
            client_name=client.name,
            developer_name=current_user.full_name,
            developer_email=current_user.email,
            project_name=project.name,
            project_budget=format_currency(float(project.project_budget), currency_code),
            currency=currency_code,
            signing_url=signing_url,
        )
    except Exception as e:
        logger.error("Failed to send contract signing email", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to send contract signing email")

    # Update project status
    project.status = "contract_sent"
    await db.commit()

    # Publish event
    try:
        await publish_message("project.contract_sent", f"Contract sent for project {project.id}")
    except Exception as e:
        logger.warning("Failed to publish contract sent event", exc_info=True)

    return {
        "message": "Contract signing link sent successfully",
        "signing_url": signing_url,
        "expires_at": contract_signature.signing_token_expires_at.isoformat(),
    }


@router.post("/{contract_id}/resend")
async def resend_contract_email(
    contract_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Resend contract signing email to client"""
    # Get the contract signature
    result = await db.execute(
        select(ContractSignature, Project, Client)
        .join(Project, ContractSignature.project_id == Project.id)
        .join(Client, ContractSignature.client_id == Client.id)
        .where(and_(ContractSignature.id == contract_id, Project.user_id == current_user.id))
    )
    contract_data = result.first()

    if not contract_data:
        raise HTTPException(status_code=404, detail="Contract not found")

    contract_signature, project, client = contract_data

    if contract_signature.signed:
        raise HTTPException(status_code=400, detail="Contract already signed")

    # Refresh signing token if expired (use timezone-aware datetime)
    now_utc = datetime.now(timezone.utc)
    if contract_signature.signing_token_expires_at < now_utc:
        # Generate new signing token
        contract_signature.signing_token = secrets.token_urlsafe(32)
        contract_signature.signing_token_expires_at = now_utc + timedelta(days=7)
        await db.commit()
        await db.refresh(contract_signature)

    # Build signing URL
    from app.core.config import settings

    signing_url = f"{settings.frontend_url}/contracts/sign/{contract_signature.signing_token}"

    # Get user's currency setting
    from app.models.user import UserSettings
    from app.utils.currency import format_currency

    result = await db.execute(select(UserSettings).where(UserSettings.user_id == current_user.id))
    user_settings = result.scalar_one_or_none()
    currency_code = user_settings.default_currency if user_settings else "USD"

    # Send email
    from app.utils.email import send_contract_signing_email

    try:
        await send_contract_signing_email(
            to_email=client.email,
            client_name=client.name,
            developer_name=current_user.full_name,
            developer_email=current_user.email,
            project_name=project.name,
            project_budget=format_currency(float(project.project_budget), currency_code),
            currency=currency_code,
            signing_url=signing_url,
        )
    except Exception as e:
        logger.error("Failed to resend contract signing email", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to resend contract signing email")

    return {
        "message": "Contract signing email resent successfully",
        "signing_url": signing_url,
        "expires_at": contract_signature.signing_token_expires_at.isoformat(),
    }


@router.get("/sign/{signing_token}")
async def get_contract_for_signing(signing_token: str, db: Session = Depends(get_db)):
    """Get contract for signing (public endpoint, no auth required)"""
    result = await db.execute(select(ContractSignature).where(ContractSignature.signing_token == signing_token))
    contract_signature = result.scalar_one_or_none()

    if not contract_signature:
        raise HTTPException(status_code=404, detail="Contract not found")

    # Check if token is expired (use timezone-aware datetime)
    now_utc = datetime.now(timezone.utc)
    if contract_signature.signing_token_expires_at < now_utc:
        raise HTTPException(
            status_code=400,
            detail="Signing link has expired. Please contact the developer for a new link.",
        )

    # Check if already signed
    if contract_signature.signed:
        raise HTTPException(status_code=400, detail="Contract already signed")

    # Get project, developer, and client info
    result = await db.execute(select(Project).where(Project.id == contract_signature.project_id))
    project = result.scalar_one_or_none()

    developer_name = None
    if project:
        result = await db.execute(select(User).where(User.id == project.user_id))
        developer = result.scalar_one_or_none()
        if developer:
            developer_name = developer.full_name

    # Get client info
    result = await db.execute(select(Client).where(Client.id == contract_signature.client_id))
    client = result.scalar_one_or_none()
    client_name = client.name if client else None

    return {
        "id": str(contract_signature.id),
        "project_id": str(contract_signature.project_id),
        "client_id": str(contract_signature.client_id),
        "contract_content": contract_signature.contract_content,
        "contract_pdf_url": contract_signature.contract_pdf_url,
        "signed": contract_signature.signed,
        "signed_at": contract_signature.signed_at.isoformat() if contract_signature.signed_at else None,
        "signing_token": contract_signature.signing_token,
        "signing_token_expires_at": contract_signature.signing_token_expires_at.isoformat(),
        "created_at": contract_signature.created_at.isoformat(),
        "developer_signed": contract_signature.developer_signed,
        "developer_signed_at": (
            contract_signature.developer_signed_at.isoformat() if contract_signature.developer_signed_at else None
        ),
        "developer_name_typed": contract_signature.developer_name_typed,
        "developer_name": developer_name,
        "client_name": client_name,
    }


@router.post("/sign/{signing_token}")
async def sign_contract(
    signing_token: str,
    signature_data: ContractSign,
    request: Request,
    db: Session = Depends(get_db),
):
    """Submit contract signature (public endpoint, no auth required)"""
    result = await db.execute(select(ContractSignature).where(ContractSignature.signing_token == signing_token))
    contract_signature = result.scalar_one_or_none()

    if not contract_signature:
        raise HTTPException(status_code=404, detail="Contract not found")

    # Check if token is expired (use timezone-aware datetime)
    now_utc = datetime.now(timezone.utc)
    if contract_signature.signing_token_expires_at < now_utc:
        raise HTTPException(status_code=400, detail="Signing link has expired")

    # Check if already signed
    if contract_signature.signed:
        raise HTTPException(status_code=400, detail="Contract already signed")

    # Get client IP and user agent
    client_ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "unknown")

    # Update contract signature
    contract_signature.signed = True
    contract_signature.signed_at = now_utc
    contract_signature.signature_ip = client_ip
    contract_signature.signature_user_agent = user_agent
    contract_signature.client_name_typed = signature_data.client_name_typed

    # Get the project and update status
    result = await db.execute(select(Project).where(Project.id == contract_signature.project_id))
    project = result.scalar_one_or_none()
    if project:
        project.contract_signed = True
        project.contract_signed_at = now_utc
        project.status = "active"  # Unlock scope guardrail setup
        project.contract_signature_data = {
            "ip": client_ip,
            "user_agent": user_agent,
            "signed_at": now_utc.isoformat(),
            "client_name": signature_data.client_name_typed,
        }

    await db.commit()
    await db.refresh(contract_signature)

    # Generate signed contract PDF
    pdf_url = None
    try:
        from app.utils.pdf_generator import generate_contract_pdf

        pdf_url = await generate_contract_pdf(db, contract_signature)
        logger.info("Generated signed contract PDF: %s", pdf_url)
    except Exception as e:
        logger.error("Failed to generate contract PDF: %s", e, exc_info=True)
        # Rollback the session to ensure it's usable for subsequent operations
        await db.rollback()
        # Continue even if PDF generation fails - emails can still be sent

    # Send email notification to developer via NATS
    try:
        # Get developer/user details
        result = await db.execute(select(User).where(User.id == project.user_id))
        developer = result.scalar_one_or_none()

        # Get client details
        result = await db.execute(select(Client).where(Client.id == contract_signature.client_id))
        client = result.scalar_one_or_none()

        if developer and client:
            from app.core.config import settings

            # Build project URL
            project_url = f"{settings.frontend_url}/projects/{project.id}"

            # Format signed date
            signed_date_formatted = contract_signature.signed_at.strftime("%B %d, %Y at %I:%M %p")

            # Publish event to NATS for email sending
            logger.info("Publishing contract signed confirmation email to NATS")
            try:
                from app.utils.nats_client import publish_event

                await publish_event(
                    "email.contract_signed_confirmation",
                    {
                        "to_email": developer.email,
                        "recipient_name": developer.full_name,
                        "project_name": project.name,
                        "signer_name": signature_data.client_name_typed,
                        "signed_date": signed_date_formatted,
                        "project_url": project_url,
                        "contract_signature_id": str(contract_signature.id),
                        "pdf_url": pdf_url,
                    },
                )
                logger.info("Contract signed confirmation email event published to NATS successfully")
            except Exception as e:
                logger.error(
                    "Failed to publish contract signed confirmation email",
                    exc_info=True,
                )

            # Generate client portal magic link
            try:
                from datetime import timedelta

                from app.models.client_portal_session import ClientPortalSession

                # Create magic link session for client
                magic_token = ClientPortalSession.generate_magic_token()
                portal_expires_at = now_utc + timedelta(days=30)  # 30-day access

                portal_session = ClientPortalSession(
                    client_id=client.id,
                    magic_token=magic_token,
                    ip_address=client_ip,
                    user_agent=user_agent,
                    expires_at=portal_expires_at,
                )
                db.add(portal_session)
                await db.commit()

                # Generate magic link URL
                magic_link = f"{settings.frontend_url}/client-portal/{magic_token}"

                # Publish event to NATS for email sending
                logger.info("Publishing client portal welcome email to NATS")
                try:
                    from app.utils.nats_client import publish_event

                    await publish_event(
                        "email.client_portal_welcome",
                        {
                            "to_email": client.email,
                            "client_name": client.name,
                            "developer_name": developer.full_name,
                            "project_name": project.name,
                            "magic_link": magic_link,
                            "contract_signature_id": str(contract_signature.id),
                            "pdf_url": pdf_url,
                        },
                    )
                    logger.info("Client portal welcome email event published to NATS successfully")
                except Exception as e:
                    logger.error("Failed to publish client portal welcome email", exc_info=True)

            except Exception as e:
                logger.error("Failed to generate client portal access", exc_info=True)

    except Exception as e:
        logger.error("Failed to process contract signed notification", exc_info=True)

    # Publish event (will trigger PDF generation and email sending in subtask 6.5)
    # Using background publish for non-critical event notification
    try:
        logger.info(
            "Publishing contract.signed event for project %s",
            contract_signature.project_id,
        )
        from app.utils.nats_client import publish_contract_status_changed, publish_event, publish_project_status_changed

        # 1. Publish generic event for backend processing
        await publish_event(
            "contract.signed",
            {
                "event_type": "contract_signed",
                "timestamp": (contract_signature.signed_at.isoformat() if contract_signature.signed_at else None),
                "data": {
                    "project_id": str(contract_signature.project_id),
                    "client_id": str(contract_signature.client_id),
                    "contract_id": str(contract_signature.id),
                    "message": f"Contract signed for project {contract_signature.project_id}",
                },
            },
            background=True,
        )

        # 2. Publish real-time UI update events
        await publish_contract_status_changed(
            {
                "contract_id": str(contract_signature.id),
                "project_id": str(contract_signature.project_id),
                "status": "signed",
                "user_id": str(project.user_id),
            }
        )

        await publish_project_status_changed(
            {
                "project_id": str(contract_signature.project_id),
                "status": "active",
                "user_id": str(project.user_id),
            }
        )

        logger.info("Successfully published real-time update events")
    except Exception as e:
        logger.warning("Failed to publish contract signed event", exc_info=True)

    # Log activity for contract signing
    try:
        await log_contract_activity(
            db=db,
            user_id=project.user_id,  # Log under of project owner
            contract_id=contract_signature.id,
            action="signed",
            title=f"Contract signed by: {client.name}",
            description=f"Contract for project: {project.name}",
        )
    except Exception as e:
        logger.warning("Failed to log contract signing activity", exc_info=True)

    # Create notification for contract signing (important - schedule payments)
    try:
        await create_notification(
            db=db,
            user_id=project.user_id,
            notification_type="alert",  # Alert to emphasize importance
            title="Contract signed! Schedule payments now",
            message=f"{client.name} signed the contract for {project.name}. Go to Invoices to set up your payment schedule.",
            action_url=f"/invoices?tab=payment-schedule",
            entity_type="contract",
            entity_id=contract_signature.id,
        )
    except Exception as e:
        logger.warning("Failed to create contract signing notification", exc_info=True)

    return {
        "message": "Contract signed successfully",
        "signed_at": contract_signature.signed_at.isoformat(),
        "project_id": contract_signature.project_id,
    }


@router.post("/decline/{signing_token}")
async def decline_contract(signing_token: str, request: Request, db: Session = Depends(get_db)):
    """Decline contract signing (public endpoint, no auth required)"""
    result = await db.execute(select(ContractSignature).where(ContractSignature.signing_token == signing_token))
    contract_signature = result.scalar_one_or_none()

    if not contract_signature:
        raise HTTPException(status_code=404, detail="Contract not found")

    # Check if token is expired (use timezone-aware datetime)
    now_utc = datetime.now(timezone.utc)
    if contract_signature.signing_token_expires_at < now_utc:
        raise HTTPException(status_code=400, detail="Signing link has expired")

    # Check if already signed
    if contract_signature.signed:
        raise HTTPException(status_code=400, detail="Contract already signed")

    # Get the project and update status
    result = await db.execute(select(Project).where(Project.id == contract_signature.project_id))
    project = result.scalar_one_or_none()
    if project:
        project.status = "cancelled"

    # Send email notification to developer via NATS before deleting contract
    project_id = contract_signature.project_id
    try:
        if project:
            # Get developer/user details
            result = await db.execute(select(User).where(User.id == project.user_id))
            developer = result.scalar_one_or_none()

            # Get client details
            result = await db.execute(select(Client).where(Client.id == contract_signature.client_id))
            client = result.scalar_one_or_none()

            if developer and client:
                # Format declined date
                declined_date_formatted = datetime.utcnow().strftime("%B %d, %Y at %I:%M %p")

                # Publish event to NATS for email sending
                logger.info("Publishing contract declined email to NATS")
                try:
                    from app.utils.nats_client import publish_event

                    await publish_event(
                        "email.contract_declined",
                        {
                            "to_email": developer.email,
                            "developer_name": developer.full_name,
                            "project_name": project.name,
                            "client_name": client.name,
                            "client_email": client.email,
                            "declined_date": declined_date_formatted,
                        },
                    )
                    logger.info("Contract declined email event published to NATS successfully")
                except Exception as e:
                    logger.error("Failed to publish contract declined email", exc_info=True)
    except Exception as e:
        logger.error("Failed to process contract declined notification", exc_info=True)

    # Delete the contract signature
    await db.delete(contract_signature)
    await db.commit()

    # Publish event
    try:
        from app.utils.nats_client import publish_contract_status_changed, publish_message, publish_project_status_changed

        await publish_message(
            "contract.declined",
            f"Contract declined for project {project.id if project else 'unknown'}",
        )

        if project:
            # Publish real-time UI update events
            await publish_contract_status_changed(
                {
                    "contract_id": str(contract_signature.id),
                    "project_id": str(project.id),
                    "status": "declined",
                    "user_id": str(project.user_id),
                }
            )

            await publish_project_status_changed(
                {
                    "project_id": str(project.id),
                    "status": "cancelled",
                    "user_id": str(project.user_id),
                }
            )

    except Exception as e:
        logger.warning("Failed to publish contract declined event", exc_info=True)

    return {"message": "Contract declined successfully", "project_id": project_id}
