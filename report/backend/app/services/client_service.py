"""
Client Service - Business logic for client management

This service handles all client-related operations including:
- Creating clients
- Updating client information
- Managing client relationships
- Activity logging
"""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.client import Client
from app.observability.metrics import track_project_created
from app.observability.tracing import trace_service_call
from app.schemas.client import ClientCreate, ClientUpdate
from app.services.activity_service import create_activity


@trace_service_call("client_service", "create_client")
async def create_client(client_data: ClientCreate, user_id: UUID, db: AsyncSession) -> Client:
    """
    Create a new client.

    Args:
        client_data: Client creation data
        user_id: ID of the user creating the client
        db: Database session

    Returns:
        Created client object
    """
    # Create client object
    new_client = Client(
        name=client_data.name,
        email=client_data.email,
        company=client_data.company,
        phone=client_data.phone,
        address=client_data.address,
        change_request_rate=client_data.change_request_rate,
        user_id=user_id,
    )

    # Add to database
    db.add(new_client)
    await db.commit()
    await db.refresh(new_client)

    # Log activity
    await create_activity(
        db=db,
        user_id=user_id,
        action="created",
        entity_type="client",
        entity_id=new_client.id,
        details=f"Created client: {new_client.name}",
    )

    return new_client


@trace_service_call("client_service", "update_client")
async def update_client(client_id: UUID, client_data: ClientUpdate, user_id: UUID, db: AsyncSession) -> Client:
    """
    Update an existing client.

    Args:
        client_id: ID of the client to update
        client_data: Updated client data
        user_id: ID of the user updating the client
        db: Database session

    Returns:
        Updated client object

    Raises:
        ValueError: If client not found or not owned by user
    """
    # Get client
    result = await db.execute(select(Client).where(and_(Client.id == client_id, Client.user_id == user_id)))
    client = result.scalar_one_or_none()

    if not client:
        raise ValueError("Client not found")

    # Update fields
    update_data = client_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(client, field, value)

    # Save to database
    await db.commit()
    await db.refresh(client)

    # Log activity
    await create_activity(
        db=db,
        user_id=user_id,
        action="updated",
        entity_type="client",
        entity_id=client.id,
        details=f"Updated client: {client.name}",
    )

    return client


@trace_service_call("client_service", "delete_client")
async def delete_client(client_id: UUID, user_id: UUID, db: AsyncSession) -> None:
    """
    Delete a client (soft delete).

    Args:
        client_id: ID of the client to delete
        user_id: ID of the user deleting the client
        db: Database session

    Raises:
        ValueError: If client not found or not owned by user
    """
    # Get client
    result = await db.execute(select(Client).where(and_(Client.id == client_id, Client.user_id == user_id)))
    client = result.scalar_one_or_none()

    if not client:
        raise ValueError("Client not found")

    # Store client name before deletion
    client_name = client.name

    # Delete from database
    await db.delete(client)
    await db.commit()

    # Log activity
    await create_activity(
        db=db,
        user_id=user_id,
        action="deleted",
        entity_type="client",
        entity_id=client_id,
        details=f"Deleted client: {client_name}",
    )


@trace_service_call("client_service", "get_client")
async def get_client(client_id: UUID, user_id: UUID, db: AsyncSession) -> Optional[Client]:
    """
    Get a client by ID.

    Args:
        client_id: ID of the client
        user_id: ID of the user requesting the client
        db: Database session

    Returns:
        Client object or None if not found
    """
    result = await db.execute(select(Client).where(and_(Client.id == client_id, Client.user_id == user_id)))
    return result.scalar_one_or_none()


@trace_service_call("client_service", "list_clients")
async def list_clients(user_id: UUID, db: AsyncSession, skip: int = 0, limit: int = 100) -> List[Client]:
    """
    List all clients for a user.

    Args:
        user_id: ID of the user
        db: Database session
        skip: Number of records to skip
        limit: Maximum number of records to return

    Returns:
        List of client objects
    """
    result = await db.execute(
        select(Client).where(Client.user_id == user_id).offset(skip).limit(limit).order_by(Client.created_at.desc())
    )
    return result.scalars().all()
