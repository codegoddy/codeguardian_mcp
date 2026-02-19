"""add_client_portal_tables

Revision ID: c1d2e3f4g5h6
Revises: 00eedacd1b97
Create Date: 2025-10-23 10:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c1d2e3f4g5h6"
down_revision: Union[str, None] = "00eedacd1b97"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop tables if they exist to handle re-runs
    op.execute("DROP TABLE IF EXISTS client_portal_access_logs")
    op.execute("DROP TABLE IF EXISTS client_portal_sessions")

    # Create client_portal_sessions table
    op.create_table(
        "client_portal_sessions",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("client_id", UUID(as_uuid=True), nullable=False),
        sa.Column("magic_token", sa.String(255), nullable=False),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accessed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_revoked", sa.Boolean(), server_default="false"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"),
    )
    op.create_index("idx_portal_sessions_client_id", "client_portal_sessions", ["client_id"])
    op.create_index(
        "idx_portal_sessions_magic_token",
        "client_portal_sessions",
        ["magic_token"],
        unique=True,
    )
    op.create_index("idx_portal_sessions_expires_at", "client_portal_sessions", ["expires_at"])

    # Create client_portal_access_logs table
    op.create_table(
        "client_portal_access_logs",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("client_id", UUID(as_uuid=True), nullable=False),
        sa.Column("session_id", UUID(as_uuid=True), nullable=True),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("success", sa.Boolean(), nullable=False),
        sa.Column("failure_reason", sa.String(255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["session_id"], ["client_portal_sessions.id"], ondelete="SET NULL"),
    )
    op.create_index("idx_portal_access_logs_client_id", "client_portal_access_logs", ["client_id"])
    op.create_index("idx_portal_access_logs_created_at", "client_portal_access_logs", ["created_at"])


def downgrade() -> None:
    op.drop_table("client_portal_access_logs")
    op.drop_table("client_portal_sessions")
