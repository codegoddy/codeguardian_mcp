import json
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import decode_access_token, get_current_user
from app.core.logging_config import get_logger
from app.db.database import get_db
from app.models.user import User as UserModel
from app.schemas.settings import UserSettingsResponse, UserSettingsUpdate
from app.services.activity_service import create_activity
from app.utils.redis_client import STATIC_DATA, RedisCache
from app.utils.supabase_storage import delete_profile_image as delete_supabase_profile_image
from app.utils.supabase_storage import upload_profile_image

logger = get_logger(__name__)
router = APIRouter()


@router.get("/settings", response_model=UserSettingsResponse)
async def get_settings(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get user settings with Redis caching"""
    # Try to get from cache first
    cached_settings = await RedisCache.get_user_settings(current_user.id)
    if cached_settings:
        return UserSettingsResponse(**cached_settings)

    # Check if user_settings record exists
    from app.models.user import UserSettings

    stmt = select(UserSettings).where(UserSettings.user_id == current_user.id)
    result = await db.execute(stmt)
    settings = result.scalar_one_or_none()

    # If no settings exist, create default settings
    if not settings:
        settings = UserSettings(
            user_id=current_user.id,
            default_currency="USD",
            timezone="UTC",
            date_format="YYYY-MM-DD",
            time_format="24h",
            email_notifications=True,
            auto_pause_notifications=True,
            contract_signed_notifications=True,
            payment_received_notifications=True,
        )
        db.add(settings)
        await db.commit()
        await db.refresh(settings)

    response_data = UserSettingsResponse(
        id=settings.id,
        user_id=settings.user_id,
        profile_image_url=settings.profile_image_url,
        bio=settings.bio,
        default_currency=settings.default_currency,
        timezone=settings.timezone,
        date_format=settings.date_format,
        time_format=settings.time_format,
        email_notifications=settings.email_notifications,
        auto_pause_notifications=settings.auto_pause_notifications,
        contract_signed_notifications=settings.contract_signed_notifications,
        payment_received_notifications=settings.payment_received_notifications,
        created_at=settings.created_at,
        updated_at=settings.updated_at,
        # Include user profile data
        full_name=current_user.full_name,
        email=current_user.email,
        provider=current_user.provider,
        is_oauth_user=current_user.is_oauth_user,
        can_change_password=current_user.can_login_with_password or not current_user.is_oauth_user,
    )

    # Cache the settings
    await RedisCache.set_user_settings(current_user.id, response_data.model_dump())

    return response_data


@router.put("/settings", response_model=UserSettingsResponse)
async def update_settings(
    request: Request,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update user settings and invalidate cache"""
    import json

    from app.models.user import UserSettings

    # Get raw request body for debugging BEFORE Pydantic validation
    body = await request.body()
    body_str = body.decode("utf-8")
    logger.debug("Raw request body: %s", body_str)

    try:
        body_json = json.loads(body_str)
        logger.debug("Parsed JSON: %s", body_json)
    except Exception as e:
        logger.debug("Failed to parse JSON: %s", e)

    # Now validate with Pydantic
    try:
        settings_update = UserSettingsUpdate(**body_json)
        logger.debug("Validation successful!")
        logger.debug("Validated data: %s", settings_update.model_dump(exclude_unset=True))
    except ValidationError as e:
        logger.debug("Pydantic validation error: %s", e)
        logger.debug("Validation errors detail: %s", e.errors())
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e.errors())

    stmt = select(UserSettings).where(UserSettings.user_id == current_user.id)
    result = await db.execute(stmt)
    settings = result.scalar_one_or_none()

    # If no settings exist, create them
    if not settings:
        settings = UserSettings(user_id=current_user.id)
        db.add(settings)

    # Update only provided fields
    update_data = settings_update.model_dump(exclude_unset=True)
    logger.debug("Final update_data: %s", update_data)

    for field, value in update_data.items():
        logger.debug("Setting %s = %s", field, value)
        setattr(settings, field, value)

    await db.commit()
    await db.refresh(settings)

    response_data = UserSettingsResponse(
        id=settings.id,
        user_id=settings.user_id,
        profile_image_url=settings.profile_image_url,
        bio=settings.bio,
        default_currency=settings.default_currency,
        timezone=settings.timezone,
        date_format=settings.date_format,
        time_format=settings.time_format,
        email_notifications=settings.email_notifications,
        auto_pause_notifications=settings.auto_pause_notifications,
        contract_signed_notifications=settings.contract_signed_notifications,
        payment_received_notifications=settings.payment_received_notifications,
        created_at=settings.created_at,
        updated_at=settings.updated_at,
        # Include user profile data
        full_name=current_user.full_name,
        email=current_user.email,
        provider=current_user.provider,
        is_oauth_user=current_user.is_oauth_user,
        can_change_password=current_user.can_login_with_password or not current_user.is_oauth_user,
    )

    # Update cache (SET overwrites, no need to invalidate first)
    await RedisCache.set_user_settings(current_user.id, response_data.model_dump())

    # Log activity for settings update
    try:
        await create_activity(
            db=db,
            user_id=current_user.id,
            entity_type="settings",
            entity_id=settings.id,
            action="updated",
            title="Updated settings",
            description=None,
        )
    except Exception as e:
        logger.warning("Failed to log settings update activity: %s", e)

    return response_data


@router.post("/settings/profile-image")
async def upload_profile_image_endpoint(
    image: UploadFile = File(...),
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload profile image to Supabase Storage"""
    from app.models.user import UserSettings

    try:
        logger.info(f"Profile image upload started - User: {current_user.id}, Filename: {image.filename if image else 'None'}")

        # Validate file
        if not image:
            logger.error("Profile image upload failed - No image file received")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No image file received")

        # Validate file type
        if not image.content_type:
            logger.warning(f"Profile image upload failed - No content type. Filename: {image.filename}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File must have a content type",
            )

        if not image.content_type.startswith("image/"):
            logger.warning(f"Profile image upload failed - Invalid content type: {image.content_type}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File must be an image, got content type: {image.content_type}",
            )

        # Read file content
        file_content = await image.read()

        if not file_content:
            logger.error("Profile image upload failed - Empty file content")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File is empty")

        logger.info(f"Profile image upload - File size: {len(file_content)} bytes")

        # Upload to Supabase Storage
        try:
            result = await upload_profile_image(
                user_id=str(current_user.id),
                file_bytes=file_content,
                filename=image.filename or "image.jpg",
                content_type=image.content_type,
            )
            image_url = result["url"]
            logger.info(f"Profile image uploaded to Supabase Storage: {image_url}")
        except Exception as e:
            logger.error(f"Supabase storage upload failed: {e}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to upload image: {str(e)}",
            )

        # Update user settings with new image URL
        stmt = select(UserSettings).where(UserSettings.user_id == current_user.id)
        result = await db.execute(stmt)
        user_settings = result.scalar_one_or_none()

        if not user_settings:
            user_settings = UserSettings(user_id=current_user.id)
            db.add(user_settings)

        user_settings.profile_image_url = image_url
        await db.commit()
        await db.refresh(user_settings)

        # Update cache immediately so the new image is visible right away
        try:
            from app.schemas.settings import UserSettingsResponse

            response_data = UserSettingsResponse(
                id=user_settings.id,
                user_id=user_settings.user_id,
                profile_image_url=user_settings.profile_image_url,
                bio=user_settings.bio,
                default_currency=user_settings.default_currency,
                timezone=user_settings.timezone,
                date_format=user_settings.date_format,
                time_format=user_settings.time_format,
                email_notifications=user_settings.email_notifications,
                auto_pause_notifications=user_settings.auto_pause_notifications,
                contract_signed_notifications=user_settings.contract_signed_notifications,
                payment_received_notifications=user_settings.payment_received_notifications,
                created_at=user_settings.created_at,
                updated_at=user_settings.updated_at,
                full_name=current_user.full_name,
                email=current_user.email,
                provider=current_user.provider,
                is_oauth_user=current_user.is_oauth_user,
                can_change_password=current_user.can_login_with_password or not current_user.is_oauth_user,
            )
            await RedisCache.set_user_settings(current_user.id, response_data.model_dump())
            logger.info(f"Cache updated for user {current_user.id} with new profile image")
        except Exception as e:
            logger.warning(f"Failed to update cache after profile image upload: {e}")

        # Log activity for profile image upload
        try:
            await create_activity(
                db=db,
                user_id=current_user.id,
                entity_type="settings",
                entity_id=user_settings.id,
                action="updated",
                title="Updated profile image",
                description=None,
            )
        except Exception as e:
            logger.warning("Failed to log profile image activity: %s", e)

        return {
            "message": "Profile image uploaded successfully",
            "profile_image_url": image_url,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Profile image upload failed with unexpected error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload profile image: {str(e)}",
        )


@router.delete("/settings/profile-image")
async def delete_profile_image(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete profile image from Supabase Storage"""
    from app.models.user import UserSettings

    stmt = select(UserSettings).where(UserSettings.user_id == current_user.id)
    result = await db.execute(stmt)
    user_settings = result.scalar_one_or_none()

    if not user_settings or not user_settings.profile_image_url:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No profile image found")

    # Extract filename from the stored URL
    try:
        from urllib.parse import urlparse

        parsed_url = urlparse(user_settings.profile_image_url)
        path_parts = parsed_url.path.split("/")
        # The filename should be the last part after the user folder
        if len(path_parts) >= 2:
            filename = path_parts[-1]
            if filename.startswith("profile_"):
                filename = filename[8:]  # Remove 'profile_' prefix
        else:
            filename = "image.jpg"
    except Exception:
        filename = "image.jpg"

    # Delete from Supabase Storage
    try:
        await delete_supabase_profile_image(user_id=str(current_user.id), filename=filename)
    except Exception as e:
        logger.error(f"Supabase storage deletion failed: {e}", exc_info=True)
        # Continue to delete the reference even if the file deletion fails
        pass

    # Update settings
    user_settings.profile_image_url = None
    await db.commit()

    # Cache will be updated on next fetch

    return {"message": "Profile image deleted successfully"}


# New endpoints for profile and security


@router.get("/settings/profile")
async def get_profile(current_user: UserModel = Depends(get_current_user)):
    """Get user profile information"""
    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "provider": current_user.provider,
        "is_oauth_user": current_user.is_oauth_user,
        "can_change_password": current_user.can_login_with_password or not current_user.is_oauth_user,
    }


@router.put("/settings/profile")
async def update_profile(
    full_name: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update user profile (name)"""
    from pydantic import BaseModel

    class ProfileUpdate(BaseModel):
        full_name: str

    # Update user's full name
    current_user.full_name = full_name
    await db.commit()
    await db.refresh(current_user)

    # Cache will be updated on next fetch (full_name is part of settings response)

    return {
        "message": "Profile updated successfully",
        "full_name": current_user.full_name,
    }


@router.post("/settings/change-password")
async def change_password(
    current_password: str,
    new_password: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Change user password"""
    from passlib.context import CryptContext
    from pydantic import BaseModel, validator

    class PasswordChange(BaseModel):
        current_password: str
        new_password: str

        @validator("new_password")
        def validate_password(cls, v):
            if len(v) < 8:
                raise ValueError("Password must be at least 8 characters long")
            return v

    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

    # Check if user is OAuth user
    if current_user.is_oauth_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot change password for OAuth users",
        )

    # Verify current password
    if not current_user.hashed_password or not pwd_context.verify(current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    # Validate new password
    if len(new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 8 characters long",
        )

    # Hash and update password
    current_user.hashed_password = pwd_context.hash(new_password)
    await db.commit()

    # Log activity for password change
    try:
        await create_activity(
            db=db,
            user_id=current_user.id,
            entity_type="security",
            entity_id=current_user.id,
            action="password_changed",
            title="Changed password",
            description=None,
        )
    except Exception as e:
        logger.warning("Failed to log password change activity: %s", e)

    return {"message": "Password changed successfully"}


@router.get("/settings/static-data")
async def get_static_data():
    """
    Get static data for settings page (currencies, timezones, formats, constraints)
    This data is cached with a long TTL (24 hours) as it rarely changes
    """
    # Try to get from cache first
    cached_data = await RedisCache.get_static_data("all")
    if cached_data:
        return cached_data

    # If not in cache, return from STATIC_DATA and cache it
    await RedisCache.set_static_data("all", STATIC_DATA)
    return STATIC_DATA
