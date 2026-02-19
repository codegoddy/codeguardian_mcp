import asyncio
import os
import ssl
import sys
import time

from dotenv import load_dotenv
from sqlalchemy import create_engine, event, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.ext.declarative import declarative_base

from app.core.config import settings
from app.core.logging_config import get_logger

logger = get_logger(__name__)

# Load environment variables from .env
load_dotenv()

# Use the database URL from settings (which uses DATABASE_URL env var or constructs it from individual params)
DATABASE_URL = settings.database_url

# Check if we're running in alembic context
is_alembic = "alembic" in sys.argv[0] if hasattr(sys, "argv") and sys.argv else False

# Slow query threshold (in seconds)
SLOW_QUERY_THRESHOLD = float(os.getenv("SLOW_QUERY_THRESHOLD", "1.0"))

# Don't create engines at import time to avoid issues with alembic
engine = None
async_session = None


def _setup_slow_query_logging(sync_engine):
    """Set up slow query logging for synchronous engine (alembic)"""

    @event.listens_for(sync_engine, "before_cursor_execute")
    def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        context._query_start_time = time.time()

    @event.listens_for(sync_engine, "after_cursor_execute")
    def after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        if hasattr(context, "_query_start_time"):
            duration = time.time() - context._query_start_time
            if duration > SLOW_QUERY_THRESHOLD:
                logger.warning(
                    "Slow query detected",
                    extra={
                        "query": statement[:500],  # Truncate long queries
                        "duration": round(duration, 3),
                        "parameters": str(parameters)[:200] if parameters else None,
                    },
                )


def get_engine():
    """Get the appropriate engine (sync for alembic, async for FastAPI)"""
    global engine
    if engine is None:
        base_kwargs = settings.get_database_kwargs or {}

        if is_alembic:
            # For alembic migrations, use sync engine
            engine = create_engine(
                DATABASE_URL,
                **base_kwargs,
                pool_pre_ping=True,
                pool_recycle=3600,
            )
            _setup_slow_query_logging(engine)
        else:
            # For FastAPI application, use async engine with optimized pool settings
            # Optimized for production environments with proper connection pooling

            # Detect if we're running in a scaled environment
            num_instances = int(os.getenv("NUM_INSTANCES", "1"))

            if num_instances > 1:
                # Scaled environment (docker-compose with 3 replicas)
                # Each instance gets smaller pool to avoid exhausting DB connections
                pool_size = 5
                max_overflow = 3
            else:
                # Single instance (can use larger pool)
                # Production defaults: 15 base + 15 overflow = 30 max connections
                pool_size = 15
                max_overflow = 15

            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE

            # Build connect_args for PgBouncer compatibility
            # PgBouncer with pool_mode=transaction doesn't support prepared statements
            # We must disable both statement cache and prepared statement cache
            merged_connect_args = {
                **(base_kwargs.get("connect_args", {})),
                "ssl": ctx,
                "statement_cache_size": 0,  # Disable prepared statement cache for PgBouncer
                "prepared_statement_cache_size": 0,  # Additional safety for asyncpg
                "max_cacheable_statement_size": 0,  # Disable statement caching entirely
            }

            logger.info(
                "Creating async engine with PgBouncer compatibility: statement_cache_size=%s, prepared_statement_cache_size=%s, max_cacheable_statement_size=%s",
                merged_connect_args.get("statement_cache_size"),
                merged_connect_args.get("prepared_statement_cache_size"),
                merged_connect_args.get("max_cacheable_statement_size"),
            )

            engine = create_async_engine(
                DATABASE_URL,
                **{k: v for k, v in base_kwargs.items() if k != "connect_args"},
                connect_args=merged_connect_args,
                pool_size=pool_size,
                max_overflow=max_overflow,
                pool_pre_ping=True,
                pool_recycle=3600,
                pool_timeout=30,
                echo=False,
                # Disable SQLAlchemy's statement cache as well for PgBouncer compatibility
                query_cache_size=0,
            )

            # Set up slow query logging for async engine
            @event.listens_for(engine.sync_engine, "before_cursor_execute")
            def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
                context._query_start_time = time.time()

            @event.listens_for(engine.sync_engine, "after_cursor_execute")
            def after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
                if hasattr(context, "_query_start_time"):
                    duration = time.time() - context._query_start_time
                    if duration > SLOW_QUERY_THRESHOLD:
                        logger.warning(
                            "Slow query detected",
                            extra={
                                "query": statement[:500],
                                "duration": round(duration, 3),
                                "parameters": (str(parameters)[:200] if parameters else None),
                            },
                        )

        logger.info(
            "Connection pool configured: pool_size=%s, max_overflow=%s, max_connections=%s",
            pool_size,
            max_overflow,
            pool_size + max_overflow,
        )
    return engine


# Test the connection
def test_connection():
    try:
        if is_alembic:
            # Sync connection test
            with get_engine().connect() as conn:
                conn.execute(text("SELECT 1"))
        else:
            # Async connection test
            asyncio.run(async_test_connection())
        logger.info("Connection successful!")
    except Exception as e:
        logger.error("Failed to connect", exc_info=True)


async def async_test_connection():
    try:
        async with get_engine().begin() as conn:
            await conn.execute(text("SELECT 1"))
        logger.info("Async connection successful!")
    except Exception as e:
        logger.error("Failed to connect", exc_info=True)


# Add Base and Session for the app
Base = declarative_base()


def get_async_session():
    """Get async session maker for FastAPI"""
    global async_session
    if async_session is None:
        async_session = async_sessionmaker(bind=get_engine(), expire_on_commit=False)
    return async_session


# Only create async session for FastAPI, not for alembic
async def get_db():
    session_maker = get_async_session()
    async with session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
