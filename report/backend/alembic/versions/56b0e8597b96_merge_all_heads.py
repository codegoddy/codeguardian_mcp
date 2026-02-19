"""merge all heads

Revision ID: 56b0e8597b96
Revises: supabase001, a2f800308cef, c1d2e3f4g5h6, f1234567890a, opt1767316611
Create Date: 2026-02-01 23:47:59.525523

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "56b0e8597b96"
down_revision: Union[str, None] = (
    "supabase001",
    "a2f800308cef",
    "c1d2e3f4g5h6",
    "f1234567890a",
    "opt1767316611",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
