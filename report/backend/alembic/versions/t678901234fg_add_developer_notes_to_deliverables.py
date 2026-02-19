"""add developer notes to deliverables and time sessions

Revision ID: t678901234fg
Revises: s567890123ef
Create Date: 2025-11-27 16:40:00.000000

"""

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "t678901234fg"
down_revision = "s567890123ef"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add developer_notes and notes_visible_to_client to deliverables
    op.add_column("deliverables", sa.Column("developer_notes", sa.Text(), nullable=True))
    op.add_column(
        "deliverables",
        sa.Column(
            "notes_visible_to_client",
            sa.Boolean(),
            nullable=True,
            server_default=sa.text("true"),
        ),
    )

    # Add developer_notes and notes_visible_to_client to time_sessions
    op.add_column("time_sessions", sa.Column("developer_notes", sa.Text(), nullable=True))
    op.add_column(
        "time_sessions",
        sa.Column(
            "notes_visible_to_client",
            sa.Boolean(),
            nullable=True,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    # Remove columns
    op.drop_column("time_sessions", "notes_visible_to_client")
    op.drop_column("time_sessions", "developer_notes")
    op.drop_column("deliverables", "notes_visible_to_client")
    op.drop_column("deliverables", "developer_notes")
