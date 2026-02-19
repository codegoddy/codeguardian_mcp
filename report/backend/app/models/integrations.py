"""
Time Tracker Integration Models
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import relationship

from app.db.database import Base


class TimeTrackerIntegration(Base):
    """
    Stores time tracker integrations (Toggl, Harvest)
    One token per user per provider
    """

    __tablename__ = "time_tracker_integrations"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    provider = Column(String(50), nullable=False)  # 'toggl' or 'harvest'
    api_token_encrypted = Column(Text, nullable=False)  # Encrypted API token
    provider_user_id = Column(String(255), nullable=True)  # User ID from the provider
    provider_username = Column(String(255), nullable=True)  # Username from the provider
    account_id = Column(String(255), nullable=True)  # For Harvest Account ID
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", back_populates="time_tracker_integrations")

    def __repr__(self):
        return f"<TimeTrackerIntegration(id={self.id}, user_id={self.user_id}, provider={self.provider})>"
