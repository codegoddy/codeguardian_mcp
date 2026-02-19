"""merge_all_heads

Revision ID: zd6789012345q
Revises: 0ad9ded5b70e, 149dd9bb8735, 56b0e8597b96, a2f800308cef, c1d2e3f4g5h6, e94a0a099ce1, f1234567890a, opt1767316611, supabase001, za345678901mn
Create Date: 2025-02-03 15:10:00.000000

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "zd6789012345q"
down_revision: Union[str, Sequence[str], None] = (
    "0ad9ded5b70e",
    "149dd9bb8735",
    "56b0e8597b96",
    "a2f800308cef",
    "c1d2e3f4g5h6",
    "e94a0a099ce1",
    "f1234567890a",
    "opt1767316611",
    "supabase001",
    "za345678901mn",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Merge all heads - no actual schema changes, just resolves the branch."""
    pass


def downgrade() -> None:
    """Downgrade is a no-op for merge migrations."""
    pass
