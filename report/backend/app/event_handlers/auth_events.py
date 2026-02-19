"""
Authentication Event Handlers

Handles user authentication and account management events:
- User registration with OTP
- Account verification
- Password reset
- OTP sending and validation

NATS Subjects:
    user.registered          - New user registered (legacy format)
    user.registered_otp      - New user registered with OTP (new format)
    user.otp_verified        - User verified OTP (account activation)
    user.forgot_password      - Password reset requested (legacy)
    user.forgot_password_otp  - Password reset with OTP (new format)
"""

import asyncio
import json
import random
import string
from datetime import datetime

from app.core.config import settings
from app.core.logging_config import get_logger
from app.utils.email import send_otp_email, send_password_reset_email, send_welcome_email
from app.utils.nats_client import subscribe_to_subject

logger = get_logger(__name__)


async def handle_user_registered(message: str):
    """Handle user registration event - send OTP email (legacy format)"""
    try:
        if message.startswith("New user registered: "):
            email = message.replace("New user registered: ", "")

            otp = "".join(random.choices(string.digits, k=6))

            from app.api.auth import otp_store

            otp_store[email] = otp

            await send_otp_email(email, otp)

    except Exception as e:
        logger.error("Error sending OTP email: %s", e, exc_info=True)


async def handle_user_registered_otp(message: str):
    """Handle user.registered_otp event - send OTP email asynchronously (new format)"""
    receive_time = datetime.now().timestamp()
    logger.debug(
        "[%s] NATS worker received user.registered_otp message: %s",
        receive_time,
        message,
    )
    try:
        message_data = json.loads(message)
        email = message_data.get("email")
        otp = message_data.get("otp")

        if not email or not otp:
            logger.error("Missing required fields in user.registered_otp message")
            return

        logger.debug("[%s] Sending OTP email to %s", datetime.now().timestamp(), email)
        result = await send_otp_email(email, otp)
        if result:
            logger.debug(
                "[%s] OTP email sent successfully to %s",
                datetime.now().timestamp(),
                email,
            )
        else:
            logger.error("[%s] OTP email failed to send to %s", datetime.now().timestamp(), email)

    except json.JSONDecodeError as e:
        logger.error("Failed to parse user.registered_otp message: %s", e, exc_info=True)
    except Exception as e:
        logger.error("Error sending OTP email: %s", e, exc_info=True)


async def handle_user_verified(message: str):
    """Handle user verification event - send welcome email for account verification only"""
    try:
        message_data = json.loads(message)
        email = message_data.get("email")
        is_account_verification = message_data.get("is_account_verification", False)
        user_full_name = message_data.get("user_full_name")

        if is_account_verification and email and user_full_name:
            await send_welcome_email(
                to_email=email,
                username=user_full_name,
                login_url=f"{settings.frontend_url}/login",
            )
        else:
            logger.debug(
                "%s - Skipping welcome email (not account verification or missing data)",
                email,
            )

    except json.JSONDecodeError:
        if message.startswith("OTP verified for: "):
            email = message.replace("OTP verified for: ", "")
            username = email.split("@")[0]
            await send_welcome_email(
                to_email=email,
                username=username,
                login_url=f"{settings.frontend_url}/login",
            )

    except Exception as e:
        logger.error("Error sending welcome email: %s", e, exc_info=True)


async def handle_forgot_password_otp(message: str):
    """Handle user.forgot_password_otp event - send password reset email (new format)"""
    try:
        message_data = json.loads(message)
        email = message_data.get("email")
        otp = message_data.get("otp")

        if not email or not otp:
            return

        await send_password_reset_email(email, otp)

    except json.JSONDecodeError as e:
        logger.error("Failed to parse user.forgot_password_otp message: %s", e, exc_info=True)
    except Exception as e:
        logger.error("Error sending password reset email: %s", e, exc_info=True)


async def handle_forgot_password(message: str):
    """Handle forgot password event - send password reset email (legacy format)"""
    try:
        if message.startswith("Password reset requested for: "):
            email = message.replace("Password reset requested for: ", "")

            from app.api.auth import otp_store

            otp = otp_store.get(email, "")

            if otp:
                await send_password_reset_email(email, otp)

    except Exception as e:
        logger.error("Error sending password reset email: %s", e, exc_info=True)


async def register_auth_handlers():
    """
    Register all authentication event handlers with NATS.

    Subscribes to all user-related subjects with high concurrency
    for fast email delivery.
    """
    EMAIL_CONCURRENCY = 20

    await subscribe_to_subject("user.registered", handle_user_registered, max_concurrent=EMAIL_CONCURRENCY)
    await subscribe_to_subject(
        "user.registered_otp",
        handle_user_registered_otp,
        max_concurrent=EMAIL_CONCURRENCY,
    )
    await subscribe_to_subject("user.otp_verified", handle_user_verified, max_concurrent=EMAIL_CONCURRENCY)
    await subscribe_to_subject("user.forgot_password", handle_forgot_password, max_concurrent=EMAIL_CONCURRENCY)
    await subscribe_to_subject(
        "user.forgot_password_otp",
        handle_forgot_password_otp,
        max_concurrent=EMAIL_CONCURRENCY,
    )


__all__ = [
    "handle_user_registered",
    "handle_user_registered_otp",
    "handle_user_verified",
    "handle_forgot_password_otp",
    "handle_forgot_password",
    "register_auth_handlers",
]
