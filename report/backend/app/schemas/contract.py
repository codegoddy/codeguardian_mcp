from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class ContractTemplateBase(BaseModel):
    name: str
    description: Optional[str] = None
    template_content: str  # Markdown/HTML with placeholders


class ContractTemplateCreate(ContractTemplateBase):
    is_default: bool = False


class ContractTemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    template_content: Optional[str] = None
    is_default: Optional[bool] = None


class ContractTemplateSave(BaseModel):
    template_content: str


class ContractTemplateResponse(ContractTemplateBase):
    id: UUID
    user_id: UUID
    is_default: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ContractGenerate(BaseModel):
    project_id: UUID
    template_id: Optional[UUID] = None  # Use default if not provided


class ContractUpload(BaseModel):
    project_id: UUID
    contract_pdf_url: str  # URL after uploading to Cloudinary


class ContractSend(BaseModel):
    project_id: UUID


class ContractSignatureBase(BaseModel):
    project_id: UUID
    client_id: UUID
    contract_content: str


class ContractSignatureCreate(ContractSignatureBase):
    signing_token: str
    signing_token_expires_at: datetime


class ContractSign(BaseModel):
    client_name_typed: str  # Client types their name as signature


class DeveloperContractSign(BaseModel):
    developer_name_typed: str  # Developer types their name as signature


class ContractSignatureResponse(ContractSignatureBase):
    id: UUID
    contract_pdf_url: Optional[str]
    signed: bool
    signed_at: Optional[datetime]
    signature_ip: Optional[str]
    signature_user_agent: Optional[str]
    client_name_typed: Optional[str]
    # Developer signature fields
    developer_signed: bool = False
    developer_signed_at: Optional[datetime] = None
    developer_name_typed: Optional[str] = None
    signing_token: str
    signing_token_expires_at: datetime
    created_at: datetime

    class Config:
        from_attributes = True
