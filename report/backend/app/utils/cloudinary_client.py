"""
Cloudinary client for image and PDF storage
"""

from typing import Any, Dict, Optional

import cloudinary
import cloudinary.api
import cloudinary.uploader

from app.common.errors import CloudinaryError
from app.core.config import settings
from app.core.logging_config import get_logger

logger = get_logger(__name__)


# Initialize Cloudinary configuration
def init_cloudinary():
    """Initialize Cloudinary with credentials from settings"""
    try:
        logger.debug("Initializing Cloudinary with:")
        logger.debug("Cloud Name: %s", settings.cloudinary_cloud_name)
        if settings.cloudinary_api_key:
            logger.debug("API Key: %s...", settings.cloudinary_api_key[:10])
        else:
            logger.debug("API Key: None")
        if settings.cloudinary_api_secret:
            logger.debug("API Secret: **********...")
        else:
            logger.debug("API Secret: None")

        if not settings.cloudinary_cloud_name or not settings.cloudinary_api_key or not settings.cloudinary_api_secret:
            raise ValueError("Cloudinary credentials are missing in environment variables")

        cloudinary.config(
            cloud_name=settings.cloudinary_cloud_name,
            api_key=settings.cloudinary_api_key,
            api_secret=settings.cloudinary_api_secret,
            secure=True,
        )
        logger.info("Cloudinary initialized successfully")
    except Exception as e:
        logger.error("Failed to initialize Cloudinary: %s", e, exc_info=True)


async def upload_image(
    file_path: str,
    folder: str = "profile_images",
    public_id: Optional[str] = None,
    overwrite: bool = True,
) -> Dict[str, Any]:
    """
    Upload an image to Cloudinary

    Args:
        file_path: Path to the image file or file object
        folder: Cloudinary folder to store the image
        public_id: Optional custom public ID for the image
        overwrite: Whether to overwrite existing image with same public_id

    Returns:
        Dict containing upload result with 'url' and 'public_id'

    Raises:
        CloudinaryError: If upload fails
    """
    try:
        upload_options = {
            "folder": folder,
            "resource_type": "image",
            "overwrite": overwrite,
            "invalidate": True,  # Invalidate CDN cache
            "timeout": 60,
        }

        if public_id:
            upload_options["public_id"] = public_id

        result = cloudinary.uploader.upload(file_path, **upload_options)

        return {
            "url": result.get("secure_url"),
            "public_id": result.get("public_id"),
            "width": result.get("width"),
            "height": result.get("height"),
            "format": result.get("format"),
            "resource_type": result.get("resource_type"),
        }
    except Exception as e:
        raise CloudinaryError(f"Failed to upload image: {str(e)}")


async def upload_pdf(
    file_path: str,
    folder: str = "documents",
    public_id: Optional[str] = None,
    overwrite: bool = True,
) -> Dict[str, Any]:
    """
    Upload a PDF to Cloudinary

    Args:
        file_path: Path to the PDF file or file object
        folder: Cloudinary folder to store the PDF
        public_id: Optional custom public ID for the PDF
        overwrite: Whether to overwrite existing PDF with same public_id

    Returns:
        Dict containing upload result with 'url' and 'public_id'

    Raises:
        CloudinaryError: If upload fails
    """
    try:
        upload_options = {
            "folder": folder,
            "resource_type": "raw",  # Use 'raw' for PDFs
            "overwrite": overwrite,
            "invalidate": True,
            "timeout": 60,
        }

        if public_id:
            upload_options["public_id"] = public_id

        result = cloudinary.uploader.upload(file_path, **upload_options)

        return {
            "url": result.get("secure_url"),
            "public_id": result.get("public_id"),
            "format": result.get("format"),
            "resource_type": result.get("resource_type"),
            "bytes": result.get("bytes"),
        }
    except Exception as e:
        raise CloudinaryError(f"Failed to upload PDF: {str(e)}")


async def delete_file(public_id: str, resource_type: str = "image") -> bool:
    """
    Delete a file from Cloudinary

    Args:
        public_id: The public ID of the file to delete
        resource_type: Type of resource ('image', 'raw', 'video')

    Returns:
        True if deletion was successful

    Raises:
        CloudinaryError: If deletion fails
    """
    try:
        result = cloudinary.uploader.destroy(public_id, resource_type=resource_type, invalidate=True)

        if result.get("result") == "ok":
            return True
        else:
            raise CloudinaryError(f"Failed to delete file: {result.get('result')}")
    except Exception as e:
        raise CloudinaryError(f"Failed to delete file: {str(e)}")


async def get_file_url(public_id: str, resource_type: str = "image") -> str:
    """
    Get the secure URL for a file

    Args:
        public_id: The public ID of the file
        resource_type: Type of resource ('image', 'raw', 'video')

    Returns:
        Secure URL of the file
    """
    try:
        if resource_type == "image":
            return cloudinary.CloudinaryImage(public_id).build_url(secure=True)
        else:
            # For raw files (PDFs, etc.)
            return cloudinary.utils.cloudinary_url(public_id, resource_type=resource_type, secure=True)[0]
    except Exception as e:
        raise CloudinaryError(f"Failed to get file URL: {str(e)}")


async def upload_file(
    file_path: str,
    folder: str = "uploads",
    resource_type: str = "auto",
    public_id: Optional[str] = None,
    overwrite: bool = True,
) -> Dict[str, Any]:
    """
    Upload a file to Cloudinary (accepts file path or bytes)

    Args:
        file_path: Path to the file or file content as bytes
        folder: Cloudinary folder to store the file
        resource_type: Type of resource ('image', 'raw', 'auto')
        public_id: Optional custom public ID for the file
        overwrite: Whether to overwrite existing file with same public_id

    Returns:
        Dict containing upload result with 'url' and 'public_id'

    Raises:
        CloudinaryError: If upload fails
    """
    try:
        upload_options = {
            "folder": folder,
            "resource_type": resource_type,
            "overwrite": overwrite,
            "invalidate": True,  # Invalidate CDN cache
        }

        if public_id:
            upload_options["public_id"] = public_id

        result = cloudinary.uploader.upload(file_path, **upload_options)

        return {
            "url": result.get("secure_url"),
            "public_id": result.get("public_id"),
            "format": result.get("format"),
            "resource_type": result.get("resource_type"),
            "bytes": result.get("bytes"),
        }
    except Exception as e:
        raise CloudinaryError(f"Failed to upload file: {str(e)}")


async def upload_file_from_bytes(
    file_bytes: bytes,
    filename: str,
    folder: str = "uploads",
    resource_type: str = "auto",
    public_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Upload a file from bytes (useful for file uploads from forms)

    Args:
        file_bytes: File content as bytes
        filename: Original filename
        folder: Cloudinary folder to store the file
        resource_type: Type of resource ('image', 'raw', 'auto')
        public_id: Optional custom public ID

    Returns:
        Dict containing upload result with 'url' and 'public_id'

    Raises:
        CloudinaryError: If upload fails
    """
    try:
        logger.debug("Uploading file from bytes:")
        logger.debug("Folder: %s", folder)
        logger.debug("Resource type: %s", resource_type)
        logger.debug("Public ID: %s", public_id)
        logger.debug("File size: %s bytes", len(file_bytes))

        upload_options = {
            "folder": folder,
            "resource_type": resource_type,
            "invalidate": True,
            "overwrite": True,  # Allow overwriting existing files
        }

        if public_id:
            upload_options["public_id"] = public_id

        # Note: We don't use upload_preset for signed uploads (when API key/secret are provided)
        # Upload presets are only needed for unsigned uploads from the client-side

        logger.debug("Upload options: %s", upload_options)

        # Upload from bytes
        result = cloudinary.uploader.upload(file_bytes, **upload_options)
        logger.info("Upload successful: %s", result.get("secure_url"))

        return {
            "url": result.get("secure_url"),
            "public_id": result.get("public_id"),
            "format": result.get("format"),
            "resource_type": result.get("resource_type"),
            "bytes": result.get("bytes"),
        }
    except Exception as e:
        logger.error("Cloudinary upload failed: %s", e, exc_info=True)
        raise CloudinaryError(f"Failed to upload file from bytes: {str(e)}")


# Transformation helpers for images
def get_thumbnail_url(public_id: str, width: int = 200, height: int = 200) -> str:
    """Get a thumbnail URL for an image"""
    return cloudinary.CloudinaryImage(public_id).build_url(
        width=width, height=height, crop="fill", gravity="face", secure=True
    )


def get_optimized_url(public_id: str, width: Optional[int] = None) -> str:
    """Get an optimized URL for an image"""
    options = {"quality": "auto", "fetch_format": "auto", "secure": True}

    if width:
        options["width"] = width
        options["crop"] = "scale"

    return cloudinary.CloudinaryImage(public_id).build_url(**options)
