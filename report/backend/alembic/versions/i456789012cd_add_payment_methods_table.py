"""add payment methods table

Revision ID: i456789012cd
Revises: dedf1f685a81
Create Date: 2025-01-29 10:00:00.000000

"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

# revision identifiers, used by Alembic.
revision = "i456789012cd"
down_revision = "dedf1f685a81"
branch_labels = None
depends_on = None


def upgrade():
    # Create payment_methods table
    op.create_table(
        "payment_methods",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("method_type", sa.String(50), nullable=False),  # 'paystack' or 'manual'
        sa.Column("is_active", sa.Boolean(), default=True, nullable=False),
        sa.Column("is_default", sa.Boolean(), default=False, nullable=False),
        # Paystack specific fields
        sa.Column("paystack_business_name", sa.String(255), nullable=True),
        sa.Column("paystack_settlement_bank", sa.String(255), nullable=True),
        sa.Column("paystack_account_number", sa.String(50), nullable=True),
        sa.Column("paystack_subaccount_code", sa.String(255), nullable=True),
        # Manual payment - general fields
        sa.Column("payment_gateway_name", sa.String(100), nullable=True),
        sa.Column("payment_instructions", sa.Text(), nullable=True),
        sa.Column("manual_payment_type", sa.String(50), nullable=True),  # 'bank_transfer', 'mobile_money', 'paypal', etc.
        # Bank Transfer fields
        sa.Column("bank_name", sa.String(255), nullable=True),
        sa.Column("account_name", sa.String(255), nullable=True),
        sa.Column("account_number", sa.String(100), nullable=True),
        sa.Column("swift_code", sa.String(50), nullable=True),
        sa.Column("branch_code", sa.String(50), nullable=True),
        # Mobile Money fields
        sa.Column("mobile_money_provider", sa.String(100), nullable=True),
        sa.Column("mobile_money_number", sa.String(50), nullable=True),
        sa.Column("mobile_money_name", sa.String(255), nullable=True),
        # PayPal fields
        sa.Column("paypal_email", sa.String(255), nullable=True),
        # Wise fields
        sa.Column("wise_email", sa.String(255), nullable=True),
        # Cryptocurrency fields
        sa.Column("crypto_wallet_address", sa.String(255), nullable=True),
        sa.Column("crypto_network", sa.String(100), nullable=True),
        # Other payment gateway fields
        sa.Column("other_gateway_name", sa.String(255), nullable=True),
        sa.Column("additional_info", sa.Text(), nullable=True),
        # Timestamps
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )

    # Create indexes
    op.create_index("ix_payment_methods_user_id", "payment_methods", ["user_id"])
    op.create_index("ix_payment_methods_method_type", "payment_methods", ["method_type"])
    op.create_index("ix_payment_methods_is_active", "payment_methods", ["is_active"])

    # Add payment_method_id to clients table (optional reference)
    op.add_column("clients", sa.Column("payment_method_id", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_clients_payment_method_id",
        "clients",
        "payment_methods",
        ["payment_method_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_clients_payment_method_id", "clients", ["payment_method_id"])


def downgrade():
    # Remove foreign key and column from clients
    op.drop_index("ix_clients_payment_method_id", "clients")
    op.drop_constraint("fk_clients_payment_method_id", "clients", type_="foreignkey")
    op.drop_column("clients", "payment_method_id")

    # Drop indexes
    op.drop_index("ix_payment_methods_is_active", "payment_methods")
    op.drop_index("ix_payment_methods_method_type", "payment_methods")
    op.drop_index("ix_payment_methods_user_id", "payment_methods")

    # Drop table
    op.drop_table("payment_methods")
