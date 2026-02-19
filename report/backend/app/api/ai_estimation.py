"""
AI Time Estimation API Endpoints
Provides AI-powered time estimates for templates and deliverables.
"""

import logging
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.config import settings
from app.db.database import get_db
from app.models.user import User
from app.services.ai_estimator import AITimeEstimator
from app.services.ai_template_generator import AITemplateGenerator
from app.utils.rate_limiter import RATE_LIMITS, limiter

router = APIRouter(prefix="/api/ai", tags=["ai-estimation"])
logger = logging.getLogger(__name__)


# Request/Response Models
class DeliverableEstimateRequest(BaseModel):
    """Request model for single deliverable estimation"""

    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = Field(None, max_length=2000)
    original_hours: Optional[float] = Field(None, ge=0, le=1000)
    project_type: str = Field(default="code", pattern="^(code|no-code)$")


class TemplateEstimateRequest(BaseModel):
    """Request model for template estimation"""

    template_data: dict = Field(..., description="Template JSON with milestones and deliverables")
    project_type: str = Field(default="code", pattern="^(code|no-code)$")
    start_date: Optional[str] = Field(None, description="Project start date (YYYY-MM-DD)")
    end_date: Optional[str] = Field(None, description="Project end date (YYYY-MM-DD)")
    budget: Optional[float] = Field(None, ge=0, description="Total project budget")
    hourly_rate: Optional[float] = Field(None, ge=0, description="Client's hourly rate")


class RiskFactor(BaseModel):
    factor: str
    mitigation: str


class DeliverableEstimate(BaseModel):
    """Response model for deliverable estimate"""

    title: str
    description: Optional[str]
    original_hours: float
    estimated_hours: float
    optimistic_hours: Optional[float] = None
    pessimistic_hours: Optional[float] = None
    confidence: float = Field(..., ge=0, le=100)
    reasoning: str
    similar_count: int = Field(..., ge=0)
    risk_factors: List[RiskFactor] = []


class BudgetAnalysis(BaseModel):
    """Budget analysis based on AI estimates"""

    total_budget: float
    hourly_rate: float
    budget_hours: float  # How many hours the budget allows
    estimated_cost: float  # Cost based on AI estimated hours
    budget_variance: float  # Positive = under budget, negative = over budget
    budget_status: str  # 'under', 'on_track', 'over', 'critical'
    recommendation: Optional[str] = None


class TemplateEstimateResponse(BaseModel):
    """Response model for template estimation"""

    total_original_hours: float
    total_estimated_hours: float
    confidence_score: float = Field(..., ge=0, le=100)
    adjustment_percentage: float
    is_first_time_user: bool
    timeline_analysis: Optional[str] = None
    budget_analysis: Optional[BudgetAnalysis] = None
    deliverables: List[DeliverableEstimate]


@router.post("/estimate-template", response_model=TemplateEstimateResponse)
@limiter.limit(RATE_LIMITS["ai_estimation"])
async def estimate_template(
    request: Request,
    template_request: TemplateEstimateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Estimate time for all deliverables in a template using AI

    This endpoint analyzes a project template and provides AI-powered time estimates
    for each deliverable based on historical data and industry benchmarks.

    **Free Tier:** Uses Google Gemini 1.5 Flash (no cost)
    **Rate Limit:** 15 requests/minute (Gemini free tier)
    """

    # Check if AI estimation is enabled
    if not settings.ai_estimation_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI estimation is currently disabled",
        )

    try:
        logger.info(f"Template estimation request from user {current_user.id}")

        estimator = AITimeEstimator()
        result = await estimator.estimate_template_deliverables(
            template_data=template_request.template_data,
            project_type=template_request.project_type,
            user_id=current_user.id,
            db=db,
            start_date=template_request.start_date,
            end_date=template_request.end_date,
            budget=template_request.budget,
            hourly_rate=template_request.hourly_rate,
        )

        logger.info(
            f"Template estimation completed: "
            f"{result['total_estimated_hours']}h "
            f"({result['confidence_score']:.0f}% confidence)"
        )

        return result

    except Exception as e:
        logger.error(f"Template estimation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to estimate template: {str(e)}",
        )


@router.post("/estimate-deliverable", response_model=DeliverableEstimate)
@limiter.limit(RATE_LIMITS["ai_estimation"])
async def estimate_deliverable(
    request: Request,
    deliverable_request: DeliverableEstimateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Estimate time for a single deliverable using AI

    This endpoint provides an AI-powered time estimate for a single deliverable
    based on its title, description, and historical data.

    **Use Case:** When creating individual deliverables outside of templates
    """

    # Check if AI estimation is enabled
    if not settings.ai_estimation_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI estimation is currently disabled",
        )

    try:
        logger.info(f"Deliverable estimation request: '{deliverable_request.title}'")

        estimator = AITimeEstimator()

        # Get historical data
        historical_data = await estimator._get_user_historical_data(current_user.id, db)

        # Create deliverable dict
        deliverable_data = {
            "title": deliverable_request.title,
            "description": deliverable_request.description,
            "estimated_hours": deliverable_request.original_hours or 0,
        }

        # Estimate
        result = await estimator._estimate_single_deliverable(
            deliverable=deliverable_data,
            project_type=request.project_type,
            historical_data=historical_data,
        )

        logger.info(
            f"Deliverable estimation completed: {result['estimated_hours']}h " f"({result['confidence']:.0f}% confidence)"
        )

        return result

    except Exception as e:
        logger.error(f"Deliverable estimation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to estimate deliverable: {str(e)}",
        )


@router.get("/status")
async def get_ai_status(current_user: User = Depends(get_current_user)):
    """
    Get AI estimation service status

    Returns information about the AI service availability and configuration.
    """
    return {
        "enabled": settings.ai_estimation_enabled,
        "provider": settings.ai_provider,
        "model": settings.ai_model,
        "cost": "pay-per-use",
        "rate_limit": "varies by model",
    }


# Commit Message Generation Models
class CommitMessageRequest(BaseModel):
    """Request model for commit message generation"""

    tracking_code: str = Field(..., min_length=1, max_length=50, description="Deliverable tracking code")
    git_diff: str = Field(..., min_length=1, max_length=50000, description="Git diff output")
    file_changes: Optional[List[str]] = Field(None, description="List of changed files")
    deliverable_title: Optional[str] = Field(None, description="Deliverable title for context")


class CommitMessageResponse(BaseModel):
    """Response model for commit message generation"""

    message: str = Field(..., description="Generated commit message")
    summary: str = Field(..., description="Brief summary of changes")
    type: str = Field(..., description="Commit type (feat, fix, refactor, etc.)")


@router.post("/generate-commit-message", response_model=CommitMessageResponse)
@limiter.limit(RATE_LIMITS["ai_estimation"])
async def generate_commit_message(
    request: Request,
    commit_request: CommitMessageRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Generate an AI-powered commit message based on git diff

    This endpoint analyzes the git diff and generates a meaningful commit message
    following conventional commit format.

    **Used by:** DevHQ CLI when stopping a tracking session
    """

    # Check if AI estimation is enabled
    if not settings.ai_estimation_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service is currently disabled",
        )

    try:
        logger.info(f"Commit message generation request for {commit_request.tracking_code}")

        estimator = AITimeEstimator()
        result = await estimator.generate_commit_message(
            tracking_code=commit_request.tracking_code,
            git_diff=commit_request.git_diff,
            file_changes=commit_request.file_changes,
            deliverable_title=commit_request.deliverable_title,
        )

        logger.info(f"Commit message generated: {result['type']}: {result['summary'][:50]}...")

        return result

    except Exception as e:
        logger.error(f"Commit message generation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate commit message: {str(e)}",
        )


# Template Generation Models
class TemplateGenerationRequest(BaseModel):
    """Request model for AI template generation"""

    description: str = Field(
        ...,
        min_length=10,
        max_length=2000,
        description="Description of the template you want",
    )
    project_type: str = Field(default="code", pattern="^(code|no-code)$")
    category: Optional[str] = Field(None, description="Optional category hint (web_app, mobile_app, api, etc.)")


class GeneratedMilestone(BaseModel):
    """Milestone in a generated template"""

    name: str
    order: int
    deliverables: List[dict]


class GeneratedTemplateData(BaseModel):
    """Template data structure"""

    default_hourly_rate: float
    default_change_request_rate: float
    max_revisions: int
    milestones: List[GeneratedMilestone]


class GeneratedTemplateResponse(BaseModel):
    """Response model for generated template"""

    name: str
    description: str
    category: str
    template_type: str
    template_data: dict


@router.post("/generate-template", response_model=GeneratedTemplateResponse)
@limiter.limit(RATE_LIMITS["ai_estimation"])
async def generate_template(
    request: Request,
    gen_request: TemplateGenerationRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Generate a project template using AI based on a description.

    This endpoint analyzes the user's description and generates a complete
    project template with milestones and deliverables.

    **Use Case:** When a user wants to quickly create a template by describing
    what kind of project they're working on.
    """

    # Check if AI is enabled
    if not settings.ai_estimation_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI services are currently disabled",
        )

    try:
        logger.info(f"Template generation request from user {current_user.id}: {gen_request.description[:100]}...")

        generator = AITemplateGenerator()
        result = await generator.generate_template(
            description=gen_request.description,
            project_type=gen_request.project_type,
            category_hint=gen_request.category,
        )

        logger.info(f"Template generated: '{result['name']}' with " f"{len(result['template_data']['milestones'])} milestones")

        return result

    except Exception as e:
        logger.error(f"Template generation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate template: {str(e)}",
        )
