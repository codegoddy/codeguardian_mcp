"""add_core_tables_clients_projects_deliverables_time_entries

Revision ID: dedf1f685a81
Revises: 80f6c28b6114
Create Date: 2025-10-21 17:09:13.664764

"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "dedf1f685a81"
down_revision: Union[str, None] = "80f6c28b6114"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create clients table
    op.create_table(
        "clients",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("company", sa.String(255), nullable=True),
        sa.Column("default_hourly_rate", sa.Numeric(10, 2), nullable=False),
        sa.Column("change_request_rate", sa.Numeric(10, 2), nullable=False),
        # Payment configuration
        sa.Column("payment_method", sa.String(50), nullable=False),  # 'paystack' or 'manual'
        sa.Column("payment_gateway_name", sa.String(100), nullable=True),
        sa.Column("payment_instructions", sa.Text(), nullable=True),
        # Paystack integration
        sa.Column("paystack_subaccount_code", sa.String(255), nullable=True),
        sa.Column("paystack_customer_code", sa.String(255), nullable=True),
        # Passwordless portal access
        sa.Column("portal_access_token", sa.String(255), nullable=True),
        sa.Column("is_active", sa.Boolean(), default=True),
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
    op.create_index("idx_clients_user_id", "clients", ["user_id"])
    op.create_index("idx_clients_email", "clients", ["email"])
    op.create_index("idx_clients_portal_token", "clients", ["portal_access_token"])

    # Create projects table
    op.create_table(
        "projects",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("client_id", UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(50), server_default="awaiting_contract", nullable=False),
        # Financial configuration
        sa.Column("project_budget", sa.Numeric(10, 2), nullable=False),
        sa.Column("current_budget_remaining", sa.Numeric(10, 2), nullable=False),
        sa.Column("auto_replenish", sa.Boolean(), default=False),
        sa.Column("auto_pause_threshold", sa.Numeric(5, 2), server_default="10.00"),
        # Technical configuration
        sa.Column("max_revisions", sa.Integer(), server_default="3"),
        sa.Column("current_revision_count", sa.Integer(), server_default="0"),
        sa.Column("allowed_repositories", sa.JSON(), nullable=True),
        # Scope contract
        sa.Column("contract_type", sa.String(50), server_default="auto_generated"),
        sa.Column("contract_file_url", sa.String(500), nullable=True),
        sa.Column("contract_pdf_url", sa.Text(), nullable=True),
        sa.Column("contract_signed", sa.Boolean(), default=False),
        sa.Column("contract_signed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("contract_signature_data", sa.JSON(), nullable=True),
        # Metrics
        sa.Column("total_hours_tracked", sa.Numeric(10, 2), server_default="0"),
        sa.Column("total_revenue", sa.Numeric(10, 2), server_default="0"),
        sa.Column("scope_deviation_percentage", sa.Numeric(5, 2), server_default="0"),
        sa.Column("change_request_value_added", sa.Numeric(10, 2), server_default="0"),
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
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"),
    )
    op.create_index("idx_projects_user_id", "projects", ["user_id"])
    op.create_index("idx_projects_client_id", "projects", ["client_id"])
    op.create_index("idx_projects_status", "projects", ["status"])

    # Create deliverables table
    op.create_table(
        "deliverables",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("project_id", UUID(as_uuid=True), nullable=False),
        sa.Column("task_reference", sa.String(50), nullable=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("acceptance_criteria", sa.Text(), nullable=True),
        sa.Column("status", sa.String(50), server_default="pending"),
        sa.Column("is_in_scope", sa.Boolean(), default=True),
        sa.Column("is_approved", sa.Boolean(), default=False),
        # Git verification and automation
        sa.Column("git_pr_url", sa.String(500), nullable=True),
        sa.Column("git_pr_number", sa.Integer(), nullable=True),
        sa.Column("git_commit_hash", sa.String(100), nullable=True),
        sa.Column("git_merge_status", sa.String(50), nullable=True),
        sa.Column("git_branch_name", sa.String(255), nullable=True),
        sa.Column("preview_url", sa.String(500), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("auto_verified", sa.Boolean(), default=False),
        # Auto-generated documentation
        sa.Column("documentation_markdown", sa.Text(), nullable=True),
        sa.Column("documentation_generated_at", sa.DateTime(timezone=True), nullable=True),
        # Time and cost
        sa.Column("estimated_hours", sa.Numeric(10, 2), nullable=True),
        sa.Column("actual_hours", sa.Numeric(10, 2), server_default="0"),
        sa.Column("total_cost", sa.Numeric(10, 2), server_default="0"),
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
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
    )
    op.create_index("idx_deliverables_project_id", "deliverables", ["project_id"])
    op.create_index("idx_deliverables_status", "deliverables", ["status"])
    op.create_index("idx_deliverables_task_reference", "deliverables", ["task_reference"])

    # Create time_entries table
    op.create_table(
        "time_entries",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("project_id", UUID(as_uuid=True), nullable=False),
        sa.Column("deliverable_id", UUID(as_uuid=True), nullable=True),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("start_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_minutes", sa.Integer(), nullable=True),
        sa.Column("final_hours", sa.Numeric(10, 2), nullable=True),
        sa.Column("hourly_rate", sa.Numeric(10, 2), nullable=False),
        sa.Column("cost", sa.Numeric(10, 2), nullable=True),
        # Git automation fields
        sa.Column("source", sa.String(50), server_default="manual"),
        sa.Column("git_commit_sha", sa.String(100), nullable=True),
        sa.Column("git_commit_message", sa.Text(), nullable=True),
        sa.Column("auto_generated", sa.Boolean(), default=False),
        sa.Column("is_billable", sa.Boolean(), default=True),
        sa.Column("is_billed", sa.Boolean(), default=False),
        sa.Column("invoice_id", UUID(as_uuid=True), nullable=True),
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
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["deliverable_id"], ["deliverables.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("idx_time_entries_project_id", "time_entries", ["project_id"])
    op.create_index("idx_time_entries_user_id", "time_entries", ["user_id"])
    op.create_index("idx_time_entries_deliverable_id", "time_entries", ["deliverable_id"])
    op.create_index("idx_time_entries_git_commit_sha", "time_entries", ["git_commit_sha"])


def downgrade() -> None:
    op.drop_table("time_entries")
    op.drop_table("deliverables")
    op.drop_table("projects")
    op.drop_table("clients")
