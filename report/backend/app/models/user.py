import uuid

from sqlalchemy import JSON, Boolean, Column, DateTime, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=False)
    hashed_password = Column(String, nullable=True)  # Make password optional for OAuth users
    is_active = Column(Boolean, default=True)

    # OAuth fields
    provider = Column(String, nullable=True)  # 'google', 'github', 'gitlab', 'bitbucket'
    provider_id = Column(String, nullable=True)  # OAuth provider's user ID
    provider_data = Column(JSON, nullable=True)  # Store additional provider-specific data

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    time_tracker_integrations = relationship("TimeTrackerIntegration", back_populates="user", cascade="all, delete-orphan")
    git_integrations = relationship("GitIntegration", back_populates="user", cascade="all, delete-orphan")
    time_sessions = relationship("TimeSession", back_populates="user", cascade="all, delete-orphan")
    planned_time_blocks = relationship("PlannedTimeBlock", back_populates="user", cascade="all, delete-orphan")
    google_calendar_integration = relationship(
        "GoogleCalendarIntegration",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
    )

    def __str__(self):
        return f"User(id={self.id}, email={self.email}, provider={self.provider})"

    @property
    def is_oauth_user(self):
        return self.provider is not None

    @property
    def can_login_with_password(self):
        return not self.is_oauth_user and self.hashed_password is not None


class UserSettings(Base):
    __tablename__ = "user_settings"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(PGUUID(as_uuid=True), nullable=False, unique=True, index=True)

    # Profile
    profile_image_url = Column(Text, nullable=True)  # Changed from String(500) to Text for long Supabase URLs
    bio = Column(Text, nullable=True)

    # Preferences
    default_currency = Column(String(3), default="USD")
    timezone = Column(String(50), default="UTC")
    date_format = Column(String(20), default="YYYY-MM-DD")
    time_format = Column(String(20), default="24h")

    # Notification preferences
    email_notifications = Column(Boolean, default=True)
    auto_pause_notifications = Column(Boolean, default=True)
    contract_signed_notifications = Column(Boolean, default=True)
    payment_received_notifications = Column(Boolean, default=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __str__(self):
        return f"UserSettings(user_id={self.user_id}, currency={self.default_currency})"
