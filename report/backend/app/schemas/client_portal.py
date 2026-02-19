from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr


class ClientPortalAccessRequest(BaseModel):
    """Request magic link for client portal access"""

    email: EmailStr


class ClientPortalAccessResponse(BaseModel):
    """Response after requesting magic link"""

    message: str
    success: bool = True


class ClientPortalTokenValidation(BaseModel):
    """Response after validating magic token"""

    valid: bool
    client_id: Optional[UUID] = None
    client_name: Optional[str] = None
    client_email: Optional[str] = None
    session_id: Optional[UUID] = None
    expires_at: Optional[datetime] = None


class ClientPortalSession(BaseModel):
    """Client portal session data"""

    id: UUID
    client_id: UUID
    token: str
    expires_at: datetime
    created_at: datetime


class ClientPortalLogout(BaseModel):
    """Response after logout"""

    message: str
    success: bool = True


class ClientPortalDashboard(BaseModel):
    """Dashboard data for client portal"""

    client_name: str
    client_email: str
    currency: str = "USD"
    projects: List[Dict[str, Any]]


class ClientPortalMilestone(BaseModel):
    """Milestone data for client portal"""

    id: UUID
    name: str
    description: Optional[str]
    order: int


class ClientPortalProjectResponse(BaseModel):
    """Detailed project data for client portal"""

    id: UUID
    name: str
    description: Optional[str]
    status: str
    project_budget: float
    current_budget_remaining: float
    budget_percentage_remaining: float
    total_hours_tracked: float
    contract_signed: bool
    contract_pdf_url: Optional[str]
    created_at: Optional[str]
    milestones: List[ClientPortalMilestone]
    deliverables: List[Dict[str, Any]]
    change_requests: List[Dict[str, Any]]
    invoices: List[Dict[str, Any]]


class ActivityMetrics(BaseModel):
    """Activity metrics for a deliverable."""

    total_commits: int
    total_files_changed: int
    total_insertions: int
    total_deletions: int
    commit_density: float
    activity_score: int
    fraud_risk: str  # 'low', 'medium', 'high'


class TimelineEvent(BaseModel):
    """Event in the deliverable timeline."""

    type: str  # 'time_entry', 'commit'
    timestamp: datetime
    description: str
    # For time entries
    duration_hours: Optional[float] = None
    # For commits
    files_changed: Optional[int] = None
    commit_sha: Optional[str] = None


class TimelineValidationResponse(BaseModel):
    """Timeline validation results."""

    commits_outside: List[Dict[str, Any]]
    commits_in_grace_period: List[Dict[str, Any]]
    outside_percentage: float
    is_suspicious: bool
    needs_review: bool
    summary: str


class DeliverableActivityResponse(BaseModel):
    """Detailed activity response for a deliverable."""

    deliverable: Dict[str, Any]
    time_entries: List[Dict[str, Any]]
    commits: List[Dict[str, Any]]
    activity_metrics: ActivityMetrics
    timeline: List[TimelineEvent]
    timeline_validation: Optional[TimelineValidationResponse] = None
