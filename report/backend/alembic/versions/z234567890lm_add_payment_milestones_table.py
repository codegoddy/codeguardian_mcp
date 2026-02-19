"""add payment_milestones table

Revision ID: z234567890lm
Revises: y123456789kl
Create Date: 2024-12-04 21:00:00.000000

"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

# revision identifiers, used by Alembic.
revision = "z234567890lm"
down_revision = "y123456789kl"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create payment_milestones table
    op.create_table(
        "payment_milestones",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "project_id",
            UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("percentage", sa.Numeric(5, 2), nullable=False),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        # Trigger configuration
        sa.Column("trigger_type", sa.String(50), nullable=False),
        sa.Column("trigger_value", sa.String(100), nullable=True),
        # Status tracking
        sa.Column("status", sa.String(20), default="pending", nullable=False, index=True),
        # Invoice relationship
        sa.Column(
            "invoice_id",
            UUID(as_uuid=True),
            sa.ForeignKey("invoices.id", ondelete="SET NULL"),
            nullable=True,
        ),
        # Timestamps
        sa.Column("triggered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("invoiced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        # Display order
        sa.Column("order", sa.Integer, nullable=False, default=0),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
    )

    # Add payment_schedule_status to projects table
    op.add_column(
        "projects",
        sa.Column(
            "payment_schedule_status",
            sa.String(20),
            server_default="not_configured",
            nullable=False,
        ),
    )
    # Values: 'not_configured', 'configured', 'active'


def downgrade() -> None:
    op.drop_column("projects", "payment_schedule_status")
    op.drop_table("payment_milestones")
