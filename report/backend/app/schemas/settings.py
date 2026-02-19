from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, field_validator


class UserSettingsBase(BaseModel):
    bio: Optional[str] = None
    default_currency: str = "USD"
    timezone: str = "UTC"
    date_format: str = "YYYY-MM-DD"
    time_format: str = "24h"  # '12h' or '24h'


class UserSettingsUpdate(BaseModel):
    bio: Optional[str] = None
    default_currency: Optional[str] = None
    timezone: Optional[str] = None
    date_format: Optional[str] = None
    time_format: Optional[str] = None
    email_notifications: Optional[bool] = None
    auto_pause_notifications: Optional[bool] = None
    contract_signed_notifications: Optional[bool] = None
    payment_received_notifications: Optional[bool] = None

    @field_validator("default_currency")
    @classmethod
    def validate_currency(cls, v):
        if v is not None and len(v) != 3:
            raise ValueError("Currency code must be exactly 3 characters (e.g., USD, EUR, GBP)")
        return v

    @field_validator("time_format")
    @classmethod
    def validate_time_format(cls, v):
        if v is not None and v not in ["12h", "24h"]:
            raise ValueError('Time format must be either "12h" or "24h"')
        return v


class UserSettingsResponse(UserSettingsBase):
    id: UUID
    user_id: UUID
    profile_image_url: Optional[str]
    email_notifications: bool
    auto_pause_notifications: bool
    contract_signed_notifications: bool
    payment_received_notifications: bool
    created_at: datetime
    updated_at: datetime
    # User profile fields
    full_name: str
    email: str
    provider: Optional[str]
    is_oauth_user: bool
    can_change_password: bool

    class Config:
        from_attributes = True


class ProfileImageUpload(BaseModel):
    """Response after uploading profile image"""

    profile_image_url: str
