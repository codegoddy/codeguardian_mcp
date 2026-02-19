"""add attachments and preview links to time entries

Revision ID: x012345678jk
Revises: w901234567ij
Create Date: 2025-12-01 19:42:00.000000

"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision = "x012345678jk"
down_revision = "w901234567ij"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add attachments and preview_links JSON columns to time_entries
    op.add_column(
        "time_entries",
        sa.Column("attachments", postgresql.JSON(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "time_entries",
        sa.Column("preview_links", postgresql.JSON(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    # Remove columns
    op.drop_column("time_entries", "preview_links")
    op.drop_column("time_entries", "attachments")
