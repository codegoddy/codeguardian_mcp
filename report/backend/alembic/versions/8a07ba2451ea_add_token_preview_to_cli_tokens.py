"""add_token_preview_to_cli_tokens

Revision ID: 8a07ba2451ea
Revises: q345678901bc
Create Date: 2025-11-26 15:47:17.308297

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "8a07ba2451ea"
down_revision: Union[str, None] = "q345678901bc"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add token_preview column to cli_tokens table
    op.add_column("cli_tokens", sa.Column("token_preview", sa.String(length=16), nullable=True))


def downgrade() -> None:
    # Remove token_preview column from cli_tokens table
    op.drop_column("cli_tokens", "token_preview")
