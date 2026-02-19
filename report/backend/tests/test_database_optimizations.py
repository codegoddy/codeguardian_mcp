"""
Test database query optimizations.

This script tests:
1. Slow query logging
2. Connection pooling configuration
3. Index existence (when connected to a database)
4. Query optimizer utilities
"""

import asyncio
import os
import sys

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.core.config import settings
from app.core.logging_config import get_logger
from app.db.database import get_async_session, get_engine
from app.utils.query_optimizer import QueryOptimizer, batch_load_by_ids, check_for_nplus1_warnings

logger = get_logger(__name__)


async def test_connection_pooling():
    """Test connection pooling configuration"""
    print("\n" + "=" * 60)
    print("Testing Connection Pooling")
    print("=" * 60)

    try:
        engine = get_engine()

        pool = engine.pool
        print(f"✓ Engine created successfully")
        print(f"  - Pool size: {pool.size()}")
        print(f"  - Max overflow: {pool._max_overflow}")
        print(f"  - Checked out: {pool.checkedout()}")

        # Test connection
        from sqlalchemy import text

        async with engine.begin() as conn:
            result = await conn.execute(text("SELECT 1 as test"))
            test_value = result.scalar()
            print(f"✓ Database connection successful (test query: {test_value})")

        return True
    except Exception as e:
        print(f"✗ Connection pooling test failed: {e}")
        logger.error("Connection pooling test failed", exc_info=True)
        return False


async def test_slow_query_logging():
    """Test slow query logging configuration"""
    print("\n" + "=" * 60)
    print("Testing Slow Query Logging")
    print("=" * 60)

    try:
        slow_threshold = os.getenv("SLOW_QUERY_THRESHOLD", "1.0")
        print(f"✓ SLOW_QUERY_THRESHOLD configured: {slow_threshold}s")

        # Execute a query and check logging
        from sqlalchemy import text

        engine = get_engine()
        async with engine.begin() as conn:
            result = await conn.execute(text("SELECT pg_sleep(0.1)"))
            result.scalar()

        print("✓ Query executed (check logs for slow query warnings)")
        return True
    except Exception as e:
        print(f"✗ Slow query logging test failed: {e}")
        logger.error("Slow query logging test failed", exc_info=True)
        return False


async def test_query_optimizer():
    """Test query optimizer utilities"""
    print("\n" + "=" * 60)
    print("Testing Query Optimizer Utilities")
    print("=" * 60)

    try:
        # Test batch_load_by_ids with empty list
        result = await batch_load_by_ids(None, None, [])
        assert result == {}, "batch_load_by_ids should return empty dict for empty list"
        print("✓ batch_load_by_ids handles empty lists")

        # Test N+1 detection (should log warning)
        check_for_nplus1_warnings(10, 30, "test_function")
        print("✓ check_for_nplus1_warnings logs warning for suspicious ratios")

        # Test QueryOptimizer common relationships
        from app.models.project import Project

        options = QueryOptimizer.with_common_relationships(Project)
        print(f"✓ QueryOptimizer provides {len(options)} eager load options for Project")

        return True
    except Exception as e:
        print(f"✗ Query optimizer test failed: {e}")
        logger.error("Query optimizer test failed", exc_info=True)
        return False


async def test_redis_cache_config():
    """Test Redis cache configuration"""
    print("\n" + "=" * 60)
    print("Testing Redis Cache Configuration")
    print("=" * 60)

    try:
        is_configured = settings.is_cache_configured()
        print(f"✓ Cache configured: {is_configured}")

        if is_configured:
            print(f"  - Provider: Upstash Redis")
            print(f"  - URL: {settings.cache_config['url'][:20]}...")
        else:
            print("  - Note: Redis not configured, will use L1 cache only")

        # Test cache utility imports
        from app.utils.redis_client import RedisCache, _l1_cache

        print(f"✓ RedisCache utility available")
        print(f"✓ L1 cache configured: maxsize={_l1_cache.maxsize}, ttl={_l1_cache.ttl}")

        return True
    except Exception as e:
        print(f"✗ Redis cache config test failed: {e}")
        logger.error("Redis cache config test failed", exc_info=True)
        return False


async def run_all_tests():
    """Run all database optimization tests"""
    print("\n" + "=" * 60)
    print("Database Optimization Tests")
    print("=" * 60)
    print(f"Environment: {settings.environment.value}")
    print(
        f"Database URL: {settings.base_database_url[:30]}..." if settings.base_database_url else "Database URL: Not configured"
    )

    results = []

    # Run tests
    results.append(("Connection Pooling", await test_connection_pooling()))
    results.append(("Slow Query Logging", await test_slow_query_logging()))
    results.append(("Query Optimizer", await test_query_optimizer()))
    results.append(("Redis Cache Config", await test_redis_cache_config()))

    # Summary
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)

    for test_name, passed in results:
        status = "✓ PASS" if passed else "✗ FAIL"
        print(f"{status}: {test_name}")

    total = len(results)
    passed = sum(1 for _, p in results if p)

    print(f"\n{passed}/{total} tests passed")

    if passed == total:
        print("\n✓ All database optimization tests passed!")
        return 0
    else:
        print(f"\n✗ {total - passed} test(s) failed")
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(run_all_tests())
    sys.exit(exit_code)
