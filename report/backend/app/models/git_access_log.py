import uuid

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.sql import func

from app.db.database import Base


class GitAccessLog(Base):
    __tablename__ = "git_access_logs"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    project_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    action = Column(String(50), nullable=False)  # 'grant', 'revoke', 'restore'
    repository_url = Column(String(500), nullable=False)
    provider = Column(String(50), nullable=False)  # 'github', 'gitlab', 'bitbucket'

    reason = Column(String(255), nullable=True)  # 'auto_pause', 'manual', 'retainer_replenished'
    success = Column(Boolean, nullable=False)
    error_message = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def __str__(self):
        return f"GitAccessLog(id={self.id}, project_id={self.project_id}, action={self.action})"
