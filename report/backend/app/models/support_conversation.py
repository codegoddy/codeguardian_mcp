"""
Support Conversation Model
Stores AI chat conversations with 30-day retention
"""

import uuid

from sqlalchemy import Column, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.sql import func

from app.db.database import Base


class SupportConversation(Base):
    """Stores support chat conversations for each user"""

    __tablename__ = "support_conversations"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Messages stored as JSONB array
    # Format: [{"role": "user"|"assistant", "content": "...", "timestamp": "ISO8601"}]
    messages = Column(JSONB, default=list, nullable=False)

    # Title/summary for the conversation (auto-generated from first message)
    title = Column(String(200), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __str__(self):
        return f"SupportConversation(id={self.id}, user_id={self.user_id})"
