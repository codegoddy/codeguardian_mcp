"""
Standardized API response models
"""

from typing import Any, Dict, Generic, Optional, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class ErrorDetail(BaseModel):
    """Error detail structure"""

    code: str
    message: str
    details: Optional[Dict[str, Any]] = None


class APIResponse(BaseModel, Generic[T]):
    """Standardized API response format"""

    success: bool
    data: Optional[T] = None
    error: Optional[ErrorDetail] = None
    message: Optional[str] = None


class SuccessResponse(BaseModel, Generic[T]):
    """Success response wrapper"""

    success: bool = True
    data: T
    message: Optional[str] = None


class ErrorResponse(BaseModel):
    """Error response wrapper"""

    success: bool = False
    error: ErrorDetail


class PaginatedResponse(BaseModel, Generic[T]):
    """Paginated response wrapper"""

    success: bool = True
    data: list[T]
    pagination: Dict[str, Any]
    message: Optional[str] = None


def success_response(data: Any, message: Optional[str] = None) -> Dict[str, Any]:
    """Create a success response"""
    return {"success": True, "data": data, "message": message}


def error_response(code: str, message: str, details: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Create an error response"""
    return {
        "success": False,
        "error": {"code": code, "message": message, "details": details or {}},
    }


def paginated_response(data: list, page: int, page_size: int, total: int, message: Optional[str] = None) -> Dict[str, Any]:
    """Create a paginated response"""
    return {
        "success": True,
        "data": data,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size,
        },
        "message": message,
    }
