"""add_developer_signature_fields

Revision ID: za345678901mn
Revises: z234567890lm
Create Date: 2025-12-30 20:38:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "za345678901mn"
down_revision: Union[str, None] = "z234567890lm"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add developer signature fields to contract_signatures table
    op.add_column(
        "contract_signatures",
        sa.Column("developer_signed", sa.Boolean(), server_default="false", nullable=False),
    )
    op.add_column(
        "contract_signatures",
        sa.Column("developer_signed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "contract_signatures",
        sa.Column("developer_name_typed", sa.String(255), nullable=True),
    )

    # Update existing contracts to have developer_signed = true for backwards compatibility
    # (contracts that were already sent should be treated as developer-signed)
    op.execute("UPDATE contract_signatures SET developer_signed = true WHERE signed = true OR signing_token IS NOT NULL")


def downgrade() -> None:
    op.drop_column("contract_signatures", "developer_name_typed")
    op.drop_column("contract_signatures", "developer_signed_at")
    op.drop_column("contract_signatures", "developer_signed")
