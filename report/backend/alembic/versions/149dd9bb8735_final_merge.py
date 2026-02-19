"""final merge

Revision ID: 149dd9bb8735
Revises: 56b0e8597b96, k678901234ef
Create Date: 2026-02-01 23:51:02.975819

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "149dd9bb8735"
down_revision: Union[str, None] = ("56b0e8597b96", "k678901234ef")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
