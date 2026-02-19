import re
from typing import Optional

from sqlalchemy import and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.core.logging_config import get_logger
from app.models.deliverable import Deliverable
from app.models.git_integration import GitIntegration
from app.models.git_repository import GitRepository
from app.models.project import Project

logger = get_logger(__name__)


class DeliverableLinker:
    """Link Git commits to deliverables via tracking codes"""

    # Regex to find codes like [WEB-123], WEB-123:, API-443-001:, or deliverable/WEB-123-feature
    # Matches tracking codes in format: PREFIX-NUMBER (e.g., WEB-123) or PREFIX-NUMBER-NUMBER (e.g., API-443-001)
    # Can be at start of string or after [, /, or whitespace
    # Must be followed by :, ], _, -, /, whitespace, or end of string
    CODE_PATTERN = re.compile(r"(?:^|\[|\/|\s)([A-Z]{2,6}-\d{1,5}(?:-\d{1,5})?)(?:\]|:|-|_|\/|\s|$)")

    def extract_code(self, branch_name: str, commit_message: str) -> Optional[str]:
        """
        Extracts tracking code from branch or commit message.

        Args:
            branch_name: Git branch name
            commit_message: Commit message

        Returns:
            Tracking code if found, None otherwise
        """
        # Check branch name first
        if branch_name:
            branch_match = re.search(self.CODE_PATTERN, branch_name)
            if branch_match:
                return branch_match.group(1).upper()

        # Then check commit message
        if commit_message:
            commit_match = re.search(self.CODE_PATTERN, commit_message)
            if commit_match:
                return commit_match.group(1).upper()

        return None

    async def resolve_deliverable_id(
        self,
        db: AsyncSession,
        tracking_code: str,
        repository_id: str,
        author_email: str,
    ) -> Optional[str]:
        """
        Resolve tracking code to deliverable ID with strict scoping validation.

        Ensures:
        1. Deliverable exists with the tracking code
        2. Deliverable belongs to a project
        3. Project is linked to the repository
        4. Repository belongs to an integration owned by the commit author

        Args:
            db: Database session
            tracking_code: Tracking code to resolve (e.g., 'WEB-123')
            repository_id: ID of the repository
            author_email: Email of the commit author

        Returns:
            Deliverable ID if found and authorized, None otherwise
        """
        from sqlalchemy import select

        logger.debug(
            "Resolving tracking_code=%s, repository_id=%s, author_email=%s",
            tracking_code,
            repository_id,
            author_email,
        )

        # Complex query with joins for strict scoping
        query = (
            select(Deliverable.id)
            .join(Project, Deliverable.project_id == Project.id)
            .join(
                GitRepository,
                and_(
                    GitRepository.project_id == Project.id,
                    GitRepository.id == repository_id,
                ),
            )
            .join(GitIntegration, GitRepository.integration_id == GitIntegration.id)
            .where(
                Deliverable.tracking_code == tracking_code,
                GitRepository.is_active == True,
                GitIntegration.is_active == True,
            )
        )

        logger.debug("Executing query...")
        result = await db.execute(query)
        deliverable_id = result.scalar_one_or_none()

        logger.debug("Query result: %s", deliverable_id)

        if deliverable_id:
            return str(deliverable_id)

        logger.debug("No deliverable found for tracking code: %s", tracking_code)
        return None

    def generate_tracking_code(self, project_prefix: str, sequence_number: int) -> str:
        """
        Generate a tracking code for a deliverable.

        Args:
            project_prefix: Project prefix (e.g., 'WEB', 'API')
            sequence_number: Sequential number for the deliverable

        Returns:
            Tracking code (e.g., 'WEB-001')
        """
        return f"{project_prefix.upper()}-{sequence_number:03d}"

    def get_next_sequence_number(self, db: Session, project_id: str) -> int:
        """
        Get the next sequence number for a project's deliverables.

        Args:
            db: Database session
            project_id: Project ID

        Returns:
            Next sequence number
        """
        # Get the highest sequence number for this project
        result = (
            db.query(Deliverable)
            .filter(
                Deliverable.project_id == project_id,
                Deliverable.tracking_code.isnot(None),
            )
            .order_by(Deliverable.created_at.desc())
            .first()
        )

        if not result or not result.tracking_code:
            return 1

        # Extract number from tracking code (e.g., 'WEB-001' -> 1)
        try:
            parts = result.tracking_code.split("-")
            if len(parts) == 2:
                return int(parts[1]) + 1
        except (ValueError, IndexError):
            pass

        return 1

    def validate_tracking_code_format(self, tracking_code: str) -> bool:
        """
        Validate tracking code format.

        Args:
            tracking_code: Tracking code to validate

        Returns:
            True if valid, False otherwise
        """
        pattern = re.compile(r"^[A-Z]{2,6}-\d{1,5}$")
        return bool(pattern.match(tracking_code))
