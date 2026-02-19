"""add_currency_to_time_entries

Revision ID: 0ad9ded5b70e
Revises: 8a07ba2451ea
Create Date: 2025-11-26 16:02:02.704596

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0ad9ded5b70e"
down_revision: Union[str, None] = "8a07ba2451ea"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add currency column to time_entries table with default 'USD'
    op.add_column(
        "time_entries",
        sa.Column("currency", sa.String(length=3), nullable=True, server_default="USD"),
    )


def downgrade() -> None:
    # Remove currency column from time_entries table
    op.drop_column("time_entries", "currency")
