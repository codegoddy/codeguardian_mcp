"""Commit review API endpoints"""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.db.database import get_db
from app.models.user import User
from app.services.review_service import ReviewService

router = APIRouter(prefix="/commit-reviews", tags=["reviews"])


# Pydantic schemas
class ReviewSubmit(BaseModel):
    """Schema for submitting a review"""

    deliverable_id: Optional[UUID] = None
    manual_hours: Optional[float] = None
    manual_notes: Optional[str] = None


class ReviewReject(BaseModel):
    """Schema for rejecting a review"""

    reason: str


class BulkReviewSubmit(BaseModel):
    """Schema for bulk review submission"""

    review_ids: List[UUID]


class CommitReviewResponse(BaseModel):
    """Schema for commit review response"""

    id: UUID
    project_id: UUID
    commit_hash: str
    commit_message: str
    commit_author: Optional[str]
    commit_timestamp: Optional[datetime]
    deliverable_id: Optional[UUID]
    parsed_hours: Optional[float]
    manual_hours: Optional[float]
    manual_notes: Optional[str]
    status: str
    reviewed_by: Optional[UUID]
    reviewed_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class ReviewStatistics(BaseModel):
    """Schema for review statistics"""

    pending: int
    reviewed: int
    rejected: int
    total: int


@router.get("/pending", response_model=List[CommitReviewResponse])
async def get_pending_reviews(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """
    Get pending commit reviews for current user

    Returns list of pending reviews that need to be processed
    """

    review_service = ReviewService()
    reviews = await review_service.get_pending_reviews(current_user.id, db)

    return reviews


@router.get("/count")
async def get_pending_count(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """
    Get count of pending reviews

    Returns:
        dict with count of pending reviews
    """

    review_service = ReviewService()
    count = await review_service.get_pending_count(current_user.id, db)

    return {"count": count}


@router.get("/statistics", response_model=ReviewStatistics)
async def get_review_statistics(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """
    Get review statistics for current user

    Returns:
        dict with pending, reviewed, rejected counts
    """

    review_service = ReviewService()
    stats = await review_service.get_review_statistics(current_user.id, db)

    return stats


@router.get("/{review_id}", response_model=CommitReviewResponse)
async def get_review(
    review_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get a specific review by ID
    """

    review_service = ReviewService()
    review = await review_service.get_review_by_id(review_id, db)

    if not review:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Review {review_id} not found",
        )

    return review


@router.post("/{review_id}/review")
async def submit_review(
    review_id: UUID,
    data: ReviewSubmit,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Submit a commit review

    This will:
    1. Update the review status
    2. Create a time entry
    3. Update deliverable time tracking
    4. Check budget alerts
    """

    review_service = ReviewService()

    try:
        result = await review_service.submit_review(
            review_id=review_id, data=data.model_dump(), user_id=current_user.id, db=db
        )

        return result

    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to submit review: {str(e)}",
        )


@router.post("/{review_id}/reject")
async def reject_review(
    review_id: UUID,
    data: ReviewReject,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Reject a commit review

    This marks the review as rejected and does not create a time entry
    """

    review_service = ReviewService()

    try:
        await review_service.reject_review(review_id=review_id, reason=data.reason, user_id=current_user.id, db=db)

        return {"status": "success", "message": "Review rejected"}

    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/bulk-submit")
async def bulk_submit_reviews(
    data: BulkReviewSubmit,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Submit multiple reviews at once

    Useful for approving multiple commits in one action
    """

    review_service = ReviewService()

    results = await review_service.bulk_submit_reviews(review_ids=data.review_ids, user_id=current_user.id, db=db)

    return results
