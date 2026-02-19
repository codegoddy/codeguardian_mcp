"""add template_type to templates

Revision ID: l789012345fg
Revises: k678901234ef
Create Date: 2024-01-20 10:00:00.000000

"""

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "l789012345fg"
down_revision = "00eedacd1b97"
branch_labels = None
depends_on = None


def upgrade():
    # Add template_type column to project_templates table
    op.add_column(
        "project_templates",
        sa.Column("template_type", sa.String(length=50), nullable=True),
    )

    # Set default value for existing rows
    op.execute("UPDATE project_templates SET template_type = 'code' WHERE template_type IS NULL")

    # Make the column non-nullable after setting defaults
    op.alter_column("project_templates", "template_type", nullable=False, server_default="code")


def downgrade():
    # Remove template_type column
    op.drop_column("project_templates", "template_type")
