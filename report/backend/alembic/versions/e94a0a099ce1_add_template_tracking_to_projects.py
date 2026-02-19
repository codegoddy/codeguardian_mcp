"""add_template_tracking_to_projects

Revision ID: e94a0a099ce1
Revises: l789012345fg
Create Date: 2025-11-17 14:58:57.607857

"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e94a0a099ce1"
down_revision: Union[str, None] = "l789012345fg"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add template tracking fields to projects table
    op.add_column("projects", sa.Column("applied_template_id", UUID(as_uuid=True), nullable=True))
    op.add_column("projects", sa.Column("applied_template_name", sa.String(255), nullable=True))
    op.add_column("projects", sa.Column("applied_template_type", sa.String(50), nullable=True))


def downgrade() -> None:
    # Remove template tracking fields from projects table
    op.drop_column("projects", "applied_template_type")
    op.drop_column("projects", "applied_template_name")
    op.drop_column("projects", "applied_template_id")
