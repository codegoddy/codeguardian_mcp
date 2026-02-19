import uuid

from sqlalchemy import JSON, Boolean, Column, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.database import Base


class Project(Base):
    __tablename__ = "projects"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    client_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("clients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(50), default="awaiting_contract", index=True)
    # Status values: 'awaiting_contract', 'contract_sent', 'active', 'paused', 'completed', 'cancelled'

    # Financial configuration
    project_budget = Column(Numeric(10, 2), nullable=False, default=0)
    current_budget_remaining = Column(Numeric(10, 2), nullable=False, default=0)
    auto_replenish = Column(Boolean, default=False)
    auto_pause_threshold = Column(Numeric(5, 2), default=10.00)  # Percentage of budget

    # Technical configuration
    max_revisions = Column(Integer, default=3)
    current_revision_count = Column(Integer, default=0)
    allowed_repositories = Column(JSON, nullable=True)  # Array of repo URLs
    project_prefix = Column(String(10), nullable=True, unique=True)  # e.g., 'WEB', 'API'

    # Time tracker integration (for no-code projects)
    time_tracker_provider = Column(String(50), nullable=True)  # 'toggl' or 'harvest'
    time_tracker_project_id = Column(String(255), nullable=True)  # Project ID from time tracker
    time_tracker_project_name = Column(String(255), nullable=True)  # Project name from time tracker

    # Template tracking
    applied_template_id = Column(PGUUID(as_uuid=True), nullable=True)  # ID of the applied template
    applied_template_name = Column(String(255), nullable=True)  # Name of the applied template
    applied_template_type = Column(String(50), nullable=True)  # 'system' or 'custom'

    # Project timeline
    start_date = Column(DateTime(timezone=True), nullable=True)
    due_date = Column(DateTime(timezone=True), nullable=True)

    # Scope contract
    contract_type = Column(String(50), default="auto_generated")  # 'auto_generated' or 'custom_upload'
    contract_file_url = Column(String(500), nullable=True)  # For custom uploaded contracts
    contract_pdf_url = Column(Text, nullable=True)  # Generated/uploaded PDF - Changed to Text for long signed URLs
    contract_signed = Column(Boolean, default=False)
    contract_signed_at = Column(DateTime(timezone=True), nullable=True)
    contract_signature_data = Column(JSON, nullable=True)  # IP, timestamp, client info

    # Metrics
    total_hours_tracked = Column(Numeric(10, 2), default=0)
    total_revenue = Column(Numeric(10, 2), default=0)
    scope_deviation_percentage = Column(Numeric(5, 2), default=0)
    change_request_value_added = Column(Numeric(10, 2), default=0)

    # Payment schedule configuration
    payment_schedule_status = Column(String(20), default="not_configured")
    # Values: 'not_configured', 'configured', 'active'

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    change_requests = relationship("ChangeRequest", back_populates="project", cascade="all, delete-orphan")
    git_repositories = relationship("GitRepository", back_populates="project", cascade="all, delete-orphan")
    payment_milestones = relationship(
        "PaymentMilestone",
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="PaymentMilestone.order",
    )

    def __str__(self):
        return f"Project(id={self.id}, name={self.name}, status={self.status})"
