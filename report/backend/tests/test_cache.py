"""
Test caching utilities and strategies.

Tests:
- Cache metrics tracking
- API response caching
- Auth data caching
- Cache invalidation patterns
- Cache health monitoring
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.core.logging_config import get_logger
from app.utils.cache import (
    AuthCache,
    CacheHealth,
    CacheInvalidator,
    CacheMetrics,
    CacheWarmer,
    batch_invalidate,
    cache_computation,
    cache_response,
    get_cache_key_identifier,
)
from app.utils.redis_client import RedisCache

logger = get_logger(__name__)


async def test_cache_metrics():
    """Test cache metrics tracking"""
    print("\n" + "=" * 60)
    print("Testing Cache Metrics")
    print("=" * 60)

    # Reset metrics
    CacheMetrics.reset()

    # Record some operations
    for _ in range(7):
        CacheMetrics.record_hit()
    for _ in range(3):
        CacheMetrics.record_miss()

    # Get stats
    stats = CacheMetrics.get_stats()
    print(f"✓ Metrics recorded successfully")
    print(f"  - Hits: {stats['hits']}")
    print(f"  - Misses: {stats['misses']}")
    print(f"  - Hit rate: {stats['hit_rate_percent']}%")
    print(f"  - Miss rate: {stats['miss_rate_percent']}%")

    assert stats["total_requests"] == 10
    assert stats["hit_rate_percent"] == 70.0
    print("✓ Metrics calculations correct")

    return True


async def test_cache_key_generation():
    """Test cache key generation"""
    print("\n" + "=" * 60)
    print("Testing Cache Key Generation")
    print("=" * 60)

    # Test get_cache_key_identifier
    key1 = get_cache_key_identifier("user:", "123", "profile")
    key2 = get_cache_key_identifier("project:", "456", "deliverables")
    key3 = get_cache_key_identifier("api:", "list", "projects", "user:789")

    print(f"✓ Generated cache keys:")
    print(f"  - {key1}")
    print(f"  - {key2}")
    print(f"  - {key3}")

    assert key1 == "user:123:profile"
    assert key2 == "project:456:deliverables"
    assert "api:list:projects" in key3
    print("✓ Cache key generation correct")

    return True


async def test_auth_cache():
    """Test auth data caching"""
    print("\n" + "=" * 60)
    print("Testing Auth Cache")
    print("=" * 60)

    # Test session caching
    session_id = "test_session_12345"
    user_id = "test_user_67890"
    session_data = {"ip": "127.0.0.1", "user_agent": "test-agent"}

    # Cache session
    success = await AuthCache.cache_session(session_id, user_id, session_data)
    print(f"✓ Session cached: {success}")
    assert success == True

    # Retrieve session
    cached = await AuthCache.get_session(session_id)
    print(f"✓ Session retrieved: {cached is not None}")
    assert cached is not None
    assert cached["user_id"] == user_id
    assert cached["ip"] == session_data["ip"]

    # Invalidate session
    invalidation_success = await AuthCache.invalidate_session(session_id)
    print(f"✓ Session invalidated: {invalidation_success}")
    assert invalidation_success == True

    # Verify session is gone
    after_invalidation = await AuthCache.get_session(session_id)
    print(f"✓ Session invalidated (now None): {after_invalidation is None}")
    assert after_invalidation is None

    # Test token caching
    token = "test_jwt_token_xyz123"
    token_success = await AuthCache.cache_token(token, user_id, "access")
    print(f"✓ Token cached: {token_success}")
    assert token_success == True

    # Retrieve token
    cached_token = await AuthCache.get_token(token, "access")
    print(f"✓ Token retrieved: {cached_token is not None}")
    assert cached_token is not None
    assert cached_token["user_id"] == user_id

    # Invalidate token
    token_invalidated = await AuthCache.invalidate_token(token, "access")
    print(f"✓ Token invalidated: {token_invalidated}")
    assert token_invalidated == True

    return True


async def test_cache_decorators():
    """Test cache decorators"""
    print("\n" + "=" * 60)
    print("Testing Cache Decorators")
    print("=" * 60)

    # Test @cache_computation decorator
    call_count = {"count": 0}

    @cache_computation(ttl=60, key_prefix="test:expensive:")
    async def expensive_computation(x: int, y: int) -> int:
        call_count["count"] += 1
        await asyncio.sleep(0.01)  # Simulate expensive operation
        return x + y

    # First call - should compute and cache
    result1 = await expensive_computation(5, 3)
    print(f"✓ First computation: {result1} (calls: {call_count['count']})")
    assert result1 == 8
    assert call_count["count"] == 1

    # Second call - should hit cache
    result2 = await expensive_computation(5, 3)
    print(f"✓ Second computation (cached): {result2} (calls: {call_count['count']})")
    assert result2 == 8
    assert call_count["count"] == 1  # Should not increment

    # Third call with different args - should compute
    result3 = await expensive_computation(10, 20)
    print(f"✓ Third computation (new args): {result3} (calls: {call_count['count']})")
    assert result3 == 30
    assert call_count["count"] == 2

    print("✓ @cache_computation decorator working correctly")

    return True


async def test_cache_health():
    """Test cache health monitoring"""
    print("\n" + "=" * 60)
    print("Testing Cache Health")
    print("=" * 60)

    # Get health report
    health = await CacheHealth.get_health_report()

    print(f"✓ Health report generated:")
    print(f"  - Redis available: {health['redis']['available']}")
    print(f"  - Redis latency: {health['redis']['latency_ms']}ms")
    print(f"  - L1 cache usage: {health['l1_cache']['usage_percent']}%")
    print(f"  - Cache hit rate: {health['metrics']['hit_rate_percent']}%")
    print(f"  - Health status: {health['health_status']}")

    assert "redis" in health
    assert "l1_cache" in health
    assert "metrics" in health
    assert "health_status" in health
    print("✓ Health report structure correct")

    # Test periodic metrics logging
    await CacheHealth.log_periodic_metrics()
    print("✓ Periodic metrics logged")

    return True


async def test_redis_cache_integration():
    """Test Redis cache basic operations"""
    print("\n" + "=" * 60)
    print("Testing Redis Cache Integration")
    print("=" * 60)

    # Check if Redis is configured
    is_configured = RedisCache.get_redis_client() is not None
    print(f"✓ Redis configured: {is_configured}")

    if is_configured:
        # Test basic set/get
        test_key = "test:integration:key"
        test_value = {"test": "data", "timestamp": "2025-01-02"}

        set_success = await RedisCache.set(test_key, test_value, ttl=60)
        print(f"✓ Set to cache: {set_success}")

        retrieved = await RedisCache.get(test_key)
        print(f"✓ Retrieved from cache: {retrieved is not None}")
        assert retrieved == test_value

        # Test delete
        delete_success = await RedisCache.delete(test_key)
        print(f"✓ Deleted from cache: {delete_success}")

        after_delete = await RedisCache.get(test_key)
        print(f"✓ Verify deletion (None): {after_delete is None}")
        assert after_delete is None

        print("✓ Redis cache operations working")
    else:
        print("⚠ Redis not configured, skipping integration tests")

    return True


async def test_cache_invalidation():
    """Test cache invalidation patterns"""
    print("\n" + "=" * 60)
    print("Testing Cache Invalidation")
    print("=" * 60)

    # Test user-related invalidation
    user_id = "test_user_invalid_123"
    invalidation_count = await CacheInvalidator.invalidate_user_related(user_id)
    print(f"✓ User-related invalidation: {invalidation_count} entries")
    assert invalidation_count >= 0

    # Test project-related invalidation
    project_id = "test_project_invalid_456"
    project_count = await CacheInvalidator.invalidate_project_related(project_id)
    print(f"✓ Project-related invalidation: {project_count} entries")
    assert project_count >= 0

    # Test client-related invalidation
    client_id = "test_client_invalid_789"
    client_count = await CacheInvalidator.invalidate_client_related(client_id)
    print(f"✓ Client-related invalidation: {client_count} entries")
    assert client_count >= 0

    print("✓ Cache invalidation patterns working")

    return True


async def test_cache_warmer():
    """Test cache warmup functionality"""
    print("\n" + "=" * 60)
    print("Testing Cache Warmer")
    print("=" * 60)

    # Test user cache warmup
    test_user_id = "test_user_warm_123"
    user_results = await CacheWarmer.warm_user_cache(test_user_id)
    print(f"✓ User cache warmup attempted:")
    print(f"  - User data: {user_results['user']}")
    print(f"  - Settings: {user_results['settings']}")
    print(f"  - Clients: {user_results['clients']}")

    assert "user" in user_results
    assert "settings" in user_results
    assert "clients" in user_results

    # Test project cache warmup
    test_project_id = "test_project_warm_456"
    project_results = await CacheWarmer.warm_project_cache(test_project_id)
    print(f"✓ Project cache warmup attempted:")
    print(f"  - Project data: {project_results['project']}")
    print(f"  - Deliverables: {project_results['deliverables']}")

    assert "project" in project_results
    assert "deliverables" in project_results

    print("✓ Cache warmup functionality working")

    return True


async def run_all_tests():
    """Run all caching tests"""
    print("\n" + "=" * 60)
    print("Caching Strategy Tests")
    print("=" * 60)

    results = []

    # Run tests
    results.append(("Cache Metrics", await test_cache_metrics()))
    results.append(("Cache Key Generation", await test_cache_key_generation()))
    results.append(("Auth Cache", await test_auth_cache()))
    results.append(("Cache Decorators", await test_cache_decorators()))
    results.append(("Cache Health", await test_cache_health()))
    results.append(("Redis Cache Integration", await test_redis_cache_integration()))
    results.append(("Cache Invalidation", await test_cache_invalidation()))
    results.append(("Cache Warmer", await test_cache_warmer()))

    # Summary
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)

    for test_name, passed in results:
        status = "✓ PASS" if passed else "✗ FAIL"
        print(f"{status}: {test_name}")

    total = len(results)
    passed_count = sum(1 for _, p in results if p)

    print(f"\n{passed_count}/{total} tests passed")

    if passed_count == total:
        print("\n✓ All caching tests passed!")
        return 0
    else:
        print(f"\n✗ {total - passed_count} test(s) failed")
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(run_all_tests())
    sys.exit(exit_code)
