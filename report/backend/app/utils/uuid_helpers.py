"""
UUID Helper Utilities

Provides utility functions for working with UUIDs across the application.
"""

import uuid
from typing import Optional, Union
from uuid import UUID


def is_valid_uuid(value: Union[str, UUID], version: Optional[int] = None) -> bool:
    """
    Validate if a value is a valid UUID.

    Args:
        value: String or UUID object to validate
        version: Optional UUID version to check (1, 3, 4, or 5)

    Returns:
        True if valid UUID, False otherwise

    Examples:
        >>> is_valid_uuid("123e4567-e89b-12d3-a456-426614174000")
        True
        >>> is_valid_uuid("invalid-uuid")
        False
        >>> is_valid_uuid("123e4567-e89b-12d3-a456-426614174000", version=4)
        True
    """
    try:
        uuid_obj = UUID(str(value))

        # If version is specified, check it matches
        if version is not None and uuid_obj.version != version:
            return False

        return True
    except (ValueError, AttributeError, TypeError):
        return False


def str_to_uuid(value: Union[str, UUID]) -> Optional[UUID]:
    """
    Convert a string to UUID object, returns None if invalid.

    Args:
        value: String representation of UUID or UUID object

    Returns:
        UUID object or None if conversion fails

    Examples:
        >>> str_to_uuid("123e4567-e89b-12d3-a456-426614174000")
        UUID('123e4567-e89b-12d3-a456-426614174000')
        >>> str_to_uuid("invalid")
        None
    """
    if isinstance(value, UUID):
        return value

    try:
        return UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        return None


def generate_test_uuid(seed: int) -> UUID:
    """
    Generate a deterministic UUID for testing purposes.

    This is useful for creating consistent test data and fixtures.

    Args:
        seed: Integer seed (0-999999999999)

    Returns:
        UUID object with deterministic value

    Examples:
        >>> generate_test_uuid(1)
        UUID('00000000-0000-0000-0000-000000000001')
        >>> generate_test_uuid(42)
        UUID('00000000-0000-0000-0000-000000000042')
    """
    if seed < 0 or seed > 999999999999:
        raise ValueError("Seed must be between 0 and 999999999999")

    return UUID(f"00000000-0000-0000-0000-{seed:012d}")


def uuid_to_short_id(value: UUID, length: int = 8) -> str:
    """
    Convert UUID to a shorter, URL-friendly string.

    Useful for user-facing URLs where full UUID is too long.

    Args:
        value: UUID object
        length: Length of short ID (default 8)

    Returns:
        Short string representation

    Examples:
        >>> uuid_to_short_id(UUID("123e4567-e89b-12d3-a456-426614174000"))
        '123e4567'
    """
    return str(value).replace("-", "")[:length]


def bulk_validate_uuids(values: list[Union[str, UUID]]) -> tuple[list[UUID], list[str]]:
    """
    Validate a list of UUID values and return valid/invalid separately.

    Args:
        values: List of string or UUID values to validate

    Returns:
        Tuple of (valid_uuids, invalid_values)

    Examples:
        >>> valid, invalid = bulk_validate_uuids([
        ...     "123e4567-e89b-12d3-a456-426614174000",
        ...     "invalid",
        ...     UUID("987fcdeb-51a2-43d7-8abc-123456789012")
        ... ])
        >>> len(valid)
        2
        >>> len(invalid)
        1
    """
    valid_uuids = []
    invalid_values = []

    for value in values:
        uuid_obj = str_to_uuid(value)
        if uuid_obj:
            valid_uuids.append(uuid_obj)
        else:
            invalid_values.append(str(value))

    return valid_uuids, invalid_values


def generate_uuid() -> UUID:
    """
    Generate a new random UUID (v4).

    This is a convenience wrapper around uuid.uuid4() for consistency.

    Returns:
        New UUID object

    Examples:
        >>> new_id = generate_uuid()
        >>> isinstance(new_id, UUID)
        True
    """
    return uuid.uuid4()


# Common test UUIDs for consistent testing
TEST_USER_UUID = generate_test_uuid(1)
TEST_CLIENT_UUID = generate_test_uuid(2)
TEST_PROJECT_UUID = generate_test_uuid(3)
TEST_MILESTONE_UUID = generate_test_uuid(4)
TEST_DELIVERABLE_UUID = generate_test_uuid(5)
TEST_INVOICE_UUID = generate_test_uuid(6)
TEST_CONTRACT_UUID = generate_test_uuid(7)
TEST_TIME_ENTRY_UUID = generate_test_uuid(8)

# Example mapping for migration reference
EXAMPLE_UUID_MAPPING = {
    "old_int_id": 42,
    "new_uuid": "123e4567-e89b-12d3-a456-426614174000",
    "note": "This is an example of ID mapping during migration",
}
