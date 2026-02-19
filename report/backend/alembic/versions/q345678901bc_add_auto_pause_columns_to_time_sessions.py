"""add auto pause columns to time sessions

Revision ID: q345678901bc
Revises: p234567890ab
Create Date: 2025-11-26 14:13:00.000000

"""

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "q345678901bc"
down_revision = "p234567890ab"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add auto_paused column
    op.add_column(
        "time_sessions",
        sa.Column("auto_paused", sa.Boolean(), server_default="false", nullable=False),
    )

    # Add auto_stopped column
    op.add_column(
        "time_sessions",
        sa.Column("auto_stopped", sa.Boolean(), server_default="false", nullable=False),
    )

    # Add stop_reason column
    op.add_column("time_sessions", sa.Column("stop_reason", sa.String(length=50), nullable=True))

    # Remove paused_at column if it exists (replaced by auto_paused flag)
    op.execute("ALTER TABLE time_sessions DROP COLUMN IF EXISTS paused_at")


def downgrade() -> None:
    # Remove the columns
    op.drop_column("time_sessions", "stop_reason")
    op.drop_column("time_sessions", "auto_stopped")
    op.drop_column("time_sessions", "auto_paused")

    # Re-add paused_at if needed
    op.add_column(
        "time_sessions",
        sa.Column("paused_at", sa.DateTime(timezone=True), nullable=True),
    )
