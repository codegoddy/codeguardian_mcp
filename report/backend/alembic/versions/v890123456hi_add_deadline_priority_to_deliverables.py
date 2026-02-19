"""add deadline and priority to deliverables

Revision ID: v890123456hi
Revises: u789012345gh
Create Date: 2025-11-29 18:50:00.000000

"""

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "v890123456hi"
down_revision = "u789012345gh"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add deadline and priority columns to deliverables table
    op.add_column("deliverables", sa.Column("deadline", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "deliverables",
        sa.Column("priority", sa.String(length=20), server_default="medium", nullable=True),
    )

    # Create index on deadline for efficient querying
    op.create_index(op.f("ix_deliverables_deadline"), "deliverables", ["deadline"], unique=False)
    op.create_index(op.f("ix_deliverables_priority"), "deliverables", ["priority"], unique=False)


def downgrade() -> None:
    # Drop indexes
    op.drop_index(op.f("ix_deliverables_priority"), table_name="deliverables")
    op.drop_index(op.f("ix_deliverables_deadline"), table_name="deliverables")

    # Drop columns
    op.drop_column("deliverables", "priority")
    op.drop_column("deliverables", "deadline")
