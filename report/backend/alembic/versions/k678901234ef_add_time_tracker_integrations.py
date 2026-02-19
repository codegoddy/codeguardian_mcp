"""add time tracker integrations

Revision ID: k678901234ef
Revises: j567890123de
Create Date: 2024-11-16 10:00:00.000000

"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

# revision identifiers, used by Alembic.
revision = "k678901234ef"
down_revision = "j567890123de"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create time_tracker_integrations table
    op.create_table(
        "time_tracker_integrations",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("provider", sa.String(length=50), nullable=False),
        sa.Column("api_token_encrypted", sa.Text(), nullable=False),
        sa.Column("provider_user_id", sa.String(length=255), nullable=True),
        sa.Column("provider_username", sa.String(length=255), nullable=True),
        sa.Column("account_id", sa.String(length=255), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index(
        op.f("ix_time_tracker_integrations_id"),
        "time_tracker_integrations",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_time_tracker_integrations_user_id"),
        "time_tracker_integrations",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_time_tracker_integrations_provider"),
        "time_tracker_integrations",
        ["provider"],
        unique=False,
    )

    # Add time tracker fields to projects table
    op.add_column(
        "projects",
        sa.Column("time_tracker_provider", sa.String(length=50), nullable=True),
    )
    op.add_column(
        "projects",
        sa.Column("time_tracker_project_id", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "projects",
        sa.Column("time_tracker_project_name", sa.String(length=255), nullable=True),
    )

    # Create index for time tracker provider
    op.create_index(
        op.f("ix_projects_time_tracker_provider"),
        "projects",
        ["time_tracker_provider"],
        unique=False,
    )


def downgrade() -> None:
    # Remove indexes and columns from projects table
    op.drop_index(op.f("ix_projects_time_tracker_provider"), table_name="projects")
    op.drop_column("projects", "time_tracker_project_name")
    op.drop_column("projects", "time_tracker_project_id")
    op.drop_column("projects", "time_tracker_provider")

    # Drop time_tracker_integrations table
    op.drop_index(
        op.f("ix_time_tracker_integrations_provider"),
        table_name="time_tracker_integrations",
    )
    op.drop_index(
        op.f("ix_time_tracker_integrations_user_id"),
        table_name="time_tracker_integrations",
    )
    op.drop_index(op.f("ix_time_tracker_integrations_id"), table_name="time_tracker_integrations")
    op.drop_table("time_tracker_integrations")
