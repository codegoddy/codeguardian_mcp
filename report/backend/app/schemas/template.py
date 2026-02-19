from datetime import datetime
from typing import Any, Dict, Optional
from uuid import UUID

from pydantic import BaseModel


class ProjectTemplateBase(BaseModel):
    name: str
    description: Optional[str] = None
    category: Optional[str] = None  # 'web_app', 'mobile_app', 'api', 'ecommerce', etc.
    template_type: Optional[str] = "code"  # 'code' or 'no-code'
    template_data: Dict[str, Any]  # Milestones, deliverables, default rates, etc.


class ProjectTemplateCreate(ProjectTemplateBase):
    is_public: bool = False


class ProjectTemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    template_type: Optional[str] = None
    template_data: Optional[Dict[str, Any]] = None
    is_public: Optional[bool] = None


class ProjectTemplateResponse(ProjectTemplateBase):
    id: UUID
    user_id: Optional[UUID]  # None for system templates
    is_system_template: bool
    is_public: bool
    usage_count: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TemplateUse(BaseModel):
    """Use a template to create a project"""

    template_id: UUID
    customizations: Optional[Dict[str, Any]] = None  # Override template values
