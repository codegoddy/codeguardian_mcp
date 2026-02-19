from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class WaitlistCreate(BaseModel):
    email: EmailStr = Field(..., description="User's email address")
    full_name: str = Field(..., min_length=1, max_length=255, description="User's full name")
    company: Optional[str] = Field(None, max_length=255, description="User's company name")

    class Config:
        json_schema_extra = {
            "example": {
                "email": "developer@example.com",
                "full_name": "John Doe",
                "company": "Tech Startup Inc",
            }
        }


class WaitlistResponse(BaseModel):
    id: UUID
    email: str
    full_name: str
    company: Optional[str]
    notified: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class WaitlistCountResponse(BaseModel):
    count: int
    notified_count: int
    pending_count: int
