"""merge auth and sign heads

Revision ID: 2b55a65f6ca0
Revises: bb234567890c, za345678901mn
Create Date: 2025-12-30 22:04:42.481662

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "2b55a65f6ca0"
down_revision: Union[str, None] = ("bb234567890c", "za345678901mn")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
