"""add repository_purpose

Revision ID: s567890123ef
Revises: r456789012cd
Create Date: 2025-11-27 15:35:00.000000

"""

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "s567890123ef"
down_revision = "r456789012cd"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add repository_purpose to git_repositories
    op.add_column(
        "git_repositories",
        sa.Column("repository_purpose", sa.String(length=50), nullable=True),
    )


def downgrade() -> None:
    # Remove column
    op.drop_column("git_repositories", "repository_purpose")
