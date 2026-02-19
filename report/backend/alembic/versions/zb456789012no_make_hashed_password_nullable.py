"""make hashed_password nullable for oauth users

Revision ID: zb456789012no
Revises: za345678901mn
Create Date: 2025-12-31 16:50:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "zb456789012no"
down_revision: Union[str, None] = "2b55a65f6ca0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Make hashed_password nullable to support OAuth users
    op.alter_column("users", "hashed_password", existing_type=sa.VARCHAR(), nullable=True)


def downgrade() -> None:
    # Revert to NOT NULL (be careful - will fail if there are OAuth users)
    op.alter_column("users", "hashed_password", existing_type=sa.VARCHAR(), nullable=False)
