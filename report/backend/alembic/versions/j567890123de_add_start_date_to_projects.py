"""add start_date to projects

Revision ID: j567890123de
Revises: i456789012cd
Create Date: 2024-01-25 10:00:00.000000

"""

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "j567890123de"
down_revision = "i456789012cd"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add start_date column to projects table
    op.add_column("projects", sa.Column("start_date", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    # Remove start_date column from projects table
    op.drop_column("projects", "start_date")
