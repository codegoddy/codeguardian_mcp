"""add_due_date_to_projects

Revision ID: f1234567890a
Revises: eb1d55fcb1e0
Create Date: 2025-01-27 21:30:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f1234567890a"
down_revision: Union[str, None] = "eb1d55fcb1e0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add due_date column to projects table"""
    op.add_column("projects", sa.Column("due_date", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    """Remove due_date column from projects table"""
    op.drop_column("projects", "due_date")
