#!/usr/bin/env python3
"""
Generate an encryption key for time tracker API tokens

This script generates a Fernet encryption key that should be stored
in your environment variables as ENCRYPTION_KEY.

Usage:
    python scripts/generate_encryption_key.py
"""

from cryptography.fernet import Fernet


def generate_key():
    """Generate a new Fernet encryption key"""
    key = Fernet.generate_key()
    return key.decode()


if __name__ == "__main__":
    key = generate_key()

    print("=" * 70)
    print("ENCRYPTION KEY GENERATED")
    print("=" * 70)
    print()
    print("Add this to your .env file:")
    print()
    print(f"ENCRYPTION_KEY={key}")
    print()
    print("=" * 70)
    print("IMPORTANT SECURITY NOTES:")
    print("=" * 70)
    print("1. Keep this key secret - never commit it to version control")
    print("2. Store it securely in your environment variables")
    print("3. In production, use a secrets manager (AWS Secrets Manager, etc.)")
    print("4. If you lose this key, you won't be able to decrypt existing tokens")
    print("5. Backup this key securely")
    print("=" * 70)
