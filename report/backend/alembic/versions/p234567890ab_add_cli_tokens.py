"""add cli_tokens table

Revision ID: p234567890ab
Revises: o123456789ef
Create Date: 2025-11-26 01:35:00.000000

"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

# revision identifiers, used by Alembic.
revision = "p234567890ab"
down_revision = "o123456789ef"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create cli_tokens table
    op.create_table(
        "cli_tokens",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=100), server_default="DevHQ CLI", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        # Foreign key
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )

    # Create indexes
    op.create_index(op.f("ix_cli_tokens_id"), "cli_tokens", ["id"], unique=False)
    op.create_index(op.f("ix_cli_tokens_user_id"), "cli_tokens", ["user_id"], unique=False)
    op.create_index(op.f("ix_cli_tokens_token_hash"), "cli_tokens", ["token_hash"], unique=True)


def downgrade() -> None:
    # Drop indexes
    op.drop_index(op.f("ix_cli_tokens_token_hash"), table_name="cli_tokens")
    op.drop_index(op.f("ix_cli_tokens_user_id"), table_name="cli_tokens")
    op.drop_index(op.f("ix_cli_tokens_id"), table_name="cli_tokens")

    # Drop table
    op.drop_table("cli_tokens")
