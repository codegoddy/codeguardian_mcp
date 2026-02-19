"""add_automation_and_settings_tables

Revision ID: 00eedacd1b97
Revises: 5fc9dada7fad
Create Date: 2025-10-21 17:14:45.426841

"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "00eedacd1b97"
down_revision: Union[str, None] = "5fc9dada7fad"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create project_templates table
    op.create_table(
        "project_templates",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("user_id", UUID(as_uuid=True), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("category", sa.String(100), nullable=True),
        # Template data (stored as JSON for frontend rendering)
        sa.Column("template_data", sa.JSON(), nullable=False),
        # Visibility
        sa.Column("is_system_template", sa.Boolean(), default=False),
        sa.Column("is_public", sa.Boolean(), default=False),
        # Usage stats
        sa.Column("usage_count", sa.Integer(), server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("idx_project_templates_user_id", "project_templates", ["user_id"])
    op.create_index("idx_project_templates_category", "project_templates", ["category"])
    op.create_index("idx_project_templates_is_system", "project_templates", ["is_system_template"])

    # Create user_settings table
    op.create_table(
        "user_settings",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        # Profile
        sa.Column("profile_image_url", sa.Text(), nullable=True),  # Changed from String(500) to Text for long Supabase URLs
        sa.Column("bio", sa.Text(), nullable=True),
        # Preferences
        sa.Column("default_currency", sa.String(3), server_default="USD"),
        sa.Column("timezone", sa.String(50), server_default="UTC"),
        sa.Column("date_format", sa.String(20), server_default="YYYY-MM-DD"),
        sa.Column("time_format", sa.String(20), server_default="24h"),
        # Notification preferences
        sa.Column("email_notifications", sa.Boolean(), default=True),
        sa.Column("auto_pause_notifications", sa.Boolean(), default=True),
        sa.Column("contract_signed_notifications", sa.Boolean(), default=True),
        sa.Column("payment_received_notifications", sa.Boolean(), default=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("idx_user_settings_user_id", "user_settings", ["user_id"], unique=True)

    # Create git_access_logs table
    op.create_table(
        "git_access_logs",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("project_id", UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("repository_url", sa.String(500), nullable=False),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("reason", sa.String(255), nullable=True),
        sa.Column("success", sa.Boolean(), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("idx_git_access_logs_project_id", "git_access_logs", ["project_id"])
    op.create_index("idx_git_access_logs_user_id", "git_access_logs", ["user_id"])

    # Create auto_pause_events table
    op.create_table(
        "auto_pause_events",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("project_id", UUID(as_uuid=True), nullable=False),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("retainer_balance", sa.Numeric(10, 2), nullable=False),
        sa.Column("threshold_percentage", sa.Numeric(5, 2), nullable=False),
        sa.Column("repositories_affected", sa.JSON(), nullable=True),
        sa.Column("access_revoked", sa.Boolean(), default=False),
        sa.Column("access_restored", sa.Boolean(), default=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolution_method", sa.String(50), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
    )
    op.create_index("idx_auto_pause_events_project_id", "auto_pause_events", ["project_id"])
    op.create_index("idx_auto_pause_events_event_type", "auto_pause_events", ["event_type"])


def downgrade() -> None:
    op.drop_table("auto_pause_events")
    op.drop_table("git_access_logs")
    op.drop_table("user_settings")
    op.drop_table("project_templates")
