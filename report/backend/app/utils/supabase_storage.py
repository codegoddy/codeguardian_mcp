"""
Supabase Storage client for profile images and file storage
"""

import os
from typing import Any, Dict, Optional

from supabase import Client, create_client

from app.common.errors import StorageError
from app.core.config import settings
from app.core.logging_config import get_logger

logger = get_logger(__name__)

# Global Supabase client
_supabase_client: Optional[Client] = None


def init_supabase_storage() -> Client:
    """Initialize Supabase storage client"""
    global _supabase_client

    try:
        logger.debug("Initializing Supabase storage client")

        supabase_url = settings.supabase_url
        supabase_service_key = settings.supabase_service_role_key

        if not supabase_url or not supabase_service_key:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for storage operations")

        _supabase_client = create_client(supabase_url, supabase_service_key)
        logger.info("Supabase storage client initialized successfully")
        return _supabase_client
    except Exception as e:
        logger.error("Failed to initialize Supabase storage client: %s", e, exc_info=True)
        raise


def get_supabase_client() -> Client:
    """Get or initialize Supabase client"""
    if _supabase_client is None:
        return init_supabase_storage()
    return _supabase_client


async def upload_image_to_bucket(
    file_bytes: bytes,
    bucket_name: str,
    file_path: str,
    content_type: str = "image/jpeg",
    upsert: bool = True,
) -> Dict[str, Any]:
    """
    Upload an image to Supabase Storage bucket

    Args:
        file_bytes: File content as bytes
        bucket_name: Name of the Supabase storage bucket
        file_path: Path within the bucket (e.g., "user_123/profile.jpg")
        content_type: MIME type of the file
        upsert: Whether to overwrite existing file

    Returns:
        Dict containing upload result with 'url' and 'path'

    Raises:
        StorageError: If upload fails
    """
    try:
        client = get_supabase_client()

        logger.debug(f"Uploading image to bucket '{bucket_name}' at path '{file_path}'")
        logger.debug(f"File size: {len(file_bytes)} bytes, Content-Type: {content_type}")

        # Upload file to bucket
        result = client.storage.from_(bucket_name).upload(
            path=file_path,
            file=file_bytes,
            file_options={"content-type": content_type, "upsert": str(upsert).lower()},
        )

        if hasattr(result, "error") and result.error:
            raise StorageError(f"Failed to upload image: {result.error}")

        # Get a signed URL that works for both public and private buckets
        # Signed URL is valid for 1 year (365 days)
        image_url = None
        try:
            signed_url_response = client.storage.from_(bucket_name).create_signed_url(
                path=file_path, expires_in=31536000  # 1 year in seconds
            )
            logger.debug(f"Signed URL response: {signed_url_response}")

            if signed_url_response and isinstance(signed_url_response, dict):
                image_url = signed_url_response.get("signedURL")
                # Ensure it's a full URL
                if image_url and not image_url.startswith("http"):
                    # If relative URL, prepend Supabase URL
                    image_url = f"{settings.supabase_url}{image_url}"

            if not image_url:
                raise StorageError("Signed URL was empty")

            logger.info(f"Signed URL created successfully: {image_url[:100]}...")
        except Exception as e:
            logger.warning(f"Failed to create signed URL: {e}")
            # Fallback to public URL for backwards compatibility
            image_url = client.storage.from_(bucket_name).get_public_url(file_path)
            logger.info(f"Using public URL instead: {image_url}")

        return {
            "url": image_url,
            "path": file_path,
            "bucket": bucket_name,
            "content_type": content_type,
            "size": len(file_bytes),
        }
    except Exception as e:
        logger.error(f"Supabase storage upload failed: {e}", exc_info=True)
        raise StorageError(f"Failed to upload image: {str(e)}")


async def delete_file_from_bucket(bucket_name: str, file_path: str) -> bool:
    """
    Delete a file from Supabase Storage bucket

    Args:
        bucket_name: Name of the Supabase storage bucket
        file_path: Path within the bucket

    Returns:
        True if deletion was successful

    Raises:
        StorageError: If deletion fails
    """
    try:
        client = get_supabase_client()

        logger.debug(f"Deleting file from bucket '{bucket_name}' at path '{file_path}'")

        result = client.storage.from_(bucket_name).remove([file_path])

        if hasattr(result, "error") and result.error:
            raise StorageError(f"Failed to delete file: {result.error}")

        logger.info(f"File deleted successfully: {file_path}")
        return True
    except Exception as e:
        logger.error(f"Supabase storage deletion failed: {e}", exc_info=True)
        raise StorageError(f"Failed to delete file: {str(e)}")


async def get_file_url(bucket_name: str, file_path: str, expires_in: Optional[int] = None) -> str:
    """
    Get the URL for a file in Supabase Storage

    Args:
        bucket_name: Name of the Supabase storage bucket
        file_path: Path within the bucket
        expires_in: Optional expiration time in seconds for signed URLs

    Returns:
        Public or signed URL of the file

    Raises:
        StorageError: If URL generation fails
    """
    try:
        client = get_supabase_client()

        if expires_in:
            # Generate signed URL with expiration
            result = client.storage.from_(bucket_name).create_signed_url(path=file_path, expires_in=expires_in)
            if hasattr(result, "error") and result.error:
                raise StorageError(f"Failed to create signed URL: {result.error}")
            return result.get("signedURL", "")
        else:
            # Get public URL
            return client.storage.from_(bucket_name).get_public_url(file_path)
    except Exception as e:
        logger.error(f"Failed to get file URL: {e}", exc_info=True)
        raise StorageError(f"Failed to get file URL: {str(e)}")


async def upload_file_to_bucket(
    file_bytes: bytes,
    bucket_name: str,
    file_path: str,
    content_type: str = "application/pdf",
    upsert: bool = True,
) -> Dict[str, Any]:
    """
    Upload a file to Supabase Storage bucket

    Args:
        file_bytes: File content as bytes
        bucket_name: Name of the Supabase storage bucket
        file_path: Path within the bucket (e.g., "contracts/contract_123.pdf")
        content_type: MIME type of the file
        upsert: Whether to overwrite existing file

    Returns:
        Dict containing upload result with 'url' and 'path'

    Raises:
        StorageError: If upload fails
    """
    try:
        client = get_supabase_client()

        logger.debug(f"Uploading file to bucket '{bucket_name}' at path '{file_path}'")
        logger.debug(f"File size: {len(file_bytes)} bytes, Content-Type: {content_type}")

        # Upload file to bucket
        result = client.storage.from_(bucket_name).upload(
            path=file_path,
            file=file_bytes,
            file_options={"content-type": content_type, "upsert": str(upsert).lower()},
        )

        if hasattr(result, "error") and result.error:
            raise StorageError(f"Failed to upload file: {result.error}")

        # Get a signed URL that works for both public and private buckets
        # Signed URL is valid for 1 year (365 days)
        file_url = None
        try:
            signed_url_response = client.storage.from_(bucket_name).create_signed_url(
                path=file_path, expires_in=31536000  # 1 year in seconds
            )
            logger.debug(f"Signed URL response: {signed_url_response}")

            if signed_url_response and isinstance(signed_url_response, dict):
                file_url = signed_url_response.get("signedURL")
                # Ensure it's a full URL
                if file_url and not file_url.startswith("http"):
                    # If relative URL, prepend Supabase URL
                    file_url = f"{settings.supabase_url}{file_url}"

            if not file_url:
                raise StorageError("Signed URL was empty")

            logger.info(f"Signed URL created successfully: {file_url[:100]}...")
        except Exception as e:
            logger.warning(f"Failed to create signed URL: {e}")
            # Fallback to public URL for backwards compatibility
            file_url = client.storage.from_(bucket_name).get_public_url(file_path)
            logger.info(f"Using public URL instead: {file_url}")

        return {
            "url": file_url,
            "path": file_path,
            "bucket": bucket_name,
            "content_type": content_type,
            "size": len(file_bytes),
        }
    except Exception as e:
        logger.error(f"Supabase storage upload failed: {e}", exc_info=True)
        raise StorageError(f"Failed to upload file: {str(e)}")


async def upload_profile_image(
    user_id: str, file_bytes: bytes, filename: str, content_type: str = "image/jpeg"
) -> Dict[str, Any]:
    """
    Upload a profile image to the profile-images bucket

    Args:
        user_id: The user's ID
        file_bytes: File content as bytes
        filename: Original filename
        content_type: MIME type of the file

    Returns:
        Dict containing upload result with 'url' and 'path'
    """
    bucket_name = settings.supabase_profile_images_bucket
    file_path = f"user_{user_id}/profile_{filename}"

    return await upload_image_to_bucket(
        file_bytes=file_bytes,
        bucket_name=bucket_name,
        file_path=file_path,
        content_type=content_type,
        upsert=True,
    )


async def upload_contract_pdf(project_id: str, contract_id: str, pdf_bytes: bytes) -> Dict[str, Any]:
    """
    Upload a contract PDF to the contracts bucket

    Args:
        project_id: The project ID
        contract_id: The contract signature ID
        pdf_bytes: PDF content as bytes

    Returns:
        Dict containing upload result with 'url' and 'path'
    """
    bucket_name = settings.supabase_contracts_bucket
    file_path = f"project_{project_id}/contract_{contract_id}.pdf"

    return await upload_file_to_bucket(
        file_bytes=pdf_bytes,
        bucket_name=bucket_name,
        file_path=file_path,
        content_type="application/pdf",
        upsert=True,
    )


async def delete_profile_image(user_id: str, filename: str) -> bool:
    """
    Delete a profile image from the profile-images bucket

    Args:
        user_id: The user's ID
        filename: The filename of the profile image

    Returns:
        True if deletion was successful
    """
    bucket_name = settings.supabase_profile_images_bucket
    file_path = f"user_{user_id}/profile_{filename}"

    return await delete_file_from_bucket(bucket_name=bucket_name, file_path=file_path)


def ensure_bucket_exists(bucket_name: str, public: bool = True) -> bool:
    """
    Ensure a storage bucket exists, create it if it doesn't

    Args:
        bucket_name: Name of the bucket to ensure exists
        public: Whether the bucket should be public

    Returns:
        True if bucket exists or was created successfully
    """
    try:
        client = get_supabase_client()

        # Try to get bucket info
        try:
            bucket = client.storage.get_bucket(bucket_name)
            if bucket:
                logger.debug(f"Bucket '{bucket_name}' already exists")
                return True
        except Exception:
            # Bucket doesn't exist, create it
            pass

        # Create bucket
        logger.info(f"Creating bucket '{bucket_name}' (public={public})")
        result = client.storage.create_bucket(bucket_name, options={"public": public})

        if hasattr(result, "error") and result.error:
            logger.error(f"Failed to create bucket: {result.error}")
            return False

        logger.info(f"Bucket '{bucket_name}' created successfully")
        return True
    except Exception as e:
        logger.error(f"Failed to ensure bucket exists: {e}", exc_info=True)
        return False
