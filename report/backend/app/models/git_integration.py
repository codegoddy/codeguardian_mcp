import uuid

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.database import Base


class GitIntegration(Base):
    """Git platform integration (GitHub, GitLab, Bitbucket)"""

    __tablename__ = "git_integrations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    platform = Column(String(50), nullable=False)  # github, gitlab, bitbucket
    username = Column(String(255), nullable=True)
    access_token = Column(Text, nullable=False)  # Should be encrypted
    refresh_token = Column(Text, nullable=True)  # Should be encrypted
    token_expires_at = Column(DateTime, nullable=True)
    connected_at = Column(DateTime, server_default=func.now(), nullable=False)
    last_synced_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)

    # Relationships
    user = relationship("User", back_populates="git_integrations")
    repositories = relationship("GitRepository", back_populates="integration", cascade="all, delete-orphan")
