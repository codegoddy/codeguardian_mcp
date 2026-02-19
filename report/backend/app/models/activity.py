"""Activity model for tracking user/system actions."""

import uuid

from sqlalchemy import Column, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.sql import func

from app.db.database import Base


class Activity(Base):
    """
    Activity log for user/system actions.

    Activities are informational - they show what happened but don't require action.
    Examples: commit detected, invoice generated, deliverable completed, contract signed.
    """

    __tablename__ = "activities"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # What entity was acted upon
    entity_type = Column(String(50), nullable=False, index=True)
    # Values: 'project', 'deliverable', 'contract', 'invoice', 'time_entry', 'change_request', 'client'
    entity_id = Column(PGUUID(as_uuid=True), nullable=False, index=True)

    # What action was performed
    action = Column(String(50), nullable=False)
    # Values: 'created', 'updated', 'completed', 'signed', 'generated', 'deleted', 'status_changed'

    # Display fields
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)

    # Activity type for styling (maps to icon colors)
    activity_type = Column(String(50), nullable=False, default="default")
    # Values: 'commit', 'invoice', 'deliverable', 'contract', 'project', 'time_entry', 'default'

    # Additional context (e.g., old_status, new_status, commit_hash, amount)
    extra_data = Column(JSONB, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    def __str__(self):
        return f"Activity(id={self.id}, type={self.activity_type}, action={self.action})"
