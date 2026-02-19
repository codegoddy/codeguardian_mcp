"""
Security utilities for encryption and token management
"""

import base64
import os

from cryptography.fernet import Fernet

from app.core.logging_config import get_logger

logger = get_logger(__name__)


# Get encryption key from environment or generate one
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY")
if not ENCRYPTION_KEY:
    # Generate a key for development (in production, this should be in env vars)
    ENCRYPTION_KEY = Fernet.generate_key().decode()
    logger.warning("Using generated encryption key. Set ENCRYPTION_KEY in production!")

# Ensure the key is bytes
if isinstance(ENCRYPTION_KEY, str):
    ENCRYPTION_KEY = ENCRYPTION_KEY.encode()

cipher_suite = Fernet(ENCRYPTION_KEY)


def encrypt_token(token: str) -> str:
    """
    Encrypt an API token for secure storage

    Args:
        token: Plain text API token

    Returns:
        Encrypted token as base64 string
    """
    encrypted = cipher_suite.encrypt(token.encode())
    return base64.b64encode(encrypted).decode()


def decrypt_token(encrypted_token: str) -> str:
    """
    Decrypt an API token

    Args:
        encrypted_token: Encrypted token as base64 string

    Returns:
        Plain text API token
    """
    encrypted_bytes = base64.b64decode(encrypted_token.encode())
    decrypted = cipher_suite.decrypt(encrypted_bytes)
    return decrypted.decode()
