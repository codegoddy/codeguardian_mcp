"""
Pytest configuration and fixtures for DevHQ backend tests.

This module provides shared test fixtures for:
- Database sessions and transactions
- Authentication tokens
- HTTP test clients
- NATS messaging mocks
- Application lifecycle management
"""

import asyncio
import os
from datetime import datetime, timedelta
from typing import AsyncGenerator, Generator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient
from sqlalchemy import TypeDecorator, event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.types import JSON

from app.core.config import settings
from app.db.database import Base, get_db
from app.main import app
from app.models import *
from app.models.activity import Activity
from app.models.notification import Notification
from app.models.support_conversation import SupportConversation


class SQLiteJSONType(TypeDecorator):
    """Custom JSON type that works with both PostgreSQL and SQLite."""

    impl = JSON
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "sqlite":
            return dialect.type_descriptor(JSON())
        else:
            return dialect.type_descriptor(JSON())


@pytest.fixture(scope="session", autouse=True)
def setup_test_db_types():
    """Setup compatible JSON types for testing."""
    # Patch JSONB columns to use SQLite-compatible JSON
    Activity.__table__.c.extra_data.type = SQLiteJSONType()
    Notification.__table__.c.extra_data.type = SQLiteJSONType()
    SupportConversation.__table__.c.messages.type = SQLiteJSONType()
    yield
    # No need to restore as these are per-session


@pytest.fixture(scope="session")
def event_loop() -> Generator[asyncio.AbstractEventLoop, None, None]:
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="function")
async def test_db_engine():
    """Create an in-memory SQLite database for testing.

    This fixture creates a fresh database for each test function,
    ensuring complete isolation between tests.

    Note: SQLite doesn't support JSONB natively, so we use JSON type
    which works with SQLite's JSON extension.
    """
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def test_db_session(test_db_engine) -> AsyncGenerator[AsyncSession, None]:
    """Create a database session for testing.

    Each test gets its own session that's rolled back after the test,
    ensuring no data persists between tests.
    """
    async_session = async_sessionmaker(
        test_db_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async with async_session() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture(scope="function")
async def db_override(test_db_session):
    """Override the database dependency with test session."""

    async def get_test_db():
        yield test_db_session

    app.dependency_overrides[get_db] = get_test_db

    yield

    app.dependency_overrides.clear()


@pytest.fixture(scope="function")
def test_client(db_override) -> TestClient:
    """Create a FastAPI test client with database override.

    Use this fixture for synchronous tests. For async tests,
    use the async_test_client fixture instead.
    """
    with TestClient(app) as client:
        yield client


@pytest_asyncio.fixture(scope="function")
async def async_test_client(db_override) -> AsyncGenerator[AsyncClient, None]:
    """Create an async HTTP client for testing.

    This is the preferred fixture for testing FastAPI async endpoints.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest.fixture(scope="function")
def test_user(test_db_session: AsyncSession) -> User:
    """Create a test user in the database.

    Returns a User model instance that's persisted to the test database.
    """
    from app.core.auth import get_password_hash

    user = User(
        email="test@example.com",
        hashed_password=get_password_hash("TestPassword123!"),
        full_name="Test User",
        is_active=True,
    )

    test_db_session.add(user)
    import asyncio

    asyncio.run(test_db_session.commit())
    asyncio.run(test_db_session.refresh(user))

    return user


@pytest.fixture(scope="function")
def test_admin(test_db_session: AsyncSession) -> User:
    """Create a test admin user in the database."""
    from app.core.auth import get_password_hash

    admin = User(
        email="admin@example.com",
        hashed_password=get_password_hash("AdminPassword123!"),
        full_name="Admin User",
        is_active=True,
        is_superuser=True,
    )

    test_db_session.add(admin)
    import asyncio

    asyncio.run(test_db_session.commit())
    asyncio.run(test_db_session.refresh(admin))

    return admin


@pytest.fixture(scope="function")
def test_client_user(test_db_session: AsyncSession, test_user: User) -> Client:
    """Create a test client in the database."""
    client = Client(
        user_id=test_user.id,
        name="Test Client",
        email="client@example.com",
        company="Test Company",
        default_hourly_rate=50.0,
        change_request_rate=75.0,
        payment_method="manual",
    )

    test_db_session.add(client)
    import asyncio

    asyncio.run(test_db_session.commit())
    asyncio.run(test_db_session.refresh(client))

    return client


@pytest.fixture(scope="function")
def test_project(test_db_session: AsyncSession, test_client_user: User) -> Project:
    """Create a test project in database."""
    project = Project(
        user_id=test_client_user.user_id,
        client_id=test_client_user.id,
        name="Test Project",
        description="A test project for testing",
        status="in_progress",
        project_budget=10000.0,
        current_budget_remaining=10000.0,
    )

    test_db_session.add(project)
    import asyncio

    asyncio.run(test_db_session.commit())
    asyncio.run(test_db_session.refresh(project))

    return project


@pytest.fixture(scope="function")
def test_deliverable(test_db_session: AsyncSession, test_project: Project) -> Deliverable:
    """Create a test deliverable in database."""
    deliverable = Deliverable(
        project_id=test_project.id,
        title="Test Deliverable",
        description="A test deliverable",
        status="pending",
        estimated_hours=20.0,
        actual_hours=0.0,
    )

    test_db_session.add(deliverable)
    import asyncio

    asyncio.run(test_db_session.commit())
    asyncio.run(test_db_session.refresh(deliverable))

    return deliverable


@pytest.fixture(scope="function")
def auth_token(test_user: User) -> str:
    """Generate a valid JWT token for the test user.

    This fixture provides an authentication token that can be used
    to make authenticated requests to the API.
    """
    from app.core.auth import create_access_token

    token = create_access_token(data={"sub": test_user.email})
    return token


@pytest.fixture(scope="function")
def auth_headers(auth_token: str) -> dict:
    """Create authorization headers with the auth token."""
    return {"Authorization": f"Bearer {auth_token}"}


@pytest.fixture(scope="function")
def admin_auth_token(test_admin: User) -> str:
    """Generate a valid JWT token for the test admin user."""
    from app.core.auth import create_access_token

    token = create_access_token(data={"sub": test_admin.email})
    return token


@pytest.fixture(scope="function")
def admin_auth_headers(admin_auth_token: str) -> dict:
    """Create authorization headers for admin."""
    return {"Authorization": f"Bearer {admin_auth_token}"}


@pytest.fixture(scope="function")
def mock_nats_client():
    """Create a mock NATS client for testing.

    This fixture mocks the NATS client to prevent actual
    message publishing during tests.
    """
    mock_client = AsyncMock()
    mock_client.publish = AsyncMock()
    mock_client.subscribe = MagicMock()
    mock_client.close = AsyncMock()

    return mock_client


@pytest.fixture(scope="function")
def mock_brevo_email():
    """Create a mock Brevo email service for testing.

    This fixture mocks the email sending functionality
    to prevent actual emails from being sent.
    """
    with patch("app.services.email_service.sib") as mock:
        mock.send_transac_email.return_value = MagicMock(message_id="test-message-id")
        yield mock


@pytest.fixture(scope="function")
def mock_redis_cache():
    """Create a mock Redis cache for testing."""
    with patch("app.utils.cache.redis_client") as mock:
        mock.get.return_value = None
        mock.set.return_value = True
        mock.delete.return_value = True
        mock.exists.return_value = False
        yield mock


@pytest.fixture(scope="function")
def mock_cloudinary_upload():
    """Create a mock Cloudinary upload for testing."""
    with patch("app.services.cloudinary_service.uploader.upload") as mock:
        mock.return_value = {
            "url": "https://res.cloudinary.com/test/image.jpg",
            "public_id": "test-public-id",
            "secure_url": "https://res.cloudinary.com/test/image.jpg",
        }
        yield mock


@pytest.fixture(scope="function")
def test_environment():
    """Set test environment variables for testing.

    This fixture ensures consistent test environment configuration.
    """
    original_env = os.environ.copy()

    os.environ["ENVIRONMENT"] = "testing"
    os.environ["SECRET_KEY"] = "test-secret-key-for-testing-only"
    os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
    os.environ["DEBUG"] = "False"
    os.environ["NATS_URL"] = "nats://localhost:4222"

    yield

    os.environ.clear()
    os.environ.update(original_env)


@pytest.fixture(scope="function")
def sample_project_data(test_client_user: Client):
    """Return sample project data for creating projects."""
    return {
        "client_id": test_client_user.id,
        "name": "New Test Project",
        "description": "A new test project",
        "project_budget": 5000.0,
    }


@pytest.fixture(scope="function")
def sample_contract_data(test_project: Project):
    """Return sample contract data for creating contracts."""
    return {
        "project_id": test_project.id,
        "title": "Test Contract",
        "description": "Contract terms and conditions",
        "terms": "This is a test contract with standard terms.",
        "amount": 7500.0,
        "status": "draft",
    }


@pytest.fixture(scope="function")
def sample_deliverable_data(test_project: Project):
    """Return sample deliverable data for creating deliverables."""
    return {
        "project_id": test_project.id,
        "name": "Test Deliverable",
        "description": "A test deliverable item",
        "status": "pending",
        "due_date": (datetime.now() + timedelta(days=7)).isoformat(),
    }


# Pytest hooks for better test output
def pytest_configure(config):
    """Configure pytest with custom markers."""
    config.addinivalue_line("markers", "unit: Unit tests (fast, isolated)")
    config.addinivalue_line(
        "markers",
        "integration: Integration tests (require database, external services)",
    )
    config.addinivalue_line("markers", "slow: Slow-running tests")
    config.addinivalue_line("markers", "auth: Authentication-related tests")
    config.addinivalue_line("markers", "api: API endpoint tests")
    config.addinivalue_line("markers", "database: Database-related tests")
    config.addinivalue_line("markers", "email: Email service tests")
    config.addinivalue_line("markers", "payment: Payment processing tests")
    config.addinivalue_line("markers", "webhook: Webhook tests")


def pytest_collection_modifyitems(config, items):
    """Modify test collection to add markers automatically."""
    for item in items:
        # Mark tests in tests/api/ as api tests
        if "tests/api/" in str(item.fspath):
            item.add_marker(pytest.mark.api)

        # Mark tests in tests/integration/ as integration tests
        if "tests/integration/" in str(item.fspath):
            item.add_marker(pytest.mark.integration)

        # Mark tests in tests/services/ as unit tests
        if "tests/services/" in str(item.fspath):
            item.add_marker(pytest.mark.unit)
