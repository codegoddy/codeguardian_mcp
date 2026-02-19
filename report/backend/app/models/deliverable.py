import uuid

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.database import Base


class Deliverable(Base):
    __tablename__ = "deliverables"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    project_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    milestone_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("milestones.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    task_reference = Column(String(50), nullable=True, index=True)  # e.g., "DEVHQ-101"
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    acceptance_criteria = Column(Text, nullable=True)  # For auto-documentation
    status = Column(String(50), default="pending", index=True)
    # Status values: 'pending', 'in_progress', 'completed', 'verified', 'billed'
    is_in_scope = Column(Boolean, default=True)
    is_approved = Column(Boolean, default=False)

    # Work classification
    work_type = Column(String(50), nullable=True)  # 'feature', 'bugfix', 'refactor', 'documentation', 'meeting', 'other'
    developer_notes = Column(Text, nullable=True)
    notes_visible_to_client = Column(Boolean, default=True)

    # Git verification and automation
    tracking_code = Column(String(50), nullable=True, unique=True)  # e.g., 'WEB-001', 'API-042'
    git_branch_pattern = Column(String(255), nullable=True)  # Expected branch pattern
    git_pr_url = Column(String(500), nullable=True)
    git_pr_number = Column(Integer, nullable=True)
    git_commit_hash = Column(String(100), nullable=True)
    git_merge_status = Column(String(50), nullable=True)
    git_branch_name = Column(String(255), nullable=True)
    preview_url = Column(String(500), nullable=True)  # Preview environment URL
    verified_at = Column(DateTime(timezone=True), nullable=True)
    auto_verified = Column(Boolean, default=False)

    # Auto-generated documentation
    documentation_markdown = Column(Text, nullable=True)
    documentation_generated_at = Column(DateTime(timezone=True), nullable=True)

    # Time and cost
    estimated_hours = Column(Numeric(10, 2), nullable=True)
    actual_hours = Column(Numeric(10, 2), default=0)
    total_cost = Column(Numeric(10, 2), default=0)

    # AI estimation
    ai_estimated = Column(Boolean, default=False)
    ai_confidence = Column(Numeric(5, 2), nullable=True)  # 0-100 confidence score
    ai_reasoning = Column(Text, nullable=True)  # AI's explanation for the estimate
    ai_estimated_at = Column(DateTime(timezone=True), nullable=True)
    original_estimated_hours = Column(Numeric(10, 2), nullable=True)  # Original template estimate before AI

    # Planning and scheduling
    deadline = Column(DateTime(timezone=True), nullable=True)
    priority = Column(String(20), default="medium")  # 'low', 'medium', 'high'

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    git_commits = relationship("GitCommit", back_populates="deliverable")

    def __str__(self):
        return f"Deliverable(id={self.id}, title={self.title}, status={self.status})"
