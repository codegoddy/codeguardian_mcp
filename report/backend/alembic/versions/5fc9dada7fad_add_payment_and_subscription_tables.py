"""add_payment_and_subscription_tables

Revision ID: 5fc9dada7fad
Revises: eb1d55fcb1e0
Create Date: 2025-10-21 17:13:05.309799

"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "5fc9dada7fad"
down_revision: Union[str, None] = "eb1d55fcb1e0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create invoices table
    op.create_table(
        "invoices",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("project_id", UUID(as_uuid=True), nullable=False),
        sa.Column("client_id", UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("invoice_number", sa.String(50), nullable=False),
        sa.Column("status", sa.String(50), server_default="draft"),
        sa.Column("subtotal", sa.Numeric(10, 2), nullable=False),
        sa.Column("platform_fee", sa.Numeric(10, 2), server_default="0"),
        sa.Column("tax_amount", sa.Numeric(10, 2), server_default="0"),
        sa.Column("total_amount", sa.Numeric(10, 2), nullable=False),
        # Payment details
        sa.Column("payment_method", sa.String(50), nullable=True),
        sa.Column("payment_gateway_name", sa.String(100), nullable=True),
        sa.Column("payment_transaction_id", sa.String(255), nullable=True),
        sa.Column("payment_reference", sa.String(255), nullable=True),
        sa.Column("payment_received_at", sa.DateTime(timezone=True), nullable=True),
        # Manual payment verification
        sa.Column("client_marked_paid", sa.Boolean(), default=False),
        sa.Column("client_marked_paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("developer_verified", sa.Boolean(), default=False),
        sa.Column("developer_verified_at", sa.DateTime(timezone=True), nullable=True),
        # PDF generation
        sa.Column("invoice_pdf_url", sa.String(500), nullable=True),
        sa.Column("due_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
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
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("idx_invoices_project_id", "invoices", ["project_id"])
    op.create_index("idx_invoices_client_id", "invoices", ["client_id"])
    op.create_index("idx_invoices_status", "invoices", ["status"])
    op.create_index("idx_invoices_payment_method", "invoices", ["payment_method"])
    op.create_index("idx_invoices_invoice_number", "invoices", ["invoice_number"], unique=True)

    # Add foreign key to time_entries for invoice_id (deferred from earlier migration)
    op.create_foreign_key(
        "fk_time_entries_invoice_id",
        "time_entries",
        "invoices",
        ["invoice_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # Create subscriptions table
    op.create_table(
        "subscriptions",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("plan", sa.String(50), nullable=False),
        sa.Column("status", sa.String(50), server_default="active"),
        # Subscription details
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        # Payment
        sa.Column("payment_method", sa.String(50), nullable=True),
        sa.Column("payment_reference", sa.String(255), nullable=True),
        sa.Column("amount", sa.Numeric(10, 2), nullable=True),
        sa.Column("currency", sa.String(3), server_default="USD"),
        # Features
        sa.Column("paystack_fee_waived", sa.Boolean(), default=False),
        sa.Column("max_projects", sa.Integer(), nullable=True),
        sa.Column("max_clients", sa.Integer(), nullable=True),
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
    op.create_index("idx_subscriptions_user_id", "subscriptions", ["user_id"], unique=True)
    op.create_index("idx_subscriptions_status", "subscriptions", ["status"])

    # Create paystack_subaccounts table
    op.create_table(
        "paystack_subaccounts",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("subaccount_code", sa.String(255), nullable=False),
        sa.Column("business_name", sa.String(255), nullable=False),
        sa.Column("settlement_bank", sa.String(255), nullable=False),
        sa.Column("account_number", sa.String(50), nullable=False),
        sa.Column("percentage_charge", sa.Numeric(5, 2), server_default="1.50"),
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
    op.create_index(
        "idx_paystack_subaccounts_user_id",
        "paystack_subaccounts",
        ["user_id"],
        unique=True,
    )
    op.create_index(
        "idx_paystack_subaccounts_code",
        "paystack_subaccounts",
        ["subaccount_code"],
        unique=True,
    )

    # Create change_requests table
    op.create_table(
        "change_requests",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("project_id", UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("status", sa.String(50), server_default="pending"),
        sa.Column("estimated_hours", sa.Numeric(10, 2), nullable=False),
        sa.Column("hourly_rate", sa.Numeric(10, 2), nullable=False),
        sa.Column("total_cost", sa.Numeric(10, 2), nullable=False),
        # Payment tracking
        sa.Column("payment_required", sa.Boolean(), default=True),
        sa.Column("payment_received", sa.Boolean(), default=False),
        sa.Column("payment_transaction_id", sa.String(255), nullable=True),
        # Revision tracking
        sa.Column("revision_count", sa.Integer(), server_default="0"),
        sa.Column("max_revisions", sa.Integer(), server_default="3"),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
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
    op.create_index("idx_change_requests_project_id", "change_requests", ["project_id"])
    op.create_index("idx_change_requests_status", "change_requests", ["status"])


def downgrade() -> None:
    op.drop_table("change_requests")
    op.drop_table("paystack_subaccounts")
    op.drop_table("subscriptions")
    op.drop_constraint("fk_time_entries_invoice_id", "time_entries", type_="foreignkey")
    op.drop_table("invoices")
