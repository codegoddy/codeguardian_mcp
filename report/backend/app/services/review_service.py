"""Commit review service"""

from datetime import datetime
from typing import Dict, List, Optional
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.deliverable import Deliverable
from app.models.project import Project
from app.models.time_tracking import CommitReview, TimeEntry
from app.services.budget_monitor import BudgetMonitor
from app.services.nats_service import TimeTrackingNATSService
from app.services.time_tracker import GitTimeTracker


class ReviewService:
    """Manage commit reviews"""

    def __init__(self):
        self.time_tracker = GitTimeTracker()
        self.budget_monitor = BudgetMonitor()

    async def get_pending_reviews(self, user_id: UUID, db: AsyncSession) -> List[CommitReview]:
        """
        Get pending reviews for user's projects

        Args:
            user_id: ID of the user
            db: Database session

        Returns:
            List of pending CommitReview objects
        """

        # Get user's projects
        projects_result = await db.execute(select(Project).where(Project.user_id == user_id))
        user_projects = projects_result.scalars().all()
        project_ids = [p.id for p in user_projects]

        if not project_ids:
            return []

        # Get pending reviews for user's projects
        result = await db.execute(
            select(CommitReview)
            .where(
                and_(
                    CommitReview.project_id.in_(project_ids),
                    CommitReview.status == "pending",
                )
            )
            .order_by(CommitReview.created_at.desc())
        )

        return result.scalars().all()

    async def get_pending_count(self, user_id: UUID, db: AsyncSession) -> int:
        """
        Get count of pending reviews for user

        Args:
            user_id: ID of the user
            db: Database session

        Returns:
            Count of pending reviews
        """

        reviews = await self.get_pending_reviews(user_id, db)
        return len(reviews)

    async def get_review_by_id(self, review_id: UUID, db: AsyncSession) -> Optional[CommitReview]:
        """Get a specific review by ID"""

        result = await db.execute(select(CommitReview).where(CommitReview.id == review_id))
        return result.scalar_one_or_none()

    async def submit_review(self, review_id: UUID, data: Dict, user_id: UUID, db: AsyncSession) -> Dict:
        """
        Submit commit review

        Args:
            review_id: ID of the review
            data: Review data (deliverable_id, manual_hours, manual_notes)
            user_id: ID of the user submitting review
            db: Database session

        Returns:
            dict with status and created time entry
        """

        # Get review
        review = await self.get_review_by_id(review_id, db)
        if not review:
            raise ValueError(f"Review {review_id} not found")

        if review.status != "pending":
            raise ValueError(f"Review {review_id} is not pending")

        # Update review
        review.deliverable_id = data.get("deliverable_id", review.deliverable_id)
        review.manual_hours = data.get("manual_hours")
        review.manual_notes = data.get("manual_notes")
        review.status = "reviewed"
        review.reviewed_by = user_id
        review.reviewed_at = datetime.utcnow()

        # Get deliverable
        deliverable_result = await db.execute(select(Deliverable).where(Deliverable.id == review.deliverable_id))
        deliverable = deliverable_result.scalar_one_or_none()

        if not deliverable:
            raise ValueError(f"Deliverable {review.deliverable_id} not found")

        # Create time entry
        commit_data = {
            "id": review.commit_hash,
            "message": review.commit_message,
            "timestamp": review.commit_timestamp.isoformat(),
            "author": {"email": review.commit_author},
        }

        time_entry = await self.time_tracker.track_commit(
            commit_data=commit_data,
            deliverable_id=review.deliverable_id,
            parsed_hours=review.manual_hours or review.parsed_hours,
            db=db,
        )

        # Mark time entry as verified
        time_entry.verified = True
        if review.manual_notes:
            time_entry.notes = review.manual_notes

        # Check budget and send alerts if needed
        await self.budget_monitor.send_budget_alert(deliverable, db)

        await db.commit()
        await db.refresh(time_entry)

        # Publish time entry creation event to NATS
        await TimeTrackingNATSService.publish_time_entry_created(
            {
                "entry_id": time_entry.id,
                "deliverable_id": deliverable.id,
                "project_id": deliverable.project_id,
                "hours": time_entry.final_hours,
                "entry_type": "commit",
                "commit_hash": review.commit_hash,
                "notes": time_entry.notes,
                "user_id": user_id,
            }
        )

        return {
            "status": "success",
            "review_id": review_id,
            "time_entry_id": time_entry.id,
            "deliverable_id": deliverable.id,
            "hours_tracked": time_entry.final_hours,
        }

    async def reject_review(self, review_id: UUID, reason: str, user_id: UUID, db: AsyncSession):
        """
        Reject a commit review

        Args:
            review_id: ID of the review
            reason: Reason for rejection
            user_id: ID of the user rejecting
            db: Database session
        """

        # Get review
        review = await self.get_review_by_id(review_id, db)
        if not review:
            raise ValueError(f"Review {review_id} not found")

        if review.status != "pending":
            raise ValueError(f"Review {review_id} is not pending")

        # Update review
        review.status = "rejected"
        review.reviewed_by = user_id
        review.reviewed_at = datetime.utcnow()
        review.manual_notes = f"Rejected: {reason}"

        await db.commit()

    async def bulk_submit_reviews(self, review_ids: List[UUID], user_id: UUID, db: AsyncSession) -> Dict:
        """
        Submit multiple reviews at once

        Args:
            review_ids: List of review IDs
            user_id: ID of the user
            db: Database session

        Returns:
            dict with success count and errors
        """

        results = {"success_count": 0, "error_count": 0, "errors": []}

        for review_id in review_ids:
            try:
                await self.submit_review(
                    review_id=review_id,
                    data={},  # Use parsed data
                    user_id=user_id,
                    db=db,
                )
                results["success_count"] += 1
            except Exception as e:
                results["error_count"] += 1
                results["errors"].append({"review_id": review_id, "error": str(e)})

        # Publish bulk submission event to NATS
        if results["success_count"] > 0:
            await TimeTrackingNATSService.publish_bulk_reviews_submitted(
                {
                    "user_id": user_id,
                    "review_count": results["success_count"],
                    "error_count": results["error_count"],
                }
            )

        return results

    async def get_review_statistics(self, user_id: UUID, db: AsyncSession) -> Dict:
        """
        Get review statistics for user

        Returns:
            dict with pending, reviewed, rejected counts
        """

        # Get user's projects
        projects_result = await db.execute(select(Project).where(Project.user_id == user_id))
        user_projects = projects_result.scalars().all()
        project_ids = [p.id for p in user_projects]

        if not project_ids:
            return {"pending": 0, "reviewed": 0, "rejected": 0, "total": 0}

        # Get all reviews for user's projects
        result = await db.execute(select(CommitReview).where(CommitReview.project_id.in_(project_ids)))
        all_reviews = result.scalars().all()

        pending = sum(1 for r in all_reviews if r.status == "pending")
        reviewed = sum(1 for r in all_reviews if r.status == "reviewed")
        rejected = sum(1 for r in all_reviews if r.status == "rejected")

        return {
            "pending": pending,
            "reviewed": reviewed,
            "rejected": rejected,
            "total": len(all_reviews),
        }
