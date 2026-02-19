"""
Sample test to verify pytest setup is working correctly.

This test file ensures that:
- Pytest is configured correctly
- Fixtures are available
- Database connections work
- Test client can make requests
"""

import pytest


def test_pytest_setup():
    """Verify pytest is running correctly."""
    assert True


def test_test_db_session(test_db_session):
    """Verify database session fixture works."""
    assert test_db_session is not None
    assert hasattr(test_db_session, "add")
    assert hasattr(test_db_session, "commit")


def test_test_client_fixture(test_client):
    """Verify test client fixture works."""
    assert test_client is not None
    assert hasattr(test_client, "get")
    assert hasattr(test_client, "post")


@pytest.mark.asyncio
async def test_async_test_client_fixture(async_test_client):
    """Verify async test client fixture works."""
    assert async_test_client is not None
    assert hasattr(async_test_client, "get")
    assert hasattr(async_test_client, "post")


def test_health_endpoint(test_client):
    """Test the health check endpoint."""
    response = test_client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data


def test_create_user(test_db_session):
    """Test creating a user in the test database."""
    from app.core.auth import get_password_hash
    from app.models import User

    user = User(
        email="newuser@example.com",
        hashed_password=get_password_hash("Password123!"),
        full_name="New User",
        is_active=True,
    )

    test_db_session.add(user)
    import asyncio

    asyncio.run(test_db_session.commit())
    asyncio.run(test_db_session.refresh(user))

    assert user.id is not None
    assert user.email == "newuser@example.com"
    assert user.is_active is True


def test_auth_token_fixture(auth_token):
    """Verify auth token fixture generates valid tokens."""
    assert auth_token is not None
    assert isinstance(auth_token, str)
    assert len(auth_token) > 0


def test_auth_headers_fixture(auth_headers):
    """Verify auth headers fixture creates proper headers."""
    assert auth_headers is not None
    assert "Authorization" in auth_headers
    assert auth_headers["Authorization"].startswith("Bearer ")


def test_mock_nats_client(mock_nats_client):
    """Verify mock NATS client fixture works."""
    assert mock_nats_client is not None
    assert hasattr(mock_nats_client, "publish")
    assert hasattr(mock_nats_client, "subscribe")
