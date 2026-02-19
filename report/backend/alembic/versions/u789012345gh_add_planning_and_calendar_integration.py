"""add planning and calendar integration

Revision ID: u789012345gh
Revises: 0ad9ded5b70e
Create Date: 2025-11-29 16:45:00.000000

"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

# revision identifiers, used by Alembic.
revision = "u789012345gh"
down_revision = "t678901234fg"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create planned_time_blocks table
    op.create_table(
        "planned_time_blocks",
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
        sa.Column("planned_date", sa.Date(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=True),
        sa.Column("end_time", sa.Time(), nullable=True),
        sa.Column("planned_hours", sa.Numeric(5, 2), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("google_calendar_event_id", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=20), server_default="planned", nullable=False),
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
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["deliverable_id"], ["deliverables.id"], ondelete="CASCADE"),
    )

    # Create indexes for planned_time_blocks
    op.create_index(op.f("ix_planned_time_blocks_id"), "planned_time_blocks", ["id"], unique=False)
    op.create_index(
        op.f("ix_planned_time_blocks_user_id"),
        "planned_time_blocks",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_planned_time_blocks_deliverable_id"),
        "planned_time_blocks",
        ["deliverable_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_planned_time_blocks_planned_date"),
        "planned_time_blocks",
        ["planned_date"],
        unique=False,
    )
    op.create_index(
        op.f("ix_planned_time_blocks_status"),
        "planned_time_blocks",
        ["status"],
        unique=False,
    )

    # Create composite index for common query pattern (user + date range)
    op.create_index(
        "ix_planned_time_blocks_user_date",
        "planned_time_blocks",
        ["user_id", "planned_date"],
        unique=False,
    )

    # Create google_calendar_integrations table
    op.create_table(
        "google_calendar_integrations",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False, unique=True),
        sa.Column("google_user_id", sa.String(length=255), nullable=False),
        sa.Column("google_email", sa.String(length=255), nullable=False),
        sa.Column("access_token", sa.Text(), nullable=False),
        sa.Column("refresh_token", sa.Text(), nullable=False),
        sa.Column("token_expiry", sa.DateTime(timezone=True), nullable=True),
        sa.Column("calendar_id", sa.String(length=255), nullable=False),
        sa.Column("sync_enabled", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )

    # Create indexes for google_calendar_integrations
    op.create_index(
        op.f("ix_google_calendar_integrations_id"),
        "google_calendar_integrations",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_google_calendar_integrations_user_id"),
        "google_calendar_integrations",
        ["user_id"],
        unique=True,
    )
    op.create_index(
        op.f("ix_google_calendar_integrations_google_user_id"),
        "google_calendar_integrations",
        ["google_user_id"],
        unique=False,
    )


def downgrade() -> None:
    # Drop google_calendar_integrations table and indexes
    op.drop_index(
        op.f("ix_google_calendar_integrations_google_user_id"),
        table_name="google_calendar_integrations",
    )
    op.drop_index(
        op.f("ix_google_calendar_integrations_user_id"),
        table_name="google_calendar_integrations",
    )
    op.drop_index(
        op.f("ix_google_calendar_integrations_id"),
        table_name="google_calendar_integrations",
    )
    op.drop_table("google_calendar_integrations")

    # Drop planned_time_blocks table and indexes
    op.drop_index("ix_planned_time_blocks_user_date", table_name="planned_time_blocks")
    op.drop_index(op.f("ix_planned_time_blocks_status"), table_name="planned_time_blocks")
    op.drop_index(op.f("ix_planned_time_blocks_planned_date"), table_name="planned_time_blocks")
    op.drop_index(op.f("ix_planned_time_blocks_deliverable_id"), table_name="planned_time_blocks")
    op.drop_index(op.f("ix_planned_time_blocks_user_id"), table_name="planned_time_blocks")
    op.drop_index(op.f("ix_planned_time_blocks_id"), table_name="planned_time_blocks")
    op.drop_table("planned_time_blocks")
