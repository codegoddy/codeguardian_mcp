"""add_contract_management_tables

Revision ID: eb1d55fcb1e0
Revises: dedf1f685a81
Create Date: 2025-10-21 17:11:11.600137

"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "eb1d55fcb1e0"
down_revision: Union[str, None] = "dedf1f685a81"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create contract_templates table
    op.create_table(
        "contract_templates",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        # Template content
        sa.Column("template_content", sa.Text(), nullable=False),
        sa.Column("is_default", sa.Boolean(), default=False),
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
    op.create_index("idx_contract_templates_user_id", "contract_templates", ["user_id"])

    # Create contract_signatures table
    op.create_table(
        "contract_signatures",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("project_id", UUID(as_uuid=True), nullable=False),
        sa.Column("client_id", UUID(as_uuid=True), nullable=False),
        # Contract details
        sa.Column("contract_content", sa.Text(), nullable=False),
        sa.Column("contract_pdf_url", sa.Text(), nullable=True),
        # Signature details
        sa.Column("signed", sa.Boolean(), default=False),
        sa.Column("signed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("signature_ip", sa.String(45), nullable=True),
        sa.Column("signature_user_agent", sa.Text(), nullable=True),
        sa.Column("client_name_typed", sa.String(255), nullable=True),
        # Magic link for signing
        sa.Column("signing_token", sa.String(255), nullable=False),
        sa.Column("signing_token_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"),
    )
    op.create_index("idx_contract_signatures_project_id", "contract_signatures", ["project_id"])
    op.create_index(
        "idx_contract_signatures_signing_token",
        "contract_signatures",
        ["signing_token"],
        unique=True,
    )

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
        sa.Column("is_revoked", sa.Boolean(), default=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
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
    op.drop_table("contract_signatures")
    op.drop_table("contract_templates")
