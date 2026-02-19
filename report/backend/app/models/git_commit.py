import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.db.database import Base


class GitCommit(Base):
    """Git commit tracked for time calculation"""

    __tablename__ = "git_commits"
    __table_args__ = (UniqueConstraint("repository_id", "commit_sha", name="uq_repo_commit"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    repository_id = Column(
        UUID(as_uuid=True),
        ForeignKey("git_repositories.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    commit_sha = Column(String(40), nullable=False)
    author_email = Column(String(255), nullable=False)
    author_name = Column(String(255), nullable=True)
    message = Column(Text, nullable=True)
    committed_at = Column(DateTime, nullable=False)
    branch = Column(String(255), nullable=True)
    files_changed = Column(Integer, nullable=True)
    insertions = Column(Integer, nullable=True)
    deletions = Column(Integer, nullable=True)
    deliverable_id = Column(
        UUID(as_uuid=True),
        ForeignKey("deliverables.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Relationships
    repository = relationship("GitRepository", back_populates="commits")
    deliverable = relationship("Deliverable", back_populates="git_commits")
