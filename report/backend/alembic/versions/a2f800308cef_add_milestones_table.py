"""add_milestones_table

Revision ID: a2f800308cef
Revises: 00eedacd1b97
Create Date: 2025-10-22 16:02:25.243773

"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a2f800308cef"
down_revision: Union[str, None] = "00eedacd1b97"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create milestones table
    op.create_table(
        "milestones",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("project_id", UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("order", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("status", sa.String(length=50), nullable=True, server_default="pending"),
        sa.Column("total_deliverables", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("completed_deliverables", sa.Integer(), nullable=True, server_default="0"),
        sa.Column(
            "ready_to_bill_deliverables",
            sa.Integer(),
            nullable=True,
            server_default="0",
        ),
        sa.Column("target_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
    )
    op.create_index(op.f("ix_milestones_id"), "milestones", ["id"], unique=False)
    op.create_index(op.f("ix_milestones_project_id"), "milestones", ["project_id"], unique=False)
    op.create_index(op.f("ix_milestones_status"), "milestones", ["status"], unique=False)

    # Add milestone_id to deliverables table
    op.add_column("deliverables", sa.Column("milestone_id", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_deliverables_milestone_id",
        "deliverables",
        "milestones",
        ["milestone_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        op.f("ix_deliverables_milestone_id"),
        "deliverables",
        ["milestone_id"],
        unique=False,
    )


def downgrade() -> None:
    # Remove milestone_id from deliverables table
    op.drop_index(op.f("ix_deliverables_milestone_id"), table_name="deliverables")
    op.drop_constraint("fk_deliverables_milestone_id", "deliverables", type_="foreignkey")
    op.drop_column("deliverables", "milestone_id")

    # Drop milestones table
    op.drop_index(op.f("ix_milestones_status"), table_name="milestones")
    op.drop_index(op.f("ix_milestones_project_id"), table_name="milestones")
    op.drop_index(op.f("ix_milestones_id"), table_name="milestones")
    op.drop_table("milestones")
