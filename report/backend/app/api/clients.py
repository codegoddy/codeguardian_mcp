from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.common.exceptions import AuthenticationException, InternalException, NotFoundException, ValidationException
from app.core.auth import get_current_user
from app.core.logging_config import get_logger
from app.db.database import get_db
from app.models.client import Client
from app.models.user import User
from app.schemas.client import ClientCreate, ClientResponse, ClientUpdate
from app.services.activity_service import create_activity
from app.utils.redis_client import RedisCache

logger = get_logger(__name__)
router = APIRouter()


async def get_current_user_id(request: Request, db: Session = Depends(get_db)) -> UUID:
    """Extract user ID from authenticated user (supports Cookies & Headers)"""
    try:
        # Use the async get_current_user function which handles both Cookies and Bearer tokens
        user = await get_current_user(request, db)
        return user.id
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Authentication failed", exc_info=True)
        raise AuthenticationException("Not authenticated")


@router.post("/clients", response_model=ClientResponse, status_code=status.HTTP_201_CREATED)
async def create_client(request: Request, db: Session = Depends(get_db)):
    """Create a new client with payment configuration"""
    import json

    from pydantic import ValidationError

    # Get raw request body for debugging BEFORE Pydantic validation
    body = await request.body()
    body_str = body.decode("utf-8")
    logger.debug("Raw client request body: %s", body_str)

    try:
        body_json = json.loads(body_str)
        logger.debug("Parsed client JSON: %s", body_json)
    except Exception as e:
        logger.debug("Failed to parse client JSON: %s", e)
        raise ValidationException("Invalid JSON in request body")

    # Now validate with Pydantic
    try:
        client_data = ClientCreate(**body_json)
        logger.debug("Client validation successful!")
        logger.debug("Validated client data: %s", client_data.model_dump())
    except ValidationError as e:
        logger.debug("Pydantic validation error for client: %s", e)
        logger.debug("Validation errors detail: %s", e.errors())
        raise ValidationException("Client validation failed", details={"errors": e.errors()})

    user_id = await get_current_user_id(request, db)

    # Validate payment method
    if client_data.payment_method not in ["paystack", "manual"]:
        raise ValidationException(
            "Payment method must be 'paystack' or 'manual'",
            details={"field": "payment_method", "value": client_data.payment_method},
        )

    # For manual payment, ensure gateway name and instructions are provided
    if client_data.payment_method == "manual":
        if not client_data.payment_gateway_name or not client_data.payment_instructions:
            raise ValidationException(
                "Manual payment requires payment_gateway_name and payment_instructions",
                details={"missing_fields": ["payment_gateway_name", "payment_instructions"]},
            )

    # Create client
    db_client = Client(
        user_id=user_id,
        name=client_data.name,
        email=client_data.email,
        company=client_data.company,
        default_hourly_rate=client_data.default_hourly_rate,
        change_request_rate=client_data.change_request_rate,
        payment_method=client_data.payment_method,
        payment_gateway_name=client_data.payment_gateway_name,
        payment_instructions=client_data.payment_instructions,
        paystack_subaccount_code=client_data.paystack_subaccount_code,
        paystack_customer_code=client_data.paystack_customer_code,
    )

    # Generate portal access token
    db_client.generate_portal_token()

    db.add(db_client)
    await db.commit()
    await db.refresh(db_client)

    # Invalidate clients cache to ensure fresh data on next fetch
    await RedisCache.invalidate_clients(user_id)

    # Log activity for client creation
    try:
        await create_activity(
            db=db,
            user_id=user_id,
            entity_type="client",
            entity_id=db_client.id,
            action="created",
            title=f"Added client: {db_client.name}",
            description=f"Email: {db_client.email}" + (f" - {db_client.company}" if db_client.company else ""),
        )
    except Exception as e:
        logger.warning("Failed to log client creation activity: %s", e)

    return db_client


@router.get("/clients", response_model=List[ClientResponse])
async def get_clients(request: Request, db: Session = Depends(get_db)):
    """List all clients for authenticated user with Redis caching"""
    user_id = await get_current_user_id(request, db)

    # Try to get from cache first
    cached_clients = await RedisCache.get_clients(user_id)
    if cached_clients is not None:
        return cached_clients

    result = await db.execute(
        select(Client).where(Client.user_id == user_id, Client.is_active == True).order_by(Client.created_at.desc())
    )
    clients = result.scalars().all()

    # Convert to dict for caching
    clients_list = [ClientResponse.model_validate(client).model_dump() for client in clients]

    # Cache the results
    await RedisCache.set_clients(user_id, clients_list)

    return clients


@router.get("/clients/{client_id}", response_model=ClientResponse)
async def get_client(client_id: UUID, request: Request, db: Session = Depends(get_db)):
    """Get client details"""
    user_id = await get_current_user_id(request, db)

    result = await db.execute(select(Client).where(Client.id == client_id, Client.user_id == user_id))
    client = result.scalar_one_or_none()

    if not client:
        raise NotFoundException("Client", client_id)

    return client


@router.put("/clients/{client_id}", response_model=ClientResponse)
async def update_client(client_id: UUID, request: Request, db: Session = Depends(get_db)):
    """Update client information"""
    import json

    from pydantic import ValidationError

    # Get raw request body for debugging BEFORE Pydantic validation
    body = await request.body()
    body_str = body.decode("utf-8")
    logger.debug("Raw client update request body: %s", body_str)

    try:
        body_json = json.loads(body_str)
        logger.debug("Parsed client update JSON: %s", body_json)
    except Exception as e:
        logger.debug("Failed to parse client update JSON: %s", e)
        raise ValidationException("Invalid JSON in request body")

    # Now validate with Pydantic
    try:
        client_data = ClientUpdate(**body_json)
        logger.debug("Client update validation successful!")
        logger.debug(
            "Validated client update data: %s",
            client_data.model_dump(exclude_unset=True),
        )
    except ValidationError as e:
        logger.debug("Pydantic validation error for client update: %s", e)
        logger.debug("Validation errors detail: %s", e.errors())
        raise ValidationException("Client update validation failed", details={"errors": e.errors()})

    user_id = await get_current_user_id(request, db)

    result = await db.execute(select(Client).where(Client.id == client_id, Client.user_id == user_id))
    client = result.scalar_one_or_none()

    if not client:
        raise NotFoundException("Client", client_id)

    # Update fields if provided
    update_data = client_data.model_dump(exclude_unset=True)
    logger.debug("Final client update_data: %s", update_data)

    # Validate payment method if being updated
    if "payment_method" in update_data:
        if update_data["payment_method"] not in ["paystack", "manual"]:
            raise ValidationException(
                "Payment method must be 'paystack' or 'manual'",
                details={
                    "field": "payment_method",
                    "value": update_data["payment_method"],
                },
            )

    for field, value in update_data.items():
        setattr(client, field, value)

    await db.commit()
    await db.refresh(client)

    # Invalidate clients cache to ensure fresh data on next fetch
    await RedisCache.invalidate_clients(user_id)

    # Log activity for client update
    try:
        await create_activity(
            db=db,
            user_id=user_id,
            entity_type="client",
            entity_id=client.id,
            action="updated",
            title=f"Updated client: {client.name}",
            description=None,
        )
    except Exception as e:
        logger.warning("Failed to log client update activity: %s", e)

    return client


@router.delete("/clients/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_client(client_id: UUID, request: Request, db: Session = Depends(get_db)):
    """Soft delete client"""
    user_id = await get_current_user_id(request, db)

    result = await db.execute(select(Client).where(Client.id == client_id, Client.user_id == user_id))
    client = result.scalar_one_or_none()

    if not client:
        raise NotFoundException("Client", client_id)

    # Soft delete by setting is_active to False
    client.is_active = False
    client_name = client.name  # Store before commit
    await db.commit()

    # Invalidate clients cache to ensure fresh data on next fetch
    await RedisCache.invalidate_clients(user_id)

    # Log activity for client deletion
    try:
        await create_activity(
            db=db,
            user_id=user_id,
            entity_type="client",
            entity_id=client_id,
            action="deleted",
            title=f"Removed client: {client_name}",
            description=None,
        )
    except Exception as e:
        logger.warning("Failed to log client deletion activity: %s", e)

    return None


@router.post("/{client_id}/send-portal-link")
async def send_client_portal_link(
    client_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generate and send client portal access link to the client.
    Creates a new magic link session and emails it to the client.
    """
    from datetime import datetime, timedelta, timezone

    from sqlalchemy import update

    from app.core.config import settings
    from app.models.client_portal_session import ClientPortalSession
    from app.utils.nats_client import publish_event

    try:
        # Get client
        result = await db.execute(select(Client).where(Client.id == client_id, Client.user_id == current_user.id))
        client = result.scalar_one_or_none()

        if not client:
            raise NotFoundException("Client", client_id)

        # Check for active portal session (not expired)
        now_utc = datetime.now(timezone.utc)
        result = await db.execute(
            select(ClientPortalSession)
            .where(
                ClientPortalSession.client_id == client.id,
                ClientPortalSession.expires_at > now_utc,
                ClientPortalSession.is_revoked == False,
            )
            .order_by(ClientPortalSession.created_at.desc())
            .limit(1)
        )
        existing_session = result.scalar_one_or_none()

        if existing_session:
            logger.debug("Reusing existing active portal session for client %s", client.id)
            magic_token = existing_session.magic_token
            expires_at = existing_session.expires_at
        else:
            # Invalidate all previous active sessions for this client
            await db.execute(
                update(ClientPortalSession)
                .where(
                    ClientPortalSession.client_id == client.id,
                    ClientPortalSession.is_revoked == False,
                )
                .values(is_revoked=True)
            )

            # Generate magic token (30-day expiry)
            magic_token = ClientPortalSession.generate_magic_token()
            expires_at = datetime.now(timezone.utc) + timedelta(days=30)

            # Create session
            portal_session = ClientPortalSession(
                client_id=client.id,
                magic_token=magic_token,
                ip_address="generated_by_developer",
                user_agent="DevHQ_System",
                expires_at=expires_at,
            )
            db.add(portal_session)
            await db.commit()
            await db.refresh(portal_session)

        # Generate magic link
        magic_link = f"{settings.frontend_url}/client-portal/{magic_token}"

        # Publish event to NATS for email sending
        logger.info("Publishing client portal access link email to NATS")
        try:
            await publish_event(
                "email.client_portal_access_link",
                {
                    "to_email": client.email,
                    "client_name": client.name,
                    "developer_name": current_user.full_name,
                    "project_name": "Client Portal",  # Generic name since it's client-wide
                    "magic_link": magic_link,
                },
                background=True,
            )
            logger.info("Client portal access link email event published successfully")
        except Exception as e:
            logger.error(
                "Failed to publish client portal access link email: %s",
                e,
                exc_info=True,
            )
            # Continue even if email fails

        # Log activity for portal link sent
        try:
            await create_activity(
                db=db,
                user_id=current_user.id,
                entity_type="client",
                entity_id=client.id,
                action="portal_link_sent",
                title=f"Sent portal link: {client.name}",
                description=f"Access link sent to {client.email}",
            )
        except Exception as e:
            logger.warning("Failed to log portal link activity: %s", e)

        return {
            "magic_link": magic_link,
            "expires_at": expires_at.isoformat(),
            "client_email": client.email,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to generate client portal link: %s", e, exc_info=True)
        raise InternalException(f"Failed to generate client portal link: {str(e)}")

    # Log activity for portal link sent (after return so moved to before return)
    finally:
        pass  # Activity logging done inline
