"""
DevHQ Configuration Module

Centralized configuration management with environment-specific settings,
feature flags, and comprehensive validation.

Usage:
    from app.core.config import settings

Configuration Priority:
    1. Environment variables (highest priority)
    2. .env file
    3. Default values (lowest priority)
"""

import json
import os
import re
import sys
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Set

from dotenv import load_dotenv

load_dotenv()


class Environment(str, Enum):
    """Application environment enum"""

    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"
    TEST = "test"


class LogLevel(str, Enum):
    """Logging level enum"""

    DEBUG = "DEBUG"
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"


@dataclass
class FeatureFlags:
    """Feature flags for feature toggling"""

    ai_estimation_enabled: bool = True
    git_integration_enabled: bool = True
    client_portal_enabled: bool = True
    time_tracking_enabled: bool = True
    budget_monitoring_enabled: bool = True
    change_requests_enabled: bool = True
    invoice_generation_enabled: bool = True
    payment_processing_enabled: bool = True
    webhook_notifications_enabled: bool = True
    email_notifications_enabled: bool = True

    @classmethod
    def from_env(cls) -> "FeatureFlags":
        """Create feature flags from environment variables"""
        return cls(
            ai_estimation_enabled=os.getenv("FEATURE_AI_ESTIMATION", "true").lower() == "true",
            git_integration_enabled=os.getenv("FEATURE_GIT_INTEGRATION", "true").lower() == "true",
            client_portal_enabled=os.getenv("FEATURE_CLIENT_PORTAL", "true").lower() == "true",
            time_tracking_enabled=os.getenv("FEATURE_TIME_TRACKING", "true").lower() == "true",
            budget_monitoring_enabled=os.getenv("FEATURE_BUDGET_MONITORING", "true").lower() == "true",
            change_requests_enabled=os.getenv("FEATURE_CHANGE_REQUESTS", "true").lower() == "true",
            invoice_generation_enabled=os.getenv("FEATURE_INVOICE_GENERATION", "true").lower() == "true",
            payment_processing_enabled=os.getenv("FEATURE_PAYMENT_PROCESSING", "true").lower() == "true",
            webhook_notifications_enabled=os.getenv("FEATURE_WEBHOOK_NOTIFICATIONS", "true").lower() == "true",
            email_notifications_enabled=os.getenv("FEATURE_EMAIL_NOTIFICATIONS", "true").lower() == "true",
        )

    def is_enabled(self, feature: str) -> bool:
        """Check if a feature is enabled"""
        return getattr(self, feature, False)


class ConfigValidationError(Exception):
    """Raised when configuration validation fails"""

    pass


class Settings:
    """
    Application settings with environment-specific configuration.

    All configuration is loaded from environment variables with sensible defaults.
    Critical security settings require explicit configuration.
    """

    # Application Identity
    app_name: str = "DevHQ API"
    app_version: str = "1.0.0"

    # Environment
    environment: Environment = Environment.DEVELOPMENT

    # Logging
    log_level: LogLevel = LogLevel.INFO
    json_logs: bool = False
    log_file: Optional[str] = None

    # Security
    secret_key: str = ""
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # Database
    base_database_url: str = ""

    # URLs
    frontend_url: str = "http://localhost:3000"
    backend_url: str = "http://localhost:8000"

    # OAuth Configuration
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = ""

    GITHUB_CLIENT_ID: str = ""
    GITHUB_CLIENT_SECRET: str = ""
    GITHUB_REDIRECT_URI: str = ""
    GITHUB_WEBHOOK_SECRET: str = ""

    GITLAB_CLIENT_ID: str = ""
    GITLAB_CLIENT_SECRET: str = ""
    GITLAB_REDIRECT_URI: str = ""
    GITLAB_WEBHOOK_SECRET: str = ""

    BITBUCKET_CLIENT_ID: str = ""
    BITBUCKET_CLIENT_SECRET: str = ""
    BITBUCKET_REDIRECT_URI: str = ""
    BITBUCKET_WEBHOOK_SECRET: str = ""

    # Feature Flags
    features: FeatureFlags = field(default_factory=FeatureFlags.from_env)

    def __init__(self):
        self._load_from_env()
        self._validate_critical_settings()
        self._configure_for_environment()

    def _load_from_env(self):
        """Load settings from environment variables"""
        # Application Identity
        self.app_name = os.getenv("APP_NAME", "DevHQ API")
        self.app_version = os.getenv("APP_VERSION", "1.0.0")

        # Environment
        env_value = os.getenv("ENVIRONMENT", "development").lower()
        try:
            self.environment = Environment(env_value)
        except ValueError:
            self.environment = Environment.DEVELOPMENT

        # Logging
        log_level_value = os.getenv("LOG_LEVEL", "INFO").upper()
        try:
            self.log_level = LogLevel(log_level_value)
        except ValueError:
            self.log_level = LogLevel.INFO
        self.json_logs = os.getenv("JSON_LOGS", str(self.environment == Environment.PRODUCTION)).lower() == "true"
        self.log_file = os.getenv("LOG_FILE") or None

        # Security
        self.secret_key = os.getenv("SECRET_KEY", "").strip()
        self.algorithm = os.getenv("ALGORITHM", "HS256")
        self.access_token_expire_minutes = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
        self.refresh_token_expire_days = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))

        # Database
        self.base_database_url = os.getenv("DATABASE_URL", "").strip()

        # URLs
        self.frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
        self.backend_url = os.getenv("BACKEND_URL", "http://localhost:8000")

        # OAuth Configuration
        self.GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
        self.GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
        self.GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "")

        self.GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID", "")
        self.GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET", "")
        self.GITHUB_REDIRECT_URI = os.getenv("GITHUB_REDIRECT_URI", "")
        self.GITHUB_WEBHOOK_SECRET = os.getenv("GITHUB_WEBHOOK_SECRET", "")

        self.GITLAB_CLIENT_ID = os.getenv("GITLAB_CLIENT_ID", "")
        self.GITLAB_CLIENT_SECRET = os.getenv("GITLAB_CLIENT_SECRET", "")
        self.GITLAB_REDIRECT_URI = os.getenv("GITLAB_REDIRECT_URI", "")
        self.GITLAB_WEBHOOK_SECRET = os.getenv("GITLAB_WEBHOOK_SECRET", "")

        self.BITBUCKET_CLIENT_ID = os.getenv("BITBUCKET_CLIENT_ID", "")
        self.BITBUCKET_CLIENT_SECRET = os.getenv("BITBUCKET_CLIENT_SECRET", "")
        self.BITBUCKET_REDIRECT_URI = os.getenv("BITBUCKET_REDIRECT_URI", "")
        self.BITBUCKET_WEBHOOK_SECRET = os.getenv("BITBUCKET_WEBHOOK_SECRET", "")

        # Feature Flags
        self.features = FeatureFlags.from_env()

    def _validate_critical_settings(self):
        """Validate critical security settings at startup"""
        errors = []

        # SECRET_KEY is required
        if not self.secret_key:
            errors.append("CRITICAL: SECRET_KEY must be set. " "Generate a secure key with: openssl rand -hex 32")

        # DEBUG cannot be True in production
        debug = os.getenv("DEBUG", "False").lower() == "true"
        if self.environment == Environment.PRODUCTION and debug:
            errors.append(
                "SECURITY WARNING: DEBUG=True is not allowed in production. " "Set DEBUG=False in your environment variables."
            )

        # DATABASE_URL is required for non-test environments
        if self.environment != Environment.TEST and not self.base_database_url:
            errors.append("CRITICAL: DATABASE_URL must be set. " "Format: postgresql://user:password@host:port/database")

        if errors:
            error_msg = "\n".join(errors)
            if self.environment == Environment.PRODUCTION:
                raise ConfigValidationError(error_msg)
            else:
                import logging

                logging.warning(f"Configuration warnings:\n{error_msg}")

    def _configure_for_environment(self):
        """Apply environment-specific configurations"""
        if self.environment == Environment.PRODUCTION:
            # Production-specific defaults
            if not self.log_file:
                self.log_file = "/var/log/devhq/app.log"

        elif self.environment == Environment.DEVELOPMENT:
            # Development-specific defaults
            self.log_level = LogLevel.DEBUG
            self.json_logs = False

    @property
    def is_development(self) -> bool:
        """Check if running in development mode"""
        return self.environment == Environment.DEVELOPMENT

    @property
    def is_production(self) -> bool:
        """Check if running in production mode"""
        return self.environment == Environment.PRODUCTION

    @property
    def is_testing(self) -> bool:
        """Check if running in test mode"""
        return self.environment == Environment.TEST

    @property
    def debug(self) -> bool:
        """Debug mode flag"""
        return os.getenv("DEBUG", "False").lower() == "true"

    # =========================================================================
    # Database Properties
    # =========================================================================

    @property
    def database_url(self) -> str:
        """Get the database URL with proper driver for the context"""
        if not self.base_database_url:
            raise ValueError("DATABASE_URL must be set")

        # Check for valid PostgreSQL URL
        if not (
            self.base_database_url.startswith("postgresql://")
            or self.base_database_url.startswith("postgresql+psycopg2://")
            or self.base_database_url.startswith("postgresql+asyncpg://")
        ):
            raise ValueError(
                "DATABASE_URL must start with 'postgresql://', 'postgresql+psycopg2://', or 'postgresql+asyncpg://'"
            )

        # Use asyncpg for FastAPI application
        is_alembic = "alembic" in sys.argv[0] if sys.argv else False

        if is_alembic:
            return self.base_database_url
        else:
            # Strip query parameters (like ?sslmode=require) as they're passed via connect_args
            base_url = self.base_database_url.split("?")[0]

            if base_url.startswith("postgresql://"):
                return "postgresql+asyncpg://" + base_url[13:]
            elif base_url.startswith("postgresql+psycopg2://"):
                return base_url.replace("postgresql+psycopg2://", "postgresql+asyncpg://")
            elif base_url.startswith("postgresql+asyncpg://"):
                return base_url  # Already correct format, query params stripped
            return self.base_database_url

    @property
    def is_managed_database(self) -> bool:
        """Check if using a managed database service"""
        if not self.base_database_url:
            return False
        return any(
            domain in self.base_database_url
            for domain in [
                "neon.tech",
                "supabase.co",
                "supabase.com",
                "railway.app",
                "render.com",
            ]
        )

    def get_database_ssl_mode(self) -> dict:
        """Get SSL configuration for database connections"""
        # Always disable prepared statements for PgBouncer compatibility
        # This fixes: "prepared statement does not exist" errors with PgBouncer
        # PgBouncer with pool_mode=transaction does not support prepared statements properly
        connect_args = {
            "statement_cache_size": 0,  # Required for PgBouncer
            "prepared_statement_cache_size": 0,  # Additional safety for asyncpg
        }

        if self.is_managed_database:
            import ssl

            connect_args["ssl"] = ssl.create_default_context()

        return {"connect_args": connect_args}

    @property
    def get_database_kwargs(self) -> dict:
        """Get database connection kwargs"""
        return self.get_database_ssl_mode()

    # =========================================================================
    # CORS Properties
    # =========================================================================

    @property
    def cors_origins(self) -> List[str]:
        """Get CORS origins based on environment"""
        origins = self._get_cors_origins_list()

        # Remove localhost in production
        if self.environment == Environment.PRODUCTION:
            origins = [o for o in origins if not self._is_localhost_url(o)]

        return list(set(origins))  # Remove duplicates

    def _get_cors_origins_list(self) -> List[str]:
        """Get CORS origins from environment or defaults"""
        origins = []

        # Get from environment variable
        cors_origins_str = os.getenv("CORS_ORIGINS")
        if cors_origins_str:
            try:
                if cors_origins_str.startswith("["):
                    origins = json.loads(cors_origins_str)
                else:
                    origins = [o.strip() for o in cors_origins_str.split(",") if o.strip()]
            except (json.JSONDecodeError, ValueError):
                origins = [cors_origins_str]

        # Always include frontend URL
        if self.frontend_url:
            origins.append(self.frontend_url)

        # Add environment-specific defaults
        if self.environment == Environment.PRODUCTION:
            origins.extend(
                [
                    "https://www.devhq.site",
                    "https://devhq.site",
                    "https://api.devhq.site",
                ]
            )
        else:
            # Development/Staging defaults
            origins.extend(
                [
                    "http://localhost:3000",
                    "http://127.0.0.1:3000",
                    "http://localhost:8000",
                    "http://127.0.0.1:8000",
                ]
            )

        return origins

    def _is_localhost_url(self, url: str) -> bool:
        """Check if URL is a localhost URL"""
        localhost_patterns = [
            "localhost",
            "127.0.0.1",
            "0.0.0.0",
        ]
        return any(pattern in url for pattern in localhost_patterns)

    def is_cors_origin_allowed(self, origin: str) -> bool:
        """Check if an origin is allowed for CORS"""
        return origin in self.cors_origins

    # =========================================================================
    # OAuth Configuration
    # =========================================================================

    @property
    def oauth_providers(self) -> Dict[str, Dict[str, str]]:
        """Get OAuth provider configurations"""
        return {
            "google": {
                "client_id": self.GOOGLE_CLIENT_ID,
                "client_secret": self.GOOGLE_CLIENT_SECRET,
                "redirect_uri": self.GOOGLE_REDIRECT_URI,
            },
            "github": {
                "client_id": self.GITHUB_CLIENT_ID,
                "client_secret": self.GITHUB_CLIENT_SECRET,
                "redirect_uri": self.GITHUB_REDIRECT_URI,
            },
            "gitlab": {
                "client_id": self.GITLAB_CLIENT_ID,
                "client_secret": self.GITLAB_CLIENT_SECRET,
                "redirect_uri": self.GITLAB_REDIRECT_URI,
            },
            "bitbucket": {
                "client_id": self.BITBUCKET_CLIENT_ID,
                "client_secret": self.BITBUCKET_CLIENT_SECRET,
                "redirect_uri": self.BITBUCKET_REDIRECT_URI,
            },
        }

    @property
    def webhook_secrets(self) -> Dict[str, str]:
        """Get webhook secrets for git providers"""
        return {
            "github": self.GITHUB_WEBHOOK_SECRET,
            "gitlab": self.GITLAB_WEBHOOK_SECRET,
            "bitbucket": self.BITBUCKET_WEBHOOK_SECRET,
        }

    def is_oauth_configured(self, provider: str) -> bool:
        """Check if an OAuth provider is configured"""
        provider_config = self.oauth_providers.get(provider.lower(), {})
        return all(provider_config.get(key) for key in ["client_id", "client_secret"])

    # =========================================================================
    # Email Configuration
    # =========================================================================

    @property
    def email_config(self) -> Dict[str, Any]:
        """Get email configuration"""
        return {
            "provider": "brevo",  # Default to Brevo
            "api_key": os.getenv("BREVO_API_KEY", ""),
            "from_email": os.getenv("EMAIL_FROM", "auth@devhq.com"),
            "from_name": os.getenv("EMAIL_FROM_NAME", "DevHQ Auth"),
        }

    @property
    def brevo_api_key(self) -> str:
        """Brevo API key"""
        return os.getenv("BREVO_API_KEY", "")

    @property
    def email_from(self) -> str:
        """Email from address"""
        return os.getenv("EMAIL_FROM", "auth@devhq.com")

    @property
    def email_from_name(self) -> str:
        """Email from name"""
        return os.getenv("EMAIL_FROM_NAME", "DevHQ Auth")

    def is_email_configured(self) -> bool:
        """Check if email is configured"""
        config = self.email_config
        return bool(config["api_key"] and config["from_email"])

    # =========================================================================
    # Payment Configuration
    # =========================================================================

    @property
    def paystack_config(self) -> Dict[str, str]:
        """Get Paystack configuration"""
        return {
            "secret_key": os.getenv("PAYSTACK_SECRET_KEY", ""),
            "public_key": os.getenv("PAYSTACK_PUBLIC_KEY", ""),
            "webhook_secret": os.getenv("PAYSTACK_WEBHOOK_SECRET", ""),
        }

    def is_paystack_configured(self) -> bool:
        """Check if Paystack is configured"""
        config = self.paystack_config
        return bool(config["secret_key"] and config["public_key"])

    @property
    def paystack_platform_fee_free_users(self) -> float:
        """Platform fee for free tier users"""
        return float(os.getenv("PAYSTACK_PLATFORM_FEE_FREE_USERS", "1.5"))

    @property
    def paystack_platform_fee_paid_users(self) -> float:
        """Platform fee for paid users"""
        return float(os.getenv("PAYSTACK_PLATFORM_FEE_PAID_USERS", "0.0"))

    # =========================================================================
    # Cloudinary Configuration
    # =========================================================================

    @property
    def cloudinary_cloud_name(self) -> str:
        """Cloudinary cloud name"""
        return os.getenv("CLOUDINARY_CLOUD_NAME", "")

    @property
    def cloudinary_api_key(self) -> str:
        """Cloudinary API key"""
        return os.getenv("CLOUDINARY_API_KEY", "")

    @property
    def cloudinary_api_secret(self) -> str:
        """Cloudinary API secret"""
        return os.getenv("CLOUDINARY_API_SECRET", "")

    @property
    def cloudinary_upload_preset(self) -> str:
        """Cloudinary upload preset"""
        return os.getenv("CLOUDINARY_UPLOAD_PRESET", "")

    def is_cloudinary_configured(self) -> bool:
        """Check if Cloudinary is configured"""
        return bool(self.cloudinary_cloud_name and self.cloudinary_api_key and self.cloudinary_api_secret)

    # =========================================================================
    # Supabase Storage Configuration
    # =========================================================================

    @property
    def supabase_url(self) -> str:
        """Supabase project URL"""
        return os.getenv("SUPABASE_URL", "")

    @property
    def supabase_service_role_key(self) -> str:
        """Supabase service role key for storage operations"""
        return os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

    @property
    def supabase_profile_images_bucket(self) -> str:
        """Supabase storage bucket name for profile images"""
        return os.getenv("SUPABASE_PROFILE_IMAGES_BUCKET", "profile-images")

    @property
    def supabase_contracts_bucket(self) -> str:
        """Supabase storage bucket name for contracts"""
        return os.getenv("SUPABASE_CONTRACTS_BUCKET", "contracts")

    def is_supabase_storage_configured(self) -> bool:
        """Check if Supabase storage is configured"""
        return bool(self.supabase_url and self.supabase_service_role_key)

    # =========================================================================
    # Encryption Configuration
    # =========================================================================

    @property
    def encryption_key(self) -> str:
        """Encryption key for sensitive data"""
        return os.getenv("ENCRYPTION_KEY", "")

    # =========================================================================
    # AI Configuration
    # =========================================================================

    @property
    def openrouter_api_key(self) -> str:
        """OpenRouter API key for AI services"""
        return os.getenv("OPENROUTER_API_KEY", "")

    @property
    def ai_provider(self) -> str:
        """AI provider (e.g., 'openrouter')"""
        return os.getenv("AI_PROVIDER", "openrouter")

    @property
    def ai_model(self) -> str:
        """AI model to use"""
        return os.getenv("AI_MODEL", "x-ai/grok-4.1-fast:free")

    @property
    def ai_estimation_enabled(self) -> bool:
        """Check if AI estimation is enabled"""
        return self.features.ai_estimation_enabled

    # =========================================================================
    # Cache Configuration
    # =========================================================================

    @property
    def upstash_redis_rest_url(self) -> str:
        """Upstash Redis REST URL"""
        return os.getenv("UPSTASH_REDIS_REST_URL", "")

    @property
    def upstash_redis_rest_token(self) -> str:
        """Upstash Redis REST token"""
        return os.getenv("UPSTASH_REDIS_REST_TOKEN", "")

    @property
    def cache_config(self) -> Dict[str, Any]:
        """Get cache configuration"""
        return {
            "provider": ("upstash_redis" if os.getenv("UPSTASH_REDIS_REST_URL") else "memory"),
            "url": os.getenv("UPSTASH_REDIS_REST_URL", ""),
            "token": os.getenv("UPSTASH_REDIS_REST_TOKEN", ""),
            "enabled": os.getenv("CACHE_ENABLED", "true").lower() == "true",
            "default_ttl": int(os.getenv("CACHE_DEFAULT_TTL", "300")),  # 5 minutes default
            "metrics_enabled": os.getenv("CACHE_METRICS_ENABLED", "true").lower() == "true",
        }

    def is_cache_configured(self) -> bool:
        """Check if cache is configured"""
        config = self.cache_config
        return config["provider"] == "upstash_redis" and bool(config["url"])

    # =========================================================================
    # Message Queue Configuration
    # =========================================================================

    @property
    def nats_config(self) -> Dict[str, Any]:
        """Get NATS configuration"""
        return {
            "url": self._get_nats_url(),
            "subjects": {
                "commits": os.getenv("NATS_COMMIT_SUBJECT", "commits.review"),
                "budget": os.getenv("NATS_BUDGET_SUBJECT", "budget.alert"),
                "time_entry": os.getenv("NATS_TIME_ENTRY_SUBJECT", "time.entry"),
                "review_reminder": os.getenv("NATS_REVIEW_REMINDER_SUBJECT", "review.reminder"),
            },
        }

    def _get_nats_url(self) -> str:
        """Get NATS URL"""
        nats_url = os.getenv("NATS_URL", "").strip()
        nats_host = os.getenv("NATS_HOST", "").strip()
        nats_port = os.getenv("NATS_PORT", "4222").strip()

        if nats_url and nats_url != "nats://localhost:4222":
            return nats_url if nats_url.startswith("nats://") else f"nats://{nats_url}"

        if nats_host:
            return f"nats://{nats_host}:{nats_port}"

        return "nats://localhost:4222"

    def is_nats_configured(self) -> bool:
        """Check if NATS is configured"""
        config = self.nats_config
        # Check if it's not just the default localhost
        return config["url"] != "nats://localhost:4222"

    # =========================================================================
    # Feature Flags
    # =========================================================================

    def is_feature_enabled(self, feature: str) -> bool:
        """Check if a feature is enabled"""
        return self.features.is_enabled(feature)

    # =========================================================================
    # Configuration Documentation
    # =========================================================================

    def get_config_summary(self) -> Dict[str, Any]:
        """Get a summary of the current configuration"""
        return {
            "app": {
                "name": self.app_name,
                "version": self.app_version,
                "environment": self.environment.value,
            },
            "security": {
                "secret_key_configured": bool(self.secret_key),
                "debug_mode": os.getenv("DEBUG", "False").lower() == "true",
            },
            "database": {
                "url_configured": bool(self.base_database_url),
                "is_managed": self.is_managed_database,
            },
            "integrations": {
                "email": self.is_email_configured(),
                "paystack": self.is_paystack_configured(),
                "cache": self.is_cache_configured(),
                "nats": self.is_nats_configured(),
            },
            "cache_config": {
                "enabled": self.cache_config["enabled"],
                "provider": self.cache_config["provider"],
                "default_ttl": self.cache_config["default_ttl"],
                "metrics_enabled": self.cache_config["metrics_enabled"],
            },
            "features": {
                "ai_estimation": self.features.ai_estimation_enabled,
                "git_integration": self.features.git_integration_enabled,
                "client_portal": self.features.client_portal_enabled,
                "time_tracking": self.features.time_tracking_enabled,
            },
        }


# Create singleton instance
settings = Settings()


# Convenience accessors for feature flags
def feature_enabled(feature: str) -> bool:
    """Check if a feature is enabled"""
    return settings.is_feature_enabled(feature)


def is_development() -> bool:
    """Check if running in development mode"""
    return settings.is_development


def is_production() -> bool:
    """Check if running in production mode"""
    return settings.is_production


def is_testing() -> bool:
    """Check if running in test mode"""
    return settings.is_testing
