"""add work_type and notes

Revision ID: r456789012cd
Revises: q345678901bc
Create Date: 2025-11-27 15:22:00.000000

"""

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "r456789012cd"
down_revision = "0ad9ded5b70e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add work_type to deliverables
    op.add_column("deliverables", sa.Column("work_type", sa.String(length=50), nullable=True))

    # Add work_type to time_sessions
    op.add_column("time_sessions", sa.Column("work_type", sa.String(length=50), nullable=True))

    # Add developer_notes and notes_visible_to_client to time_entries
    op.add_column("time_entries", sa.Column("developer_notes", sa.Text(), nullable=True))
    op.add_column(
        "time_entries",
        sa.Column(
            "notes_visible_to_client",
            sa.Boolean(),
            nullable=True,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    # Remove columns
    op.drop_column("time_entries", "notes_visible_to_client")
    op.drop_column("time_entries", "developer_notes")
    op.drop_column("time_sessions", "work_type")
    op.drop_column("deliverables", "work_type")
