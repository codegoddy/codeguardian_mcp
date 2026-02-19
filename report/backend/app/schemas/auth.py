from typing import Any, Dict, Literal, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.common.validators import validate_oauth_provider, validate_password_strength


class UserBase(BaseModel):
    email: EmailStr = Field(..., description="User email address")
    full_name: str = Field(..., min_length=1, max_length=200, description="User's full name")


class UserCreate(UserBase):
    password: str = Field(
        ...,
        min_length=8,
        max_length=128,
        description="User password (min 8 chars, uppercase, lowercase, digit)",
    )

    @field_validator("password")
    @classmethod
    def validate_password(cls, v):
        return validate_password_strength(v)


class UserLogin(BaseModel):
    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., description="User password")


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str


class TokenData(BaseModel):
    email: Optional[str] = None


class OTPRequest(BaseModel):
    email: EmailStr = Field(..., description="Email to send OTP to")


class OTPVerify(BaseModel):
    email: EmailStr = Field(..., description="Email to verify")
    otp: str = Field(..., min_length=6, max_length=6, description="6-digit OTP code")


class OAuthLoginResponse(BaseModel):
    authorization_url: str
    state: str = Field(
        ...,
        min_length=16,
        max_length=64,
        description="OAuth state parameter for CSRF protection",
    )


class OAuthCallback(BaseModel):
    code: str = Field(..., min_length=10, max_length=500, description="OAuth authorization code")
    state: str = Field(
        ...,
        min_length=16,
        max_length=64,
        description="OAuth state parameter (must match login state)",
    )


class OAuthUser(BaseModel):
    email: str = Field(..., description="OAuth user email")
    full_name: str = Field(..., description="OAuth user full name")
    is_oauth: bool = Field(default=True, description="Flag indicating OAuth authentication")
    provider: Literal["google", "github", "gitlab", "bitbucket"] = Field(..., description="OAuth provider")
    new_account: Optional[bool] = Field(default=False, description="New account flag")
    linked_account: Optional[bool] = Field(default=False, description="Linked account flag")

    @field_validator("provider")
    @classmethod
    def validate_provider(cls, v):
        return validate_oauth_provider(v)


class OAuthTokenResponse(Token):
    user: OAuthUser


class TokenRefresh(BaseModel):
    refresh_token: str = Field(..., description="Refresh token")


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
