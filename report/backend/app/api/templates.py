"""
Project Templates API endpoints.
Provides system templates and allows users to create custom templates.
"""

import uuid
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.contracts import generate_and_send_contract
from app.core.auth import get_current_user
from app.core.logging_config import get_logger
from app.db.database import get_db
from app.models.deliverable import Deliverable
from app.models.milestone import Milestone
from app.models.project import Project
from app.models.project_template import ProjectTemplate
from app.models.user import User
from app.schemas.template import ProjectTemplateCreate, ProjectTemplateResponse, ProjectTemplateUpdate, TemplateUse
from app.services.activity_service import create_activity
from app.services.deliverable_linker import DeliverableLinker
from app.utils.seed_templates import get_system_templates

logger = get_logger(__name__)

router = APIRouter(prefix="/templates", tags=["templates"])


class TemplateApplyOptions(BaseModel):
    custom_template_data: Optional[dict] = None


@router.post("/{template_id}/apply/{project_id}", response_model=dict)
async def apply_template(
    template_id: UUID,
    project_id: UUID,
    options: Optional[TemplateApplyOptions] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Apply a template to a project.
    This updates the project with template info and triggers contract generation.
    """
    # 1. Get the project
    result = await db.execute(select(Project).where(and_(Project.id == project_id, Project.user_id == current_user.id)))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    # 2. Get the template from database (both system and custom templates are now persisted)
    result = await db.execute(select(ProjectTemplate).where(ProjectTemplate.id == template_id))
    template = result.scalar_one_or_none()

    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")

    # 3. Check permissions for custom templates (system templates are accessible to all)
    if not template.is_system_template:
        user_owns = template.user_id == current_user.id
        is_public = template.is_public is True

        if not user_owns and not is_public:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have permission to use this template",
            )

    # 4. Update project with template information
    project.applied_template_id = template_id
    project.applied_template_name = template.name
    project.applied_template_type = template.template_type or "custom"

    # Create milestones and deliverables from template data
    # Use custom data if provided (e.g. from AI estimation), otherwise use stored template data
    template_data = options.custom_template_data if options and options.custom_template_data else template.template_data
    milestones_data = template_data.get("milestones", [])

    # Initialize linker for tracking codes
    linker = DeliverableLinker()
    sequence = 1
    prefix = project.project_prefix or "PRJ"

    for milestone_data in milestones_data:
        milestone = Milestone(
            project_id=project.id,
            name=milestone_data["name"],
            order=milestone_data.get("order", 0),
            status="pending",
        )
        db.add(milestone)
        await db.flush()  # Flush to get milestone.id

        for deliverable_data in milestone_data.get("deliverables", []):
            # Generate tracking code
            tracking_code = linker.generate_tracking_code(prefix, sequence)
            sequence += 1

            deliverable = Deliverable(
                project_id=project.id,
                milestone_id=milestone.id,
                title=deliverable_data["title"],
                description=deliverable_data.get("description"),
                estimated_hours=deliverable_data.get("estimated_hours"),
                acceptance_criteria=deliverable_data.get("acceptance_criteria"),
                status="pending",
                tracking_code=tracking_code,
                # AI Estimation fields
                ai_estimated=deliverable_data.get("ai_estimated", False),
                ai_confidence=deliverable_data.get("ai_confidence"),
                ai_reasoning=deliverable_data.get("ai_reasoning"),
                ai_estimated_at=(datetime.utcnow() if deliverable_data.get("ai_estimated") else None),
                original_estimated_hours=deliverable_data.get("original_estimated_hours"),
            )
            db.add(deliverable)

    await db.commit()

    # 5. Generate and send contract
    await generate_and_send_contract(
        project_id=project.id,
        template_id=None,  # Contract template ID (not project template)
        current_user=current_user,
        db=db,
    )

    # Log activity for template applied
    try:
        await create_activity(
            db=db,
            user_id=current_user.id,
            entity_type="project",
            entity_id=project.id,
            action="template_applied",
            title=f"Applied template: {template.name}",
            description=f"To project: {project.name}",
        )
    except Exception as e:
        logger.warning("Failed to log template application activity", exc_info=True)

    return {"message": "Template applied successfully", "project_id": str(project.id)}


@router.get("/tasks/{task_id}", response_model=dict)
async def get_task_status(task_id: str, current_user: User = Depends(get_current_user)):
    """Get the status of a background task"""
    from app.utils.redis_client import RedisCache

    task = await RedisCache.get_task(task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    # Verify user owns this task
    if task.get("user_id") != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view this task",
        )

    return task


@router.get("", response_model=List[ProjectTemplateResponse])
async def get_all_templates(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """
    Get all templates (system + user's custom templates).
    System templates are available to all users.
    Custom templates are only visible to the user who created them.
    """

    result = await db.execute(select(ProjectTemplate).where(ProjectTemplate.is_system_template == True))
    system_templates = result.scalars().all()

    # Get user's custom templates from database
    result = await db.execute(
        select(ProjectTemplate).where(
            and_(
                ProjectTemplate.user_id == current_user.id,
                ProjectTemplate.is_system_template == False,
            )
        )
    )
    custom_templates = result.scalars().all()

    # Combine and return
    all_templates = [ProjectTemplateResponse.model_validate(t) for t in system_templates] + [
        ProjectTemplateResponse.model_validate(t) for t in custom_templates
    ]

    return all_templates


@router.get("/system", response_model=List[ProjectTemplateResponse])
async def get_system_templates_endpoint(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Get only system-provided templates with Redis caching."""
    from app.utils.redis_client import RedisCache

    # Try to get from cache first
    cached_templates = await RedisCache.get_cached_system_templates()
    if cached_templates:
        logger.info("CACHE HIT: System templates loaded from Redis")
        return [ProjectTemplateResponse(**t) for t in cached_templates]

    logger.info("CACHE MISS: Loading system templates from database")

    # Get system templates from database
    result = await db.execute(select(ProjectTemplate).where(ProjectTemplate.is_system_template == True))
    system_templates = result.scalars().all()

    templates = [ProjectTemplateResponse.model_validate(t) for t in system_templates]

    # Cache for future requests (7 days)
    await RedisCache.cache_system_templates([t.model_dump() for t in templates])
    logger.info("CACHE STORED: System templates cached in Redis for 7 days")

    return templates


@router.get("/custom", response_model=List[ProjectTemplateResponse])
async def get_custom_templates(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Get only user's custom templates."""
    result = await db.execute(
        select(ProjectTemplate).where(
            and_(
                ProjectTemplate.user_id == current_user.id,
                ProjectTemplate.is_system_template == False,
            )
        )
    )
    templates = result.scalars().all()

    return [ProjectTemplateResponse.model_validate(t) for t in templates]


@router.get("/{template_id}", response_model=ProjectTemplateResponse)
async def get_template(
    template_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific template by ID."""
    result = await db.execute(select(ProjectTemplate).where(ProjectTemplate.id == template_id))
    template = result.scalar_one_or_none()

    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")

    # Check permissions
    user_owns = template.user_id == current_user.id
    is_public = template.is_public is True

    if not user_owns and not is_public:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to access this template",
        )

    return ProjectTemplateResponse.model_validate(template)


@router.post("", response_model=ProjectTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_custom_template(
    template_data: ProjectTemplateCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new custom template."""
    new_template = ProjectTemplate(
        user_id=current_user.id,
        name=template_data.name,
        description=template_data.description,
        category=template_data.category,
        template_type=template_data.template_type or "code",
        template_data=template_data.template_data,
        is_system_template=False,
        is_public=template_data.is_public,
        usage_count=0,
    )

    db.add(new_template)
    await db.commit()
    await db.refresh(new_template)

    # Log activity for template creation
    try:
        await create_activity(
            db=db,
            user_id=current_user.id,
            entity_type="template",
            entity_id=new_template.id,
            action="created",
            title=f"Created template: {new_template.name}",
            description=new_template.category or None,
        )
    except Exception as e:
        logger.warning("Failed to log template creation activity", exc_info=True)

    return ProjectTemplateResponse.model_validate(new_template)


@router.put("/{template_id}", response_model=ProjectTemplateResponse)
async def update_custom_template(
    template_id: UUID,
    template_data: ProjectTemplateUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a custom template."""
    result = await db.execute(select(ProjectTemplate).where(ProjectTemplate.id == template_id))
    template = result.scalar_one_or_none()

    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")

    # Check if it's a system template
    is_system = template.is_system_template is True
    if is_system:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot update system templates",
        )

    # Check ownership
    user_owns = template.user_id == current_user.id
    if not user_owns:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to update this template",
        )

    # Update fields
    update_data = template_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(template, field, value)

    await db.commit()
    await db.refresh(template)

    # Log activity for template update
    try:
        await create_activity(
            db=db,
            user_id=current_user.id,
            entity_type="template",
            entity_id=template.id,
            action="updated",
            title=f"Updated template: {template.name}",
            description=None,
        )
    except Exception as e:
        logger.warning("Failed to log template update activity", exc_info=True)

    return ProjectTemplateResponse.model_validate(template)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_custom_template(
    template_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a custom template."""
    result = await db.execute(select(ProjectTemplate).where(ProjectTemplate.id == template_id))
    template = result.scalar_one_or_none()

    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")

    # Check if it's a system template
    is_system = template.is_system_template is True
    if is_system:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot delete system templates",
        )

    # Check ownership
    user_owns = template.user_id == current_user.id
    if not user_owns:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to delete this template",
        )

    template_name = template.name  # Store before delete
    await db.delete(template)
    await db.commit()

    # Log activity for template deletion
    try:
        await create_activity(
            db=db,
            user_id=current_user.id,
            entity_type="template",
            entity_id=template_id,
            action="deleted",
            title=f"Deleted template: {template_name}",
            description=None,
        )
    except Exception as e:
        logger.warning("Failed to log template deletion activity", exc_info=True)

    return None
