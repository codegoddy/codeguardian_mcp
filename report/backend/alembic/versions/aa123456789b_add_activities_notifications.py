"""add activities and notifications tables

Revision ID: aa123456789b
Revises: z234567890lm
Create Date: 2024-12-11 16:00:00.000000

"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

from alembic import op

# revision identifiers, used by Alembic.
revision = "aa123456789b"
down_revision = "z234567890lm"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create activities table
    op.create_table(
        "activities",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        # Entity reference
        sa.Column("entity_type", sa.String(50), nullable=False, index=True),
        sa.Column("entity_id", UUID(as_uuid=True), nullable=False, index=True),
        # Action details
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("activity_type", sa.String(50), nullable=False, server_default="default"),
        # Extra data (renamed from metadata to avoid SQLAlchemy conflict)
        sa.Column("extra_data", JSONB(), nullable=True),
        # Timestamp
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            index=True,
        ),
    )

    # Create notifications table
    op.create_table(
        "notifications",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        # Notification type and content
        sa.Column(
            "notification_type",
            sa.String(50),
            nullable=False,
            server_default="notification",
        ),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        # Read status
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default="false", index=True),
        # Optional navigation
        sa.Column("action_url", sa.String(500), nullable=True),
        # Optional entity reference
        sa.Column("entity_type", sa.String(50), nullable=True),
        sa.Column("entity_id", UUID(as_uuid=True), nullable=True),
        # Extra data (renamed from metadata to avoid SQLAlchemy conflict)
        sa.Column("extra_data", JSONB(), nullable=True),
        # Timestamp
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            index=True,
        ),
    )


def downgrade() -> None:
    op.drop_table("notifications")
    op.drop_table("activities")
