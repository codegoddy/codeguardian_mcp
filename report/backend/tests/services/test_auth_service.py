"""
Unit tests for core authentication services.

Tests cover:
- Password hashing and verification
- JWT token creation and decoding
- Token validation and expiration
- OAuth state management
"""

from datetime import timedelta
from unittest.mock import MagicMock, patch

import pytest


class TestPasswordHashing:
    """Tests for password hashing functionality."""

    def test_password_hash_is_different_from_plain(self):
        """Verify hashed password is different from plain password."""
        from app.core.auth import get_password_hash

        plain_password = "TestPassword123!"
        hashed = get_password_hash(plain_password)

        assert hashed != plain_password

    def test_password_verification_success(self):
        """Verify correct password passes verification."""
        from app.core.auth import get_password_hash, verify_password

        plain_password = "TestPassword123!"
        hashed = get_password_hash(plain_password)

        assert verify_password(plain_password, hashed) is True

    def test_password_verification_failure(self):
        """Verify incorrect password fails verification."""
        from app.core.auth import get_password_hash, verify_password

        plain_password = "TestPassword123!"
        hashed = get_password_hash(plain_password)

        assert verify_password("WrongPassword", hashed) is False

    def test_different_passwords_produce_different_hashes(self):
        """Verify two different passwords produce different hashes."""
        from app.core.auth import get_password_hash

        hash1 = get_password_hash("Password1")
        hash2 = get_password_hash("Password2")

        assert hash1 != hash2

    def test_same_password_produces_different_hashes(self):
        """Verify same password produces different hashes (due to salt)."""
        from app.core.auth import get_password_hash

        password = "SamePassword"
        hash1 = get_password_hash(password)
        hash2 = get_password_hash(password)

        assert hash1 != hash2
        from app.core.auth import verify_password

        assert verify_password(password, hash1) is True
        assert verify_password(password, hash2) is True

    def test_password_max_length_handling(self):
        """Verify long passwords are properly handled."""
        from app.core.auth import get_password_hash, verify_password

        long_password = "A" * 100
        hashed = get_password_hash(long_password)

        assert verify_password(long_password, hashed) is True

    def test_empty_password_handling(self):
        """Verify empty password can be hashed and verified."""
        from app.core.auth import get_password_hash, verify_password

        empty_password = ""
        hashed = get_password_hash(empty_password)

        assert verify_password(empty_password, hashed) is True


class TestJWTTokens:
    """Tests for JWT token creation and decoding."""

    def test_create_access_token(self):
        """Test access token creation."""
        from app.core.auth import create_access_token

        token = create_access_token(data={"sub": "test@example.com"})

        assert token is not None
        assert isinstance(token, str)
        assert len(token) > 0
        assert len(token.split(".")) == 3

    def test_create_access_token_with_custom_expiry(self):
        """Test access token with custom expiry time."""
        from app.core.auth import create_access_token

        token = create_access_token(data={"sub": "test@example.com"}, expires_delta=timedelta(hours=2))

        assert token is not None
        assert isinstance(token, str)

    def test_create_refresh_token(self):
        """Test refresh token creation."""
        from app.core.auth import create_refresh_token

        token = create_refresh_token(data={"sub": "test@example.com"})

        assert token is not None
        assert isinstance(token, str)
        assert len(token.split(".")) == 3

    def test_decode_access_token(self):
        """Test access token decoding."""
        from app.core.auth import create_access_token, decode_access_token

        email = "test@example.com"
        token = create_access_token(data={"sub": email})

        payload = decode_access_token(token)

        assert payload is not None
        assert payload.get("sub") == email
        assert payload.get("type") == "access"

    def test_decode_access_token_wrong_type_raises(self):
        """Test decoding refresh token as access token raises error."""
        from fastapi import HTTPException

        from app.core.auth import create_refresh_token, decode_access_token

        token = create_refresh_token(data={"sub": "test@example.com"})

        with pytest.raises(HTTPException) as exc_info:
            decode_access_token(token)

        assert exc_info.value.status_code == 401
        assert "Invalid token type" in str(exc_info.value.detail)

    def test_decode_invalid_token_raises(self):
        """Test decoding invalid token raises error."""
        from fastapi import HTTPException

        from app.core.auth import decode_access_token

        with pytest.raises(HTTPException) as exc_info:
            decode_access_token("invalid.token.here")

        assert exc_info.value.status_code == 401

    def test_token_contains_user_data(self):
        """Test token can include user_id and full_name."""
        from app.core.auth import create_access_token

        token = create_access_token(data={"sub": "test@example.com"}, user_id="user-123", full_name="Test User")

        assert token is not None
        assert isinstance(token, str)


class TestTokenExpiration:
    """Tests for token expiration checking."""

    def test_check_token_expiration_valid_token(self):
        """Test checking expiration of valid token."""
        from app.core.auth import check_token_expiration, create_access_token

        token = create_access_token(data={"sub": "test@example.com"}, expires_delta=timedelta(hours=1))

        result = check_token_expiration(token)

        assert result.get("expired") is False
        assert "expires_in_seconds" in result
        assert result.get("expires_in_seconds") > 0

    def test_check_token_expiration_expired_token(self):
        """Test checking expiration of expired token."""
        from app.core.auth import check_token_expiration, create_access_token

        token = create_access_token(data={"sub": "test@example.com"}, expires_delta=timedelta(days=-1))

        result = check_token_expiration(token)

        assert result.get("expired") is True


class TestOAuthState:
    """Tests for OAuth state generation and verification."""

    def test_generate_oauth_state_returns_string(self):
        """Test OAuth state generation returns a string."""
        from app.core.auth import generate_oauth_state

        state = generate_oauth_state("google")

        assert state is not None
        assert isinstance(state, str)
        assert len(state) > 0


class TestPasswordHasherClass:
    """Tests for PasswordHasher class directly."""

    def test_password_hasher_initialization(self):
        """Test PasswordHasher initializes with correct rounds."""
        from app.core.auth import PasswordHasher

        hasher = PasswordHasher()

        assert hasher.salt_rounds == 12

    def test_password_hasher_hash_method(self):
        """Test PasswordHasher hash method."""
        from app.core.auth import PasswordHasher

        hasher = PasswordHasher()
        result = hasher.hash("password123")

        assert result is not None
        assert isinstance(result, str)
        assert result.startswith("$2b$")

    def test_password_hasher_verify_method(self):
        """Test PasswordHasher verify method."""
        from app.core.auth import PasswordHasher

        hasher = PasswordHasher()
        password = "mysecretpassword"
        hashed = hasher.hash(password)

        assert hasher.verify(password, hashed) is True
        assert hasher.verify("wrongpassword", hashed) is False
