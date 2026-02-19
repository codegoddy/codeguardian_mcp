"""Notification model for items requiring user attention."""

import uuid

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.sql import func

from app.db.database import Base


class Notification(Base):
    """
    Notifications for items requiring user attention or action.

    Notifications are actionable - they need user acknowledgment.
    Examples: payment reminder, budget alert, pending review, client message.
    """

    __tablename__ = "notifications"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Notification type for styling (maps to icon colors)
    notification_type = Column(String(50), nullable=False, default="notification")
    # Values: 'notification' (blue), 'alert' (red), 'update' (green), 'reminder' (yellow)

    # Display fields
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)

    # Read status
    is_read = Column(Boolean, default=False, index=True)

    # Optional action URL (where to navigate when clicked)
    action_url = Column(String(500), nullable=True)

    # Optional entity reference (for linking to specific items)
    entity_type = Column(String(50), nullable=True)
    # Values: 'project', 'invoice', 'deliverable', 'contract', 'change_request'
    entity_id = Column(PGUUID(as_uuid=True), nullable=True)

    # Additional context
    extra_data = Column(JSONB, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    def __str__(self):
        return f"Notification(id={self.id}, type={self.notification_type}, read={self.is_read})"
