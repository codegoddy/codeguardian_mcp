"""add cli time tracking sessions

Revision ID: o123456789ef
Revises: n012345678de
Create Date: 2025-11-26 00:00:00.000000

"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

# revision identifiers, used by Alembic.
revision = "o123456789ef"
down_revision = "n012345678de"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create time_sessions table
    op.create_table(
        "time_sessions",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", UUID(as_uuid=True), nullable=False),
        sa.Column("deliverable_id", UUID(as_uuid=True), nullable=False),
        sa.Column("tracking_code", sa.String(length=50), nullable=False),
        # Session state
        sa.Column("status", sa.String(length=20), nullable=False),  # 'active', 'paused', 'completed'
        sa.Column("start_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_time", sa.DateTime(timezone=True), nullable=True),
        # Time tracking
        sa.Column("accumulated_minutes", sa.Integer(), server_default="0", nullable=False),
        sa.Column("pause_duration_minutes", sa.Integer(), server_default="0", nullable=False),
        sa.Column("paused_at", sa.DateTime(timezone=True), nullable=True),
        # Metadata
        sa.Column("client_session_id", sa.String(length=100), nullable=True),  # From CLI for idempotency
        sa.Column("last_heartbeat", sa.DateTime(timezone=True), nullable=True),
        # Completion data
        sa.Column("commit_message", sa.Text(), nullable=True),
        sa.Column("commit_sha", sa.String(length=100), nullable=True),
        sa.Column("deliverable_status_after", sa.String(length=50), nullable=True),  # 'in_progress', 'completed', 'in_review'
        # Timestamps
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        # Foreign keys
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["deliverable_id"], ["deliverables.id"], ondelete="CASCADE"),
    )

    # Create indexes
    op.create_index(op.f("ix_time_sessions_id"), "time_sessions", ["id"], unique=False)
    op.create_index(op.f("ix_time_sessions_user_id"), "time_sessions", ["user_id"], unique=False)
    op.create_index(
        op.f("ix_time_sessions_deliverable_id"),
        "time_sessions",
        ["deliverable_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_time_sessions_user_status"),
        "time_sessions",
        ["user_id", "status"],
        unique=False,
    )
    op.create_index(
        op.f("ix_time_sessions_tracking_code"),
        "time_sessions",
        ["tracking_code"],
        unique=False,
    )

    # Create unique constraint for active sessions per user per deliverable
    # A user can only have one active session per deliverable at a time
    op.execute("""
        CREATE UNIQUE INDEX idx_time_sessions_active_unique 
        ON time_sessions(user_id, deliverable_id) 
        WHERE status = 'active'
    """)

    # Add CLI-related columns to time_entries table
    op.add_column("time_entries", sa.Column("session_id", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_time_entries_session_id",
        "time_entries",
        "time_sessions",
        ["session_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(op.f("ix_time_entries_session_id"), "time_entries", ["session_id"], unique=False)


def downgrade() -> None:
    # Drop foreign key and column from time_entries
    op.drop_index(op.f("ix_time_entries_session_id"), table_name="time_entries")
    op.drop_constraint("fk_time_entries_session_id", "time_entries", type_="foreignkey")
    op.drop_column("time_entries", "session_id")

    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_time_sessions_active_unique")
    op.drop_index(op.f("ix_time_sessions_tracking_code"), table_name="time_sessions")
    op.drop_index(op.f("ix_time_sessions_user_status"), table_name="time_sessions")
    op.drop_index(op.f("ix_time_sessions_deliverable_id"), table_name="time_sessions")
    op.drop_index(op.f("ix_time_sessions_user_id"), table_name="time_sessions")
    op.drop_index(op.f("ix_time_sessions_id"), table_name="time_sessions")

    # Drop table
    op.drop_table("time_sessions")
