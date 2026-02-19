"""add ai estimation fields to deliverables

Revision ID: y123456789kl
Revises: x012345678jk
Create Date: 2024-12-02 18:45:00.000000

"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

# revision identifiers, used by Alembic.
revision = "y123456789kl"
down_revision = "x012345678jk"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add AI estimation fields to deliverables table
    op.add_column(
        "deliverables",
        sa.Column("ai_estimated", sa.Boolean(), server_default="false", nullable=False),
    )
    op.add_column("deliverables", sa.Column("ai_confidence", sa.Numeric(5, 2), nullable=True))
    op.add_column("deliverables", sa.Column("ai_reasoning", sa.Text(), nullable=True))
    op.add_column(
        "deliverables",
        sa.Column("ai_estimated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "deliverables",
        sa.Column("original_estimated_hours", sa.Numeric(10, 2), nullable=True),
    )


def downgrade() -> None:
    # Remove AI estimation fields
    op.drop_column("deliverables", "original_estimated_hours")
    op.drop_column("deliverables", "ai_estimated_at")
    op.drop_column("deliverables", "ai_reasoning")
    op.drop_column("deliverables", "ai_confidence")
    op.drop_column("deliverables", "ai_estimated")
