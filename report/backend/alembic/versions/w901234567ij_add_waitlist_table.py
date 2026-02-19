"""add waitlist table

Revision ID: w901234567ij
Revises: v890123456hi
Create Date: 2025-12-01 17:14:00.000000

"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

# revision identifiers, used by Alembic.
revision = "w901234567ij"
down_revision = "v890123456hi"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create waitlist table
    op.create_table(
        "waitlist",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("full_name", sa.String(), nullable=False),
        sa.Column("company", sa.String(), nullable=True),
        sa.Column("notified", sa.Boolean(), server_default="false", nullable=False),
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
            nullable=False,
        ),
    )

    # Create indexes
    op.create_index(op.f("ix_waitlist_id"), "waitlist", ["id"], unique=False)
    op.create_index(op.f("ix_waitlist_email"), "waitlist", ["email"], unique=True)
    op.create_index(op.f("ix_waitlist_created_at"), "waitlist", ["created_at"], unique=False)


def downgrade() -> None:
    # Drop indexes
    op.drop_index(op.f("ix_waitlist_created_at"), table_name="waitlist")
    op.drop_index(op.f("ix_waitlist_email"), table_name="waitlist")
    op.drop_index(op.f("ix_waitlist_id"), table_name="waitlist")

    # Drop table
    op.drop_table("waitlist")
