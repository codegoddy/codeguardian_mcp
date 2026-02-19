"""API endpoint for CLI token generation."""

import hashlib
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.db.database import get_db
from app.models.cli_token import CLIToken
from app.models.user import User

router = APIRouter(prefix="/api/cli", tags=["cli"])


@router.post("/generate-token")
async def generate_cli_token(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Generate a new CLI API token for the current user."""

    # Generate a secure random token
    token = secrets.token_urlsafe(32)  # 32 bytes = 256 bits

    # Hash the token for storage
    token_hash = hashlib.sha256(token.encode()).hexdigest()

    # Store first 8 characters of actual token for display/verification
    token_preview = token[:8]

    # Create token record
    cli_token = CLIToken(
        user_id=current_user.id,
        token_hash=token_hash,
        token_preview=token_preview,
        name="DevHQ CLI",
        is_active=True,
    )

    db.add(cli_token)
    await db.commit()

    # Return the plain token (only time it's shown)
    return {
        "token": token,
        "token_preview": token_preview,
        "created_at": cli_token.created_at.isoformat(),
    }


@router.get("/tokens")
async def list_cli_tokens(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """List all CLI tokens for the current user."""
    from sqlalchemy import select

    result = await db.execute(select(CLIToken).where(CLIToken.user_id == current_user.id).order_by(CLIToken.created_at.desc()))

    tokens = result.scalars().all()

    return [
        {
            "id": str(token.id),
            "name": token.name,
            "is_active": token.is_active,
            "created_at": token.created_at.isoformat(),
            "last_used_at": (token.last_used_at.isoformat() if token.last_used_at else None),
            # Return first 8 characters of actual token for verification
            "token_preview": ((token.token_preview + "...") if token.token_preview else "********..."),
        }
        for token in tokens
    ]


@router.delete("/tokens/{token_id}")
async def delete_cli_token(
    token_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a CLI token."""
    from uuid import UUID

    from sqlalchemy import and_, select

    try:
        token_uuid = UUID(token_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid token ID")

    result = await db.execute(select(CLIToken).where(and_(CLIToken.id == token_uuid, CLIToken.user_id == current_user.id)))

    token = result.scalar_one_or_none()

    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    await db.delete(token)
    await db.commit()

    return {"message": "Token deleted successfully"}


@router.post("/validate-token")
async def validate_cli_token(token: str, db: AsyncSession = Depends(get_db)):
    """Validate a CLI token and return user info."""
    from sqlalchemy import and_, select

    # Hash the provided token
    token_hash = hashlib.sha256(token.encode()).hexdigest()

    # Find the token
    result = await db.execute(
        select(CLIToken, User)
        .join(User, CLIToken.user_id == User.id)
        .where(and_(CLIToken.token_hash == token_hash, CLIToken.is_active == True))
    )

    row = result.first()

    if not row:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    cli_token, user = row

    # Update last used timestamp
    cli_token.last_used_at = datetime.now(timezone.utc)
    await db.commit()

    return {
        "valid": True,
        "user_id": str(user.id),
        "user_email": user.email,
        "user_name": user.full_name,
    }
