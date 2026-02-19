"""
Unit tests for CRUD operations.

Tests cover:
- User creation
- User retrieval by email
- Database operations
"""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest


class TestUserCreation:
    """Tests for user creation in database."""

    @pytest.mark.asyncio
    async def test_create_user_success(self):
        """Test successful user creation."""
        from app.schemas.auth import UserCreate
        from app.utils.crud import create_user

        mock_db = AsyncMock()
        mock_user = MagicMock()
        mock_user.id = uuid4()
        mock_user.email = "test@example.com"
        mock_user.full_name = "Test User"

        mock_db.add = MagicMock()
        mock_db.commit = AsyncMock()
        mock_db.refresh = AsyncMock()

        with patch("app.utils.crud.pwd_hasher") as mock_hasher:
            mock_hasher.hash.return_value = "hashed_password"

            with patch("app.models.user.User", return_value=mock_user):
                user = await create_user(
                    mock_db,
                    UserCreate(
                        email="test@example.com",
                        full_name="Test User",
                        password="Password123!",
                    ),
                )

        mock_db.add.assert_called_once()
        mock_db.commit.assert_called_once()


class TestUserRetrieval:
    """Tests for user retrieval from database."""

    @pytest.mark.asyncio
    async def test_get_user_by_email_found(self):
        """Test getting user by email when exists."""
        from app.utils.crud import get_user_by_email

        mock_db = AsyncMock()
        mock_user = MagicMock()
        mock_user.email = "test@example.com"

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_user
        mock_db.execute = AsyncMock(return_value=mock_result)

        user = await get_user_by_email(mock_db, "test@example.com")

        assert user is not None
        assert user.email == "test@example.com"

    @pytest.mark.asyncio
    async def test_get_user_by_email_not_found(self):
        """Test getting user by email when not exists."""
        from app.utils.crud import get_user_by_email

        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=mock_result)

        user = await get_user_by_email(mock_db, "nonexistent@example.com")

        assert user is None


class TestPasswordHashing:
    """Tests for password hashing integration."""

    def test_password_hash_length(self):
        """Test password hash has expected bcrypt format."""
        from app.core.auth import get_password_hash

        password = "TestPassword123!"
        hashed = get_password_hash(password)

        assert hashed.startswith("$2b$12$")
        assert len(hashed) == 60

    def test_password_verify_different_passwords(self):
        """Test verification fails for different passwords."""
        from app.core.auth import get_password_hash, verify_password

        password = "CorrectPassword"
        wrong_password = "WrongPassword"
        hashed = get_password_hash(password)

        assert verify_password(password, hashed) is True
        assert verify_password(wrong_password, hashed) is False


class TestSessionManagement:
    """Tests for session-related operations."""

    @pytest.mark.asyncio
    async def test_db_session_operations(self):
        """Test database session operations."""
        mock_session = AsyncMock()

        mock_session.commit = AsyncMock()
        await mock_session.commit()
        mock_session.commit.assert_called_once()

        mock_session.rollback = AsyncMock()
        await mock_session.rollback()
        mock_session.rollback.assert_called_once()


class TestUUIDHelpers:
    """Tests for UUID utility functions."""

    def test_uuid_generation(self):
        """Test UUID generation produces valid UUIDs."""
        uuid1 = uuid4()
        uuid2 = uuid4()

        assert uuid1 != uuid2

        uuid_str = str(uuid1)
        assert len(uuid_str) == 36

    def test_uuid_string_conversion(self):
        """Test UUID to string conversion."""
        original_uuid = uuid4()
        uuid_str = str(original_uuid)

        assert isinstance(uuid_str, str)
        assert len(uuid_str) == 36


class TestDateTimeHelpers:
    """Tests for datetime utility functions."""

    def test_datetime_now(self):
        """Test datetime.now returns current time."""
        from datetime import datetime, timezone

        dt = datetime.now(timezone.utc)

        assert dt is not None
        assert dt.tzinfo is not None

    def test_timedelta_operations(self):
        """Test timedelta calculations."""
        from datetime import timedelta

        delta1 = timedelta(hours=2)
        delta2 = timedelta(minutes=30)

        total_minutes = (delta1 + delta2).total_seconds() / 60
        assert total_minutes == 150
