"""add git integration tables

Revision ID: n012345678de
Revises: m901234567cd
Create Date: 2024-11-24 10:00:00.000000

"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

# revision identifiers, used by Alembic.
revision = "n012345678de"
down_revision = "m901234567cd"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create git_integrations table
    op.create_table(
        "git_integrations",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("platform", sa.String(length=50), nullable=False),  # github, gitlab, bitbucket
        sa.Column("username", sa.String(length=255), nullable=True),
        sa.Column("access_token", sa.Text(), nullable=False),  # Encrypted
        sa.Column("refresh_token", sa.Text(), nullable=True),  # Encrypted
        sa.Column("token_expires_at", sa.DateTime(), nullable=True),
        sa.Column(
            "connected_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("last_synced_at", sa.DateTime(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index(op.f("ix_git_integrations_id"), "git_integrations", ["id"], unique=False)
    op.create_index(
        op.f("ix_git_integrations_user_id"),
        "git_integrations",
        ["user_id"],
        unique=False,
    )

    # 2. Create git_repositories table
    op.create_table(
        "git_repositories",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("integration_id", UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", UUID(as_uuid=True), nullable=True),
        sa.Column("repo_url", sa.String(length=500), nullable=False),
        sa.Column("repo_name", sa.String(length=255), nullable=False),
        sa.Column("repo_full_name", sa.String(length=255), nullable=False),
        sa.Column(
            "default_branch",
            sa.String(length=255),
            server_default="main",
            nullable=False,
        ),
        sa.Column("webhook_id", sa.String(length=255), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["integration_id"], ["git_integrations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="SET NULL"),
    )
    op.create_index(op.f("ix_git_repositories_id"), "git_repositories", ["id"], unique=False)
    op.create_index(
        op.f("ix_git_repositories_project_id"),
        "git_repositories",
        ["project_id"],
        unique=False,
    )

    # 3. Create git_commits table
    op.create_table(
        "git_commits",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("repository_id", UUID(as_uuid=True), nullable=False),
        sa.Column("commit_sha", sa.String(length=40), nullable=False),
        sa.Column("author_email", sa.String(length=255), nullable=False),
        sa.Column("author_name", sa.String(length=255), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("committed_at", sa.DateTime(), nullable=False),
        sa.Column("branch", sa.String(length=255), nullable=True),
        sa.Column("files_changed", sa.Integer(), nullable=True),
        sa.Column("insertions", sa.Integer(), nullable=True),
        sa.Column("deletions", sa.Integer(), nullable=True),
        sa.Column("deliverable_id", UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(["repository_id"], ["git_repositories.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["deliverable_id"], ["deliverables.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("repository_id", "commit_sha", name="uq_repo_commit"),
    )
    op.create_index(op.f("ix_git_commits_id"), "git_commits", ["id"], unique=False)
    op.create_index(
        op.f("ix_git_commits_repository_id"),
        "git_commits",
        ["repository_id"],
        unique=False,
    )

    # 4. Add columns to existing tables
    op.add_column("projects", sa.Column("project_prefix", sa.String(length=10), nullable=True))
    op.create_unique_constraint("uq_project_prefix", "projects", ["project_prefix"])

    op.add_column("deliverables", sa.Column("tracking_code", sa.String(length=50), nullable=True))
    op.add_column(
        "deliverables",
        sa.Column("git_branch_pattern", sa.String(length=255), nullable=True),
    )
    op.create_unique_constraint("uq_deliverable_tracking_code", "deliverables", ["tracking_code"])


def downgrade() -> None:
    # Drop columns
    op.drop_constraint("uq_deliverable_tracking_code", "deliverables", type_="unique")
    op.drop_column("deliverables", "git_branch_pattern")
    op.drop_column("deliverables", "tracking_code")

    op.drop_constraint("uq_project_prefix", "projects", type_="unique")
    op.drop_column("projects", "project_prefix")

    # Drop tables
    op.drop_index(op.f("ix_git_commits_repository_id"), table_name="git_commits")
    op.drop_index(op.f("ix_git_commits_id"), table_name="git_commits")
    op.drop_table("git_commits")

    op.drop_index(op.f("ix_git_repositories_project_id"), table_name="git_repositories")
    op.drop_index(op.f("ix_git_repositories_id"), table_name="git_repositories")
    op.drop_table("git_repositories")

    op.drop_index(op.f("ix_git_integrations_user_id"), table_name="git_integrations")
    op.drop_index(op.f("ix_git_integrations_id"), table_name="git_integrations")
    op.drop_table("git_integrations")
