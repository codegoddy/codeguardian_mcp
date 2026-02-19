import uuid

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.database import Base


class GitRepository(Base):
    """Git repository linked to a project"""

    __tablename__ = "git_repositories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    integration_id = Column(
        UUID(as_uuid=True),
        ForeignKey("git_integrations.id", ondelete="CASCADE"),
        nullable=False,
    )
    project_id = Column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    repo_url = Column(String(500), nullable=False)
    repo_name = Column(String(255), nullable=False)
    repo_full_name = Column(String(255), nullable=False)  # e.g., "owner/repo"
    repository_purpose = Column(String(50), nullable=True)  # e.g., "frontend", "backend", "mobile", "infrastructure"
    default_branch = Column(String(255), default="main", nullable=False)
    webhook_id = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    # Relationships
    integration = relationship("GitIntegration", back_populates="repositories")
    project = relationship("Project", back_populates="git_repositories")
    commits = relationship("GitCommit", back_populates="repository", cascade="all, delete-orphan")
