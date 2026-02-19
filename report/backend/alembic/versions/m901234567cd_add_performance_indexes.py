"""add performance indexes

Revision ID: m901234567cd
Revises: e94a0a099ce1
Create Date: 2025-11-17 10:00:00.000000

"""

import sqlalchemy as sa
from sqlalchemy import text

from alembic import op

# revision identifiers, used by Alembic.
revision = "m901234567cd"
down_revision = "e94a0a099ce1"
branch_labels = None
depends_on = None


def index_exists(index_name):
    """Check if an index already exists"""
    conn = op.get_bind()
    result = conn.execute(
        text("SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = :index_name)"),
        {"index_name": index_name},
    )
    return result.scalar()


def table_has_column(table_name, column_name):
    """Check if a table has a specific column"""
    conn = op.get_bind()
    result = conn.execute(
        text("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = :table_name 
                AND column_name = :column_name
            )
            """),
        {"table_name": table_name, "column_name": column_name},
    )
    return result.scalar()


def table_exists(table_name):
    """Check if a table exists"""
    conn = op.get_bind()
    result = conn.execute(
        text("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables 
                WHERE table_name = :table_name
            )
            """),
        {"table_name": table_name},
    )
    return result.scalar()


def create_index_if_not_exists(index_name, table_name, columns):
    """Create index only if it doesn't exist and table+columns exist"""
    if not index_exists(index_name):
        # Check if table exists
        if not table_exists(table_name):
            return

        # Check if all columns exist
        for column in columns:
            if not table_has_column(table_name, column):
                return

        op.create_index(index_name, table_name, columns)


def upgrade():
    """
    Add strategic indexes for common query patterns to improve performance.

    Focus areas:
    1. Composite indexes for frequently joined/filtered columns
    2. Time-based queries (created_at, updated_at, due_date, etc.)
    3. Status-based filtering with user/project context
    """

    # ============================================================================
    # USERS TABLE - Optimize user lookups and filtering
    # ============================================================================
    create_index_if_not_exists("idx_users_provider", "users", ["provider"])
    create_index_if_not_exists("idx_users_is_active", "users", ["is_active"])
    create_index_if_not_exists("idx_users_provider_is_active", "users", ["provider", "is_active"])
    create_index_if_not_exists("idx_users_created_at", "users", ["created_at"])

    # ============================================================================
    # USER_SETTINGS TABLE
    # ============================================================================
    # user_id already has index, no additional needed

    # ============================================================================
    # CLIENTS TABLE - Optimize client queries by user and status
    # ============================================================================
    create_index_if_not_exists("idx_clients_user_is_active", "clients", ["user_id", "is_active"])
    create_index_if_not_exists("idx_clients_created_at", "clients", ["created_at"])
    create_index_if_not_exists("idx_clients_email_user_id", "clients", ["email", "user_id"])

    # ============================================================================
    # PROJECTS TABLE - Critical for most queries
    # ============================================================================
    # Composite indexes for common query patterns
    create_index_if_not_exists("idx_projects_user_status", "projects", ["user_id", "status"])
    create_index_if_not_exists("idx_projects_client_status", "projects", ["client_id", "status"])
    create_index_if_not_exists("idx_projects_user_created_at", "projects", ["user_id", "created_at"])

    # Time-based queries
    create_index_if_not_exists("idx_projects_due_date", "projects", ["due_date"])
    create_index_if_not_exists("idx_projects_start_date", "projects", ["start_date"])
    create_index_if_not_exists("idx_projects_created_at", "projects", ["created_at"])
    create_index_if_not_exists("idx_projects_updated_at", "projects", ["updated_at"])

    # Contract and template tracking
    create_index_if_not_exists("idx_projects_contract_signed", "projects", ["contract_signed"])
    create_index_if_not_exists("idx_projects_contract_signed_at", "projects", ["contract_signed_at"])
    create_index_if_not_exists("idx_projects_applied_template_id", "projects", ["applied_template_id"])
    create_index_if_not_exists("idx_projects_applied_template_type", "projects", ["applied_template_type"])

    # Budget monitoring
    create_index_if_not_exists("idx_projects_auto_replenish", "projects", ["auto_replenish"])

    # ============================================================================
    # MILESTONES TABLE - Project milestone queries
    # ============================================================================
    create_index_if_not_exists("idx_milestones_project_order", "milestones", ["project_id", "order"])
    create_index_if_not_exists("idx_milestones_project_status", "milestones", ["project_id", "status"])
    create_index_if_not_exists("idx_milestones_target_date", "milestones", ["target_date"])
    create_index_if_not_exists("idx_milestones_completed_at", "milestones", ["completed_at"])
    create_index_if_not_exists("idx_milestones_created_at", "milestones", ["created_at"])

    # ============================================================================
    # DELIVERABLES TABLE - High volume, needs good indexing
    # ============================================================================
    # Composite indexes for filtering
    create_index_if_not_exists("idx_deliverables_project_status", "deliverables", ["project_id", "status"])
    create_index_if_not_exists("idx_deliverables_milestone_status", "deliverables", ["milestone_id", "status"])
    create_index_if_not_exists(
        "idx_deliverables_project_milestone",
        "deliverables",
        ["project_id", "milestone_id"],
    )

    # Git integration queries
    create_index_if_not_exists("idx_deliverables_git_pr_number", "deliverables", ["git_pr_number"])
    create_index_if_not_exists("idx_deliverables_git_commit_hash", "deliverables", ["git_commit_hash"])
    create_index_if_not_exists("idx_deliverables_git_merge_status", "deliverables", ["git_merge_status"])

    # Status and verification
    create_index_if_not_exists("idx_deliverables_is_approved", "deliverables", ["is_approved"])
    create_index_if_not_exists("idx_deliverables_verified_at", "deliverables", ["verified_at"])
    create_index_if_not_exists("idx_deliverables_auto_verified", "deliverables", ["auto_verified"])

    # Time tracking
    create_index_if_not_exists("idx_deliverables_created_at", "deliverables", ["created_at"])
    create_index_if_not_exists("idx_deliverables_updated_at", "deliverables", ["updated_at"])

    # ============================================================================
    # CHANGE_REQUESTS TABLE - Scope change tracking
    # ============================================================================
    create_index_if_not_exists(
        "idx_change_requests_project_status",
        "change_requests",
        ["project_id", "status"],
    )
    create_index_if_not_exists("idx_change_requests_approved_at", "change_requests", ["approved_at"])
    create_index_if_not_exists("idx_change_requests_completed_at", "change_requests", ["completed_at"])
    create_index_if_not_exists("idx_change_requests_payment_received", "change_requests", ["payment_received"])
    create_index_if_not_exists("idx_change_requests_created_at", "change_requests", ["created_at"])

    # ============================================================================
    # INVOICES TABLE - Financial queries
    # ============================================================================
    create_index_if_not_exists("idx_invoices_project_status", "invoices", ["project_id", "status"])
    create_index_if_not_exists("idx_invoices_client_status", "invoices", ["client_id", "status"])
    create_index_if_not_exists("idx_invoices_user_status", "invoices", ["user_id", "status"])
    create_index_if_not_exists("idx_invoices_due_date", "invoices", ["due_date"])
    create_index_if_not_exists("idx_invoices_created_at", "invoices", ["created_at"])
    create_index_if_not_exists("idx_invoices_sent_at", "invoices", ["sent_at"])
    create_index_if_not_exists("idx_invoices_payment_received_at", "invoices", ["payment_received_at"])

    # Payment verification tracking
    create_index_if_not_exists("idx_invoices_client_marked_paid", "invoices", ["client_marked_paid"])
    create_index_if_not_exists("idx_invoices_developer_verified", "invoices", ["developer_verified"])

    # ============================================================================
    # CONTRACT_TEMPLATES TABLE
    # ============================================================================
    create_index_if_not_exists(
        "idx_contract_templates_user_is_default",
        "contract_templates",
        ["user_id", "is_default"],
    )
    create_index_if_not_exists("idx_contract_templates_created_at", "contract_templates", ["created_at"])

    # ============================================================================
    # TIME_ENTRIES TABLE - Time tracking queries
    # ============================================================================
    create_index_if_not_exists(
        "idx_time_entries_project_deliverable",
        "time_entries",
        ["project_id", "deliverable_id"],
    )
    create_index_if_not_exists("idx_time_entries_project_id", "time_entries", ["project_id"])
    create_index_if_not_exists("idx_time_entries_commit_timestamp", "time_entries", ["commit_timestamp"])
    create_index_if_not_exists("idx_time_entries_developer_email", "time_entries", ["developer_email"])
    create_index_if_not_exists("idx_time_entries_verified", "time_entries", ["verified"])
    create_index_if_not_exists("idx_time_entries_auto_tracked", "time_entries", ["auto_tracked"])
    create_index_if_not_exists("idx_time_entries_session_id", "time_entries", ["session_id"])
    create_index_if_not_exists("idx_time_entries_created_at", "time_entries", ["created_at"])

    # ============================================================================
    # COMMIT_REVIEWS TABLE - Commit review workflow
    # ============================================================================
    create_index_if_not_exists("idx_commit_reviews_project_status", "commit_reviews", ["project_id", "status"])
    create_index_if_not_exists("idx_commit_reviews_deliverable_id", "commit_reviews", ["deliverable_id"])
    create_index_if_not_exists("idx_commit_reviews_commit_timestamp", "commit_reviews", ["commit_timestamp"])
    create_index_if_not_exists("idx_commit_reviews_sent_to_client", "commit_reviews", ["sent_to_client"])
    create_index_if_not_exists("idx_commit_reviews_reviewed_by", "commit_reviews", ["reviewed_by"])
    create_index_if_not_exists("idx_commit_reviews_reviewed_at", "commit_reviews", ["reviewed_at"])
    create_index_if_not_exists("idx_commit_reviews_created_at", "commit_reviews", ["created_at"])

    # ============================================================================
    # COMMIT_PARSER_CONFIGS TABLE
    # ============================================================================
    create_index_if_not_exists("idx_commit_parser_configs_user_id", "commit_parser_configs", ["user_id"])

    # ============================================================================
    # GIT_ACCESS_LOGS TABLE - Audit logging
    # ============================================================================
    create_index_if_not_exists(
        "idx_git_access_logs_project_created_at",
        "git_access_logs",
        ["project_id", "created_at"],
    )
    create_index_if_not_exists(
        "idx_git_access_logs_user_created_at",
        "git_access_logs",
        ["user_id", "created_at"],
    )
    create_index_if_not_exists("idx_git_access_logs_action", "git_access_logs", ["action"])
    create_index_if_not_exists("idx_git_access_logs_success", "git_access_logs", ["success"])
    create_index_if_not_exists("idx_git_access_logs_provider", "git_access_logs", ["provider"])
    create_index_if_not_exists("idx_git_access_logs_created_at", "git_access_logs", ["created_at"])

    # ============================================================================
    # SUBSCRIPTIONS TABLE - User subscription management
    # ============================================================================
    create_index_if_not_exists("idx_subscriptions_plan", "subscriptions", ["plan"])
    create_index_if_not_exists("idx_subscriptions_status", "subscriptions", ["status"])
    create_index_if_not_exists("idx_subscriptions_plan_status", "subscriptions", ["plan", "status"])
    create_index_if_not_exists("idx_subscriptions_expires_at", "subscriptions", ["expires_at"])
    create_index_if_not_exists("idx_subscriptions_started_at", "subscriptions", ["started_at"])
    create_index_if_not_exists("idx_subscriptions_created_at", "subscriptions", ["created_at"])

    # ============================================================================
    # PAYMENT_METHODS TABLE - Payment configuration
    # ============================================================================
    create_index_if_not_exists(
        "idx_payment_methods_user_is_active",
        "payment_methods",
        ["user_id", "is_active"],
    )
    create_index_if_not_exists(
        "idx_payment_methods_user_is_default",
        "payment_methods",
        ["user_id", "is_default"],
    )
    create_index_if_not_exists(
        "idx_payment_methods_user_method_type",
        "payment_methods",
        ["user_id", "method_type"],
    )
    create_index_if_not_exists("idx_payment_methods_is_default", "payment_methods", ["is_default"])
    create_index_if_not_exists("idx_payment_methods_created_at", "payment_methods", ["created_at"])

    # ============================================================================
    # AUTO_PAUSE_EVENTS TABLE - Auto-pause tracking
    # ============================================================================
    create_index_if_not_exists(
        "idx_auto_pause_events_project_event_type",
        "auto_pause_events",
        ["project_id", "event_type"],
    )
    create_index_if_not_exists("idx_auto_pause_events_access_revoked", "auto_pause_events", ["access_revoked"])
    create_index_if_not_exists(
        "idx_auto_pause_events_access_restored",
        "auto_pause_events",
        ["access_restored"],
    )
    create_index_if_not_exists("idx_auto_pause_events_resolved_at", "auto_pause_events", ["resolved_at"])
    create_index_if_not_exists("idx_auto_pause_events_created_at", "auto_pause_events", ["created_at"])

    # ============================================================================
    # CLIENT_PORTAL_SESSIONS TABLE - Session management
    # ============================================================================
    create_index_if_not_exists(
        "idx_client_portal_sessions_client_expires_at",
        "client_portal_sessions",
        ["client_id", "expires_at"],
    )
    create_index_if_not_exists(
        "idx_client_portal_sessions_is_revoked",
        "client_portal_sessions",
        ["is_revoked"],
    )
    create_index_if_not_exists(
        "idx_client_portal_sessions_created_at",
        "client_portal_sessions",
        ["created_at"],
    )

    # ============================================================================
    # CLIENT_PORTAL_ACCESS_LOGS TABLE - Access logging
    # ============================================================================
    create_index_if_not_exists(
        "idx_client_portal_access_logs_client_created_at",
        "client_portal_access_logs",
        ["client_id", "created_at"],
    )
    create_index_if_not_exists(
        "idx_client_portal_access_logs_session_id",
        "client_portal_access_logs",
        ["session_id"],
    )
    create_index_if_not_exists("idx_client_portal_access_logs_action", "client_portal_access_logs", ["action"])
    create_index_if_not_exists(
        "idx_client_portal_access_logs_success",
        "client_portal_access_logs",
        ["success"],
    )

    # ============================================================================
    # TIME_TRACKER_INTEGRATIONS TABLE - Time tracker integration
    # ============================================================================
    create_index_if_not_exists(
        "idx_time_tracker_integrations_user_provider",
        "time_tracker_integrations",
        ["user_id", "provider"],
    )
    create_index_if_not_exists(
        "idx_time_tracker_integrations_user_is_active",
        "time_tracker_integrations",
        ["user_id", "is_active"],
    )
    create_index_if_not_exists(
        "idx_time_tracker_integrations_provider",
        "time_tracker_integrations",
        ["provider"],
    )
    create_index_if_not_exists(
        "idx_time_tracker_integrations_is_active",
        "time_tracker_integrations",
        ["is_active"],
    )
    create_index_if_not_exists(
        "idx_time_tracker_integrations_created_at",
        "time_tracker_integrations",
        ["created_at"],
    )

    # ============================================================================
    # PAYSTACK_SUBACCOUNTS TABLE - Paystack integration
    # ============================================================================
    create_index_if_not_exists("idx_paystack_subaccounts_is_active", "paystack_subaccounts", ["is_active"])
    create_index_if_not_exists(
        "idx_paystack_subaccounts_user_is_active",
        "paystack_subaccounts",
        ["user_id", "is_active"],
    )
    create_index_if_not_exists("idx_paystack_subaccounts_created_at", "paystack_subaccounts", ["created_at"])

    # ============================================================================
    # CONTRACT_SIGNATURES TABLE - Contract signing
    # ============================================================================
    create_index_if_not_exists("idx_contract_signatures_client_id", "contract_signatures", ["client_id"])
    create_index_if_not_exists("idx_contract_signatures_signed", "contract_signatures", ["signed"])
    create_index_if_not_exists("idx_contract_signatures_signed_at", "contract_signatures", ["signed_at"])
    create_index_if_not_exists(
        "idx_contract_signatures_project_signed",
        "contract_signatures",
        ["project_id", "signed"],
    )
    create_index_if_not_exists(
        "idx_contract_signatures_signing_token_expires_at",
        "contract_signatures",
        ["signing_token_expires_at"],
    )
    create_index_if_not_exists("idx_contract_signatures_created_at", "contract_signatures", ["created_at"])

    # ============================================================================
    # PROJECT_TEMPLATES TABLE - Project template management
    # ============================================================================
    # Note: user_id, category, is_system_template already have indexes from previous migrations
    create_index_if_not_exists("idx_project_templates_is_public", "project_templates", ["is_public"])
    create_index_if_not_exists("idx_project_templates_template_type", "project_templates", ["template_type"])
    create_index_if_not_exists(
        "idx_project_templates_user_system",
        "project_templates",
        ["user_id", "is_system_template"],
    )
    create_index_if_not_exists(
        "idx_project_templates_category_system",
        "project_templates",
        ["category", "is_system_template"],
    )
    create_index_if_not_exists("idx_project_templates_usage_count", "project_templates", ["usage_count"])
    create_index_if_not_exists("idx_project_templates_created_at", "project_templates", ["created_at"])


def drop_index_if_exists(index_name, table_name):
    """Drop index only if it exists"""
    if index_exists(index_name):
        op.drop_index(index_name, table_name=table_name)


def downgrade():
    """
    Remove all performance indexes.
    """

    # Users
    drop_index_if_exists("idx_users_provider", "users")
    drop_index_if_exists("idx_users_is_active", "users")
    drop_index_if_exists("idx_users_provider_is_active", "users")
    drop_index_if_exists("idx_users_created_at", "users")

    # Clients
    drop_index_if_exists("idx_clients_user_is_active", "clients")
    drop_index_if_exists("idx_clients_created_at", "clients")
    drop_index_if_exists("idx_clients_email_user_id", "clients")

    # Projects
    drop_index_if_exists("idx_projects_user_status", "projects")
    drop_index_if_exists("idx_projects_client_status", "projects")
    drop_index_if_exists("idx_projects_user_created_at", "projects")
    drop_index_if_exists("idx_projects_due_date", "projects")
    drop_index_if_exists("idx_projects_start_date", "projects")
    drop_index_if_exists("idx_projects_created_at", "projects")
    drop_index_if_exists("idx_projects_updated_at", "projects")
    drop_index_if_exists("idx_projects_contract_signed", "projects")
    drop_index_if_exists("idx_projects_contract_signed_at", "projects")
    drop_index_if_exists("idx_projects_applied_template_id", "projects")
    drop_index_if_exists("idx_projects_applied_template_type", "projects")
    drop_index_if_exists("idx_projects_auto_replenish", "projects")

    # Milestones
    drop_index_if_exists("idx_milestones_project_order", "milestones")
    drop_index_if_exists("idx_milestones_project_status", "milestones")
    drop_index_if_exists("idx_milestones_target_date", "milestones")
    drop_index_if_exists("idx_milestones_completed_at", "milestones")
    drop_index_if_exists("idx_milestones_created_at", "milestones")

    # Deliverables
    drop_index_if_exists("idx_deliverables_project_status", "deliverables")
    drop_index_if_exists("idx_deliverables_milestone_status", "deliverables")
    drop_index_if_exists("idx_deliverables_project_milestone", "deliverables")
    drop_index_if_exists("idx_deliverables_git_pr_number", "deliverables")
    drop_index_if_exists("idx_deliverables_git_commit_hash", "deliverables")
    drop_index_if_exists("idx_deliverables_git_merge_status", "deliverables")
    drop_index_if_exists("idx_deliverables_is_approved", "deliverables")
    drop_index_if_exists("idx_deliverables_verified_at", "deliverables")
    drop_index_if_exists("idx_deliverables_auto_verified", "deliverables")
    drop_index_if_exists("idx_deliverables_created_at", "deliverables")
    drop_index_if_exists("idx_deliverables_updated_at", "deliverables")

    # Change Requests
    drop_index_if_exists("idx_change_requests_project_status", "change_requests")
    drop_index_if_exists("idx_change_requests_approved_at", "change_requests")
    drop_index_if_exists("idx_change_requests_completed_at", "change_requests")
    drop_index_if_exists("idx_change_requests_payment_received", "change_requests")
    drop_index_if_exists("idx_change_requests_created_at", "change_requests")

    # Invoices
    drop_index_if_exists("idx_invoices_project_status", "invoices")
    drop_index_if_exists("idx_invoices_client_status", "invoices")
    drop_index_if_exists("idx_invoices_user_status", "invoices")
    drop_index_if_exists("idx_invoices_due_date", "invoices")
    drop_index_if_exists("idx_invoices_created_at", "invoices")
    drop_index_if_exists("idx_invoices_sent_at", "invoices")
    drop_index_if_exists("idx_invoices_payment_received_at", "invoices")
    drop_index_if_exists("idx_invoices_client_marked_paid", "invoices")
    drop_index_if_exists("idx_invoices_developer_verified", "invoices")

    # Contract Templates
    drop_index_if_exists("idx_contract_templates_user_is_default", "contract_templates")
    drop_index_if_exists("idx_contract_templates_created_at", "contract_templates")

    # Time Entries
    drop_index_if_exists("idx_time_entries_project_deliverable", "time_entries")
    drop_index_if_exists("idx_time_entries_project_id", "time_entries")
    drop_index_if_exists("idx_time_entries_commit_timestamp", "time_entries")
    drop_index_if_exists("idx_time_entries_developer_email", "time_entries")
    drop_index_if_exists("idx_time_entries_verified", "time_entries")
    drop_index_if_exists("idx_time_entries_auto_tracked", "time_entries")
    drop_index_if_exists("idx_time_entries_session_id", "time_entries")
    drop_index_if_exists("idx_time_entries_created_at", "time_entries")

    # Commit Reviews
    drop_index_if_exists("idx_commit_reviews_project_status", "commit_reviews")
    drop_index_if_exists("idx_commit_reviews_deliverable_id", "commit_reviews")
    drop_index_if_exists("idx_commit_reviews_commit_timestamp", "commit_reviews")
    drop_index_if_exists("idx_commit_reviews_sent_to_client", "commit_reviews")
    drop_index_if_exists("idx_commit_reviews_reviewed_by", "commit_reviews")
    drop_index_if_exists("idx_commit_reviews_reviewed_at", "commit_reviews")
    drop_index_if_exists("idx_commit_reviews_created_at", "commit_reviews")

    # Commit Parser Configs
    drop_index_if_exists("idx_commit_parser_configs_user_id", "commit_parser_configs")

    # Git Access Logs
    drop_index_if_exists("idx_git_access_logs_project_created_at", "git_access_logs")
    drop_index_if_exists("idx_git_access_logs_user_created_at", "git_access_logs")
    drop_index_if_exists("idx_git_access_logs_action", "git_access_logs")
    drop_index_if_exists("idx_git_access_logs_success", "git_access_logs")
    drop_index_if_exists("idx_git_access_logs_provider", "git_access_logs")
    drop_index_if_exists("idx_git_access_logs_created_at", "git_access_logs")

    # Subscriptions
    drop_index_if_exists("idx_subscriptions_plan", "subscriptions")
    drop_index_if_exists("idx_subscriptions_status", "subscriptions")
    drop_index_if_exists("idx_subscriptions_plan_status", "subscriptions")
    drop_index_if_exists("idx_subscriptions_expires_at", "subscriptions")
    drop_index_if_exists("idx_subscriptions_started_at", "subscriptions")
    drop_index_if_exists("idx_subscriptions_created_at", "subscriptions")

    # Payment Methods
    drop_index_if_exists("idx_payment_methods_user_is_active", "payment_methods")
    drop_index_if_exists("idx_payment_methods_user_is_default", "payment_methods")
    drop_index_if_exists("idx_payment_methods_user_method_type", "payment_methods")
    drop_index_if_exists("idx_payment_methods_is_default", "payment_methods")
    drop_index_if_exists("idx_payment_methods_created_at", "payment_methods")

    # Auto Pause Events
    drop_index_if_exists("idx_auto_pause_events_project_event_type", "auto_pause_events")
    drop_index_if_exists("idx_auto_pause_events_access_revoked", "auto_pause_events")
    drop_index_if_exists("idx_auto_pause_events_access_restored", "auto_pause_events")
    drop_index_if_exists("idx_auto_pause_events_resolved_at", "auto_pause_events")
    drop_index_if_exists("idx_auto_pause_events_created_at", "auto_pause_events")

    # Client Portal Sessions
    drop_index_if_exists("idx_client_portal_sessions_client_expires_at", "client_portal_sessions")
    drop_index_if_exists("idx_client_portal_sessions_is_revoked", "client_portal_sessions")
    drop_index_if_exists("idx_client_portal_sessions_created_at", "client_portal_sessions")

    # Client Portal Access Logs
    drop_index_if_exists("idx_client_portal_access_logs_client_created_at", "client_portal_access_logs")
    drop_index_if_exists("idx_client_portal_access_logs_session_id", "client_portal_access_logs")
    drop_index_if_exists("idx_client_portal_access_logs_action", "client_portal_access_logs")
    drop_index_if_exists("idx_client_portal_access_logs_success", "client_portal_access_logs")

    # Time Tracker Integrations
    drop_index_if_exists("idx_time_tracker_integrations_user_provider", "time_tracker_integrations")
    drop_index_if_exists("idx_time_tracker_integrations_user_is_active", "time_tracker_integrations")
    drop_index_if_exists("idx_time_tracker_integrations_provider", "time_tracker_integrations")
    drop_index_if_exists("idx_time_tracker_integrations_is_active", "time_tracker_integrations")
    drop_index_if_exists("idx_time_tracker_integrations_created_at", "time_tracker_integrations")

    # Paystack Subaccounts
    drop_index_if_exists("idx_paystack_subaccounts_is_active", "paystack_subaccounts")
    drop_index_if_exists("idx_paystack_subaccounts_user_is_active", "paystack_subaccounts")
    drop_index_if_exists("idx_paystack_subaccounts_created_at", "paystack_subaccounts")

    # Contract Signatures
    drop_index_if_exists("idx_contract_signatures_client_id", "contract_signatures")
    drop_index_if_exists("idx_contract_signatures_signed", "contract_signatures")
    drop_index_if_exists("idx_contract_signatures_signed_at", "contract_signatures")
    drop_index_if_exists("idx_contract_signatures_project_signed", "contract_signatures")
    drop_index_if_exists("idx_contract_signatures_signing_token_expires_at", "contract_signatures")
    drop_index_if_exists("idx_contract_signatures_created_at", "contract_signatures")

    # Project Templates
    drop_index_if_exists("idx_project_templates_is_public", "project_templates")
    drop_index_if_exists("idx_project_templates_template_type", "project_templates")
    drop_index_if_exists("idx_project_templates_user_system", "project_templates")
    drop_index_if_exists("idx_project_templates_category_system", "project_templates")
    drop_index_if_exists("idx_project_templates_usage_count", "project_templates")
    drop_index_if_exists("idx_project_templates_created_at", "project_templates")
