"""add support conversations table

Revision ID: bb234567890c
Revises: aa123456789b
Create Date: 2024-12-11 19:30:00.000000

"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

from alembic import op

# revision identifiers, used by Alembic.
revision = "bb234567890c"
down_revision = "aa123456789b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create support_conversations table
    op.create_table(
        "support_conversations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        # Messages stored as JSONB array
        # Format: [{"role": "user"|"assistant", "content": "...", "timestamp": "ISO8601"}]
        sa.Column("messages", JSONB(), nullable=False, server_default="[]"),
        # Title/summary for the conversation
        sa.Column("title", sa.String(200), nullable=True),
        # Timestamps
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
    )


def downgrade() -> None:
    op.drop_table("support_conversations")
