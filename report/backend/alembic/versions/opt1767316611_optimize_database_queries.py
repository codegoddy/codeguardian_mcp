"""optimize_database_queries

Add performance indexes for frequently queried columns and composite indexes for common query patterns.

Revision ID: opt1767316611
Revises: zb456789012no
Create Date: 2026-01-02 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "opt1767316611"
down_revision: Union[str, None] = "zb456789012no"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Activities table - compound index for user + entity queries
    if _table_exists("activities") and not _index_exists("idx_activities_user_entity"):
        op.create_index(
            "idx_activities_user_entity",
            "activities",
            ["user_id", "entity_type", "entity_id"],
        )
    if _table_exists("activities") and not _index_exists("idx_activities_user_created"):
        op.create_index("idx_activities_user_created", "activities", ["user_id", "created_at"])

    # Change requests - compound index for project + status (may already exist)
    if _table_exists("change_requests") and not _index_exists("idx_change_requests_project_status"):
        op.create_index(
            "idx_change_requests_project_status",
            "change_requests",
            ["project_id", "status"],
        )

    # Clients - compound index for user + active status
    if _table_exists("clients") and not _index_exists("idx_clients_user_active"):
        op.create_index("idx_clients_user_active", "clients", ["user_id", "is_active"])

    # Contracts - compound index for project + signed status
    if _table_exists("contracts") and not _index_exists("idx_contracts_project_signed"):
        op.create_index("idx_contracts_project_signed", "contracts", ["project_id", "is_signed"])

    # Deliverables - compound indexes for common queries (some may exist)
    if _table_exists("deliverables") and not _index_exists("idx_deliverables_tracking_code"):
        op.create_index("idx_deliverables_tracking_code", "deliverables", ["tracking_code"])

    # Git commits - compound index for deliverable + hash
    if _table_exists("git_commits") and not _index_exists("idx_git_commits_deliverable_sha"):
        op.create_index(
            "idx_git_commits_deliverable_sha",
            "git_commits",
            ["deliverable_id", "commit_sha"],
        )

    # Git repositories - compound index for integration + project
    if _table_exists("git_repositories") and not _index_exists("idx_git_repositories_integration_project"):
        op.create_index(
            "idx_git_repositories_integration_project",
            "git_repositories",
            ["integration_id", "project_id"],
        )

    # Invoices - compound indexes for payment and status queries (some may exist)
    if _table_exists("invoices") and not _index_exists("idx_invoices_payment_reference"):
        op.create_index("idx_invoices_payment_reference", "invoices", ["payment_reference"])

    # Milestones - compound index for project + status (may already exist)
    if _table_exists("milestones") and not _index_exists("idx_milestones_project_status"):
        op.create_index("idx_milestones_project_status", "milestones", ["project_id", "status"])

    # Payment milestones - compound index for project + status
    if _table_exists("payment_milestones") and not _index_exists("idx_payment_milestones_project_status"):
        op.create_index(
            "idx_payment_milestones_project_status",
            "payment_milestones",
            ["project_id", "status"],
        )

    # Projects - compound indexes for common queries (some may exist)
    if _table_exists("projects") and not _index_exists("idx_projects_status_created"):
        op.create_index("idx_projects_status_created", "projects", ["status", "created_at"])

    # Time entries - compound index for user + time range (some may exist)
    if _table_exists("time_entries") and not _index_exists("idx_time_entries_user_time"):
        op.create_index("idx_time_entries_user_time", "time_entries", ["user_id", "start_time"])

    # Time sessions - compound index for user + date range
    if _table_exists("time_sessions") and not _index_exists("idx_time_sessions_user_date"):
        op.create_index("idx_time_sessions_user_date", "time_sessions", ["user_id", "start_time"])

    # Subscriptions - compound index for user + status (may already exist)
    if _table_exists("subscriptions") and not _index_exists("idx_subscriptions_user_status"):
        op.create_index("idx_subscriptions_user_status", "subscriptions", ["user_id", "status"])


def _index_exists(index_name: str) -> bool:
    """Check if an index already exists"""
    from sqlalchemy import text

    conn = op.get_bind()
    result = conn.execute(text(f"""
        SELECT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE indexname = '{index_name}'
        )
    """))
    return result.scalar()


def _table_exists(table_name: str) -> bool:
    """Check if a table exists"""
    from sqlalchemy import text

    conn = op.get_bind()
    result = conn.execute(text(f"""
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = '{table_name}'
        )
    """))
    return result.scalar()


def downgrade() -> None:
    # Drop only indexes created by this migration (those that may not exist elsewhere)

    # Drop activities indexes
    if _index_exists("idx_activities_user_entity"):
        op.drop_index("idx_activities_user_entity", table_name="activities")
    if _index_exists("idx_activities_user_created"):
        op.drop_index("idx_activities_user_created", table_name="activities")

    # Drop change_requests index
    if _index_exists("idx_change_requests_project_status"):
        op.drop_index("idx_change_requests_project_status", table_name="change_requests")

    # Drop clients index
    if _index_exists("idx_clients_user_active"):
        op.drop_index("idx_clients_user_active", table_name="clients")

    # Drop contracts index
    if _index_exists("idx_contracts_project_signed"):
        op.drop_index("idx_contracts_project_signed", table_name="contracts")

    # Drop deliverables index
    if _index_exists("idx_deliverables_tracking_code"):
        op.drop_index("idx_deliverables_tracking_code", table_name="deliverables")

    # Drop git_commits index
    if _index_exists("idx_git_commits_deliverable_sha"):
        op.drop_index("idx_git_commits_deliverable_sha", table_name="git_commits")

    # Drop git_repositories index
    if _index_exists("idx_git_repositories_integration_project"):
        op.drop_index("idx_git_repositories_integration_project", table_name="git_repositories")

    # Drop invoices index
    if _index_exists("idx_invoices_payment_reference"):
        op.drop_index("idx_invoices_payment_reference", table_name="invoices")

    # Drop milestones index
    if _index_exists("idx_milestones_project_status"):
        op.drop_index("idx_milestones_project_status", table_name="milestones")

    # Drop payment_milestones index
    if _index_exists("idx_payment_milestones_project_status"):
        op.drop_index("idx_payment_milestones_project_status", table_name="payment_milestones")

    # Drop projects index
    if _index_exists("idx_projects_status_created"):
        op.drop_index("idx_projects_status_created", table_name="projects")

    # Drop time_entries index
    if _index_exists("idx_time_entries_user_time"):
        op.drop_index("idx_time_entries_user_time", table_name="time_entries")

    # Drop time_sessions index
    if _index_exists("idx_time_sessions_user_date"):
        op.drop_index("idx_time_sessions_user_date", table_name="time_sessions")

    # Drop subscriptions index
    if _index_exists("idx_subscriptions_user_status"):
        op.drop_index("idx_subscriptions_user_status", table_name="subscriptions")


def _index_exists(index_name: str) -> bool:
    """Check if an index already exists"""
    from sqlalchemy import text

    conn = op.get_bind()
    result = conn.execute(text(f"""
        SELECT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE indexname = '{index_name}'
        )
    """))
    return result.scalar()


def _table_exists(table_name: str) -> bool:
    """Check if a table exists"""
    from sqlalchemy import text

    conn = op.get_bind()
    result = conn.execute(text(f"""
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = '{table_name}'
        )
    """))
    return result.scalar()
