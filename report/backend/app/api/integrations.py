"""
Time Tracker Integrations API
Handles Toggl and Harvest API token storage and project fetching
"""

from datetime import datetime
from typing import List, Optional

import httpx
from fastapi import APIRouter, Body, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.config import settings
from app.core.logging_config import get_logger
from app.core.security import decrypt_token, encrypt_token
from app.db.database import get_db
from app.models.git_integration import GitIntegration
from app.models.git_repository import GitRepository
from app.models.google_calendar_integration import GoogleCalendarIntegration
from app.models.integrations import TimeTrackerIntegration
from app.models.user import User
from app.schemas.integrations import (
    TimeTrackerIntegrationCreate,
    TimeTrackerIntegrationResponse,
    TimeTrackerIntegrationUpdate,
    TimeTrackerProjectResponse,
)
from app.services.activity_service import create_activity
from app.services.github_provider import GitHubProvider

logger = get_logger(__name__)
router = APIRouter(prefix="/integrations", tags=["integrations"])


@router.post("/time-tracker", response_model=TimeTrackerIntegrationResponse)
async def create_time_tracker_integration(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Save or update time tracker integration (Toggl or Harvest)
    Validates the API token by fetching user info from the provider
    """
    # Debug: Check what we're receiving
    body = await request.body()
    logger.debug("Raw body: %s", body)
    logger.debug("Content-Type: %s", request.headers.get("content-type"))

    # Parse the JSON manually
    import json

    try:
        body_dict = json.loads(body)
        logger.debug("Parsed body: %s", body_dict)
        data = TimeTrackerIntegrationCreate(**body_dict)
    except Exception as e:
        logger.debug("Error parsing body: %s", e)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid request body: {str(e)}",
        )

    # Validate the token by making a test API call
    try:
        if data.provider == "toggl":
            # Test Toggl API token
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    "https://api.track.toggl.com/api/v9/me",
                    auth=(data.api_token, "api_token"),
                )
                if response.status_code != 200:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Invalid Toggl API token",
                    )
                user_data = response.json()
                provider_user_id = str(user_data.get("id"))
                provider_username = user_data.get("fullname") or user_data.get("email")

        elif data.provider == "harvest":
            # Test Harvest API token
            if not data.account_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Account ID is required for Harvest",
                )

            async with httpx.AsyncClient() as client:
                response = await client.get(
                    "https://api.harvestapp.com/v2/users/me",
                    headers={
                        "Authorization": f"Bearer {data.api_token}",
                        "Harvest-Account-ID": data.account_id,
                        "User-Agent": "DevHQ (dev@devhq.com)",
                    },
                )
                if response.status_code != 200:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Invalid Harvest API token or Account ID",
                    )
                user_data = response.json()
                provider_user_id = str(user_data.get("id"))
                provider_username = user_data.get("first_name", "") + " " + user_data.get("last_name", "")
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid provider. Must be 'toggl' or 'harvest'",
            )

    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to validate API token: {str(e)}",
        )

    # Check if integration already exists for this user and provider
    result = await db.execute(
        select(TimeTrackerIntegration).where(
            TimeTrackerIntegration.user_id == current_user.id,
            TimeTrackerIntegration.provider == data.provider,
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        # Update existing integration
        existing.api_token_encrypted = encrypt_token(data.api_token)
        existing.provider_user_id = provider_user_id
        existing.provider_username = provider_username
        existing.account_id = data.account_id
        existing.is_active = True
        existing.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(existing)
        return existing

    # Create new integration
    encrypted_token = encrypt_token(data.api_token)

    integration = TimeTrackerIntegration(
        user_id=current_user.id,
        provider=data.provider,
        api_token_encrypted=encrypted_token,
        provider_user_id=provider_user_id,
        provider_username=provider_username,
        account_id=data.account_id,
        is_active=True,
    )

    db.add(integration)
    await db.commit()
    await db.refresh(integration)

    # Log activity for time tracker integration
    try:
        await create_activity(
            db=db,
            user_id=current_user.id,
            entity_type="integration",
            entity_id=integration.id,
            action="connected",
            title=f"Connected {data.provider.title()}",
            description=f"User: {provider_username}",
        )
    except Exception as e:
        logger.warning("Failed to log integration activity: %s", e)

    return integration


@router.get("/time-tracker", response_model=List[TimeTrackerIntegrationResponse])
async def get_time_tracker_integrations(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get all time tracker integrations for the current user"""

    result = await db.execute(
        select(TimeTrackerIntegration).where(
            TimeTrackerIntegration.user_id == current_user.id,
            TimeTrackerIntegration.is_active == True,
        )
    )
    integrations = result.scalars().all()

    return integrations


@router.get("/time-tracker/{provider}/projects", response_model=List[TimeTrackerProjectResponse])
async def get_time_tracker_projects(
    provider: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Fetch all projects from the time tracker provider
    """

    # Get the integration
    result = await db.execute(
        select(TimeTrackerIntegration).where(
            TimeTrackerIntegration.user_id == current_user.id,
            TimeTrackerIntegration.provider == provider,
            TimeTrackerIntegration.is_active == True,
        )
    )
    integration = result.scalar_one_or_none()

    if not integration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No active {provider} integration found",
        )

    # Decrypt the API token
    api_token = decrypt_token(integration.api_token_encrypted)

    try:
        if provider == "toggl":
            # Fetch Toggl projects
            async with httpx.AsyncClient() as client:
                # Get workspaces first
                workspaces_response = await client.get(
                    "https://api.track.toggl.com/api/v9/workspaces",
                    auth=(api_token, "api_token"),
                )

                if workspaces_response.status_code != 200:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Toggl API error: {workspaces_response.status_code} - {workspaces_response.text}",
                    )

                workspaces = workspaces_response.json()

                all_projects = []
                for workspace in workspaces:
                    workspace_id = workspace.get("id")
                    # Get projects for each workspace
                    projects_response = await client.get(
                        f"https://api.track.toggl.com/api/v9/workspaces/{workspace_id}/projects",
                        auth=(api_token, "api_token"),
                    )

                    if projects_response.status_code != 200:
                        logger.warning(
                            "Failed to fetch projects for workspace %s: %s",
                            workspace_id,
                            projects_response.status_code,
                        )
                        continue

                    projects = projects_response.json()

                    for project in projects:
                        all_projects.append(
                            TimeTrackerProjectResponse(
                                id=str(project.get("id")),
                                name=project.get("name"),
                                client_name=project.get("client_name"),
                                is_active=project.get("active", True),
                            )
                        )

                return all_projects

        elif provider == "harvest":
            # Fetch Harvest projects
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    "https://api.harvestapp.com/v2/projects",
                    headers={
                        "Authorization": f"Bearer {api_token}",
                        "Harvest-Account-ID": integration.account_id,
                        "User-Agent": "DevHQ (dev@devhq.com)",
                    },
                )

                if response.status_code != 200:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Harvest API error: {response.status_code} - {response.text}",
                    )

                data = response.json()
                projects = data.get("projects", [])

                return [
                    TimeTrackerProjectResponse(
                        id=str(project.get("id")),
                        name=project.get("name"),
                        client_name=(project.get("client", {}).get("name") if project.get("client") else None),
                        is_active=project.get("is_active", True),
                    )
                    for project in projects
                ]
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid provider")

    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch projects from {provider}: {str(e)}",
        )


@router.delete("/time-tracker/{provider}")
async def delete_time_tracker_integration(
    provider: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Disconnect/delete a time tracker integration"""

    result = await db.execute(
        select(TimeTrackerIntegration).where(
            TimeTrackerIntegration.user_id == current_user.id,
            TimeTrackerIntegration.provider == provider,
        )
    )
    integration = result.scalar_one_or_none()

    if not integration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No {provider} integration found",
        )

    # Soft delete by setting is_active to False
    integration.is_active = False
    integration.updated_at = datetime.utcnow()
    await db.commit()

    # Log activity for disconnection
    try:
        await create_activity(
            db=db,
            user_id=current_user.id,
            entity_type="integration",
            entity_id=integration.id,
            action="disconnected",
            title=f"Disconnected {provider.title()}",
            description=None,
        )
    except Exception as e:
        logger.warning("Failed to log integration disconnection activity: %s", e)

    return {"status": "success", "message": f"{provider} integration disconnected"}


# ============================================================================
# Git Integration Endpoints (GitHub, GitLab, Bitbucket)
# ============================================================================


@router.get("/git/github/login")
async def github_oauth_login(current_user: User = Depends(get_current_user)):
    """
    Initiate GitHub OAuth flow for connecting GitHub account.
    Returns the GitHub OAuth URL to redirect the user to.
    """
    if not settings.GITHUB_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="GitHub integration is not properly configured.",
        )

    redirect_uri = f"{settings.BACKEND_URL}/api/integrations/git/github/callback"
    scope = "repo read:user admin:repo_hook"

    # Use stateless approach - GitHub will redirect to frontend callback
    # which will then POST the code to /git/github/connect
    github_auth_url = (
        f"https://github.com/login/oauth/authorize"
        f"?client_id={settings.GITHUB_CLIENT_ID}"
        f"&redirect_uri={redirect_uri}"
        f"&scope={scope}"
    )

    return {"authorization_url": github_auth_url}


@router.get("/git/github/callback")
async def github_oauth_callback(
    request: Request,
    code: str = None,
    error: str = None,
    error_description: str = None,
):
    """
    GitHub OAuth callback endpoint.
    Receives the code from GitHub and redirects to frontend with the code.
    The frontend will then POST the code to /git/github/connect.
    """
    from app.core.logging_config import get_logger

    logger = get_logger(__name__)

    # Get frontend URL from request origin or referer, or use default
    frontend_url = settings.frontend_url or "http://localhost:3000"

    if error:
        logger.error(f"GitHub OAuth error: {error} - {error_description}")
        return RedirectResponse(url=f"{frontend_url}/integrations?error={error}&message={error_description}")

    if not code:
        logger.error("GitHub OAuth callback received no code")
        return RedirectResponse(url=f"{frontend_url}/integrations?error=no_code&message=No authorization code received")

    # Redirect to frontend callback page with the code
    # Frontend will handle exchanging the code for a token
    logger.info(f"GitHub OAuth successful, redirecting to frontend with code")
    return RedirectResponse(url=f"{frontend_url}/integrations/callback?provider=github&code={code}")


@router.post("/git/github/connect")
async def connect_github(
    code: str = Body(..., embed=True),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Connect GitHub account via OAuth code exchange.
    Creates or updates GitIntegration record.
    """
    from app.core.logging_config import get_logger

    logger = get_logger(__name__)

    # Validate configuration
    if not settings.GITHUB_CLIENT_ID or not settings.GITHUB_CLIENT_SECRET:
        logger.error(
            f"GitHub OAuth configuration missing: "
            f"CLIENT_ID={'set' if settings.GITHUB_CLIENT_ID else 'MISSING'}, "
            f"CLIENT_SECRET={'set' if settings.GITHUB_CLIENT_SECRET else 'MISSING'}"
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="GitHub integration is not properly configured. Please contact support.",
        )

    logger.info(f"Attempting GitHub connection for user {current_user.id} with code starting with {code[:10]}...")

    github = GitHubProvider()

    try:
        # Exchange code for access token
        logger.info("Exchanging OAuth code for access token...")
        token_response = await github.exchange_code_for_token(code)
        logger.info(f"Token exchange response: {list(token_response.keys())}")

        access_token = token_response.get("access_token")

        if not access_token:
            error_msg = token_response.get("error", "Unknown error")
            error_description = token_response.get("error_description", "No description provided")
            logger.error(f"GitHub token exchange failed: {error_msg} - {error_description}")
            logger.error(f"Full response: {token_response}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to obtain access token from GitHub: {error_msg} - {error_description}",
            )

        # Get user info
        logger.info("Fetching GitHub user info...")
        user_info = await github.get_user_info(access_token)
        username = user_info.get("login")
        logger.info(f"Successfully fetched user info for GitHub user: {username}")

        # Check if integration already exists
        result = await db.execute(
            select(GitIntegration).where(
                GitIntegration.user_id == current_user.id,
                GitIntegration.platform == "github",
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            # Update existing integration
            logger.info(f"Updating existing GitHub integration for user {current_user.id}")
            existing.access_token = encrypt_token(access_token)
            existing.username = username
            existing.is_active = True
            existing.connected_at = datetime.utcnow()
            await db.commit()
            await db.refresh(existing)
            return {
                "status": "success",
                "message": "GitHub account reconnected",
                "integration_id": str(existing.id),
                "username": username,
            }

        # Create new integration
        logger.info(f"Creating new GitHub integration for user {current_user.id}")
        integration = GitIntegration(
            user_id=current_user.id,
            platform="github",
            username=username,
            access_token=encrypt_token(access_token),
            is_active=True,
        )

        db.add(integration)
        await db.commit()
        await db.refresh(integration)

        logger.info(f"Successfully connected GitHub for user {current_user.id}")

        # Log activity for GitHub connection
        try:
            await create_activity(
                db=db,
                user_id=current_user.id,
                entity_type="integration",
                entity_id=integration.id,
                action="connected",
                title="Connected GitHub",
                description=f"Username: {username}",
            )
        except Exception as e:
            logger.warning("Failed to log GitHub connection activity: %s", e)

        return {
            "status": "success",
            "message": "GitHub account connected",
            "integration_id": str(integration.id),
            "username": username,
        }

    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error during GitHub connection: {e.response.status_code} - {e.response.text}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"GitHub API error: {e.response.status_code} - {e.response.text}",
        )
    except httpx.HTTPError as e:
        logger.error(f"HTTP error during GitHub connection: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to connect GitHub: {str(e)}",
        )
    except Exception as e:
        logger.error(f"Unexpected error during GitHub connection: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An unexpected error occurred: {str(e)}",
        )


@router.get("/bundle")
async def get_integrations_bundle(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get all integrations data in one response"""
    from sqlalchemy import select

    from app.models.git_integration import GitIntegration

    # Get time tracker integrations
    result = await db.execute(
        select(TimeTrackerIntegration).where(
            TimeTrackerIntegration.user_id == current_user.id,
            TimeTrackerIntegration.is_active == True,
        )
    )
    time_tracker_integrations = result.scalars().all()

    # Get git integrations
    result = await db.execute(
        select(GitIntegration).where(GitIntegration.user_id == current_user.id, GitIntegration.is_active == True)
    )
    git_integrations = result.scalars().all()

    # Get Google Calendar integration
    from app.models.google_calendar_integration import GoogleCalendarIntegration

    result = await db.execute(select(GoogleCalendarIntegration).where(GoogleCalendarIntegration.user_id == current_user.id))
    google_calendar = result.scalar_one_or_none()

    return {
        "time_tracker": [
            {
                "id": str(ti.id),
                "provider": ti.provider,
                "provider_username": ti.provider_username,
                "is_active": ti.is_active,
                "created_at": ti.created_at.isoformat() if ti.created_at else None,
            }
            for ti in time_tracker_integrations
        ],
        "git": [
            {
                "id": str(gi.id),
                "platform": gi.platform,
                "username": gi.username,
                "connected_at": (gi.connected_at.isoformat() if gi.connected_at else None),
            }
            for gi in git_integrations
        ],
        "google_calendar": (
            {
                "connected": google_calendar is not None and google_calendar.is_connected,
                "google_email": (google_calendar.google_email if google_calendar else None),
                "calendar_id": google_calendar.calendar_id if google_calendar else None,
                "sync_enabled": (google_calendar.sync_enabled if google_calendar else False),
                "last_sync_at": (
                    google_calendar.last_sync_at.isoformat() if google_calendar and google_calendar.last_sync_at else None
                ),
            }
            if google_calendar
            else {"connected": False}
        ),
    }


@router.get("/git")
async def get_git_integrations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all Git integrations for the current user"""
    result = await db.execute(
        select(GitIntegration).where(
            GitIntegration.user_id == current_user.id,
            GitIntegration.is_active == True,
        )
    )
    git_integrations = result.scalars().all()

    return [
        {
            "id": str(gi.id),
            "platform": gi.platform,
            "username": gi.username,
            "connected_at": gi.connected_at.isoformat() if gi.connected_at else None,
            "last_synced_at": gi.last_synced_at.isoformat() if gi.last_synced_at else None,
        }
        for gi in git_integrations
    ]


@router.get("/git/{platform}/repositories")
async def get_git_repositories(
    platform: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Fetch repositories from Git provider"""
    # Get the integration
    result = await db.execute(
        select(GitIntegration).where(
            GitIntegration.user_id == current_user.id,
            GitIntegration.platform == platform,
            GitIntegration.is_active == True,
        )
    )
    integration = result.scalar_one_or_none()

    if not integration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No active {platform} integration found",
        )

    # Decrypt access token
    access_token = decrypt_token(integration.access_token)

    try:
        if platform == "github":
            github = GitHubProvider()
            repos = await github.list_repositories(access_token)

            return [
                {
                    "id": repo.get("id"),
                    "name": repo.get("name"),
                    "full_name": repo.get("full_name"),
                    "url": repo.get("html_url"),
                    "default_branch": repo.get("default_branch"),
                    "private": repo.get("private"),
                    "description": repo.get("description"),
                }
                for repo in repos
            ]
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Platform {platform} not yet supported",
            )

    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch repositories: {str(e)}",
        )


@router.post("/git/{platform}/repositories/link")
async def link_repository_to_project(
    platform: str,
    repo_full_name: str = Body(...),
    project_id: str = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Link a Git repository to a project"""
    logger.debug(
        "Linking repository: platform=%s, repo_full_name=%s, project_id=%s",
        platform,
        repo_full_name,
        project_id,
    )

    # Get the integration
    result = await db.execute(
        select(GitIntegration).where(
            GitIntegration.user_id == current_user.id,
            GitIntegration.platform == platform,
            GitIntegration.is_active == True,
        )
    )
    integration = result.scalar_one_or_none()

    if not integration:
        logger.debug("No active %s integration found for user %s", platform, current_user.id)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No active {platform} integration found",
        )

        logger.debug("Found integration: %s", integration.id)

    # Check if repository is already linked
    result = await db.execute(
        select(GitRepository).where(
            GitRepository.integration_id == integration.id,
            GitRepository.repo_full_name == repo_full_name,
        )
    )
    existing_repo = result.scalar_one_or_none()

    if existing_repo:
        logger.debug("Repository already exists, updating project link: %s", existing_repo.id)
        # Update project link
        existing_repo.project_id = project_id
        existing_repo.is_active = True
        await db.commit()
        await db.refresh(existing_repo)
        logger.debug("Updated repository %s with project_id=%s", existing_repo.id, project_id)
        return {
            "status": "success",
            "message": "Repository link updated",
            "repository_id": str(existing_repo.id),
        }

    # Create new repository link
    repo_parts = repo_full_name.split("/")
    repo_name = repo_parts[-1] if repo_parts else repo_full_name

    logger.debug(
        "Creating new repository link: repo_name=%s, repo_full_name=%s",
        repo_name,
        repo_full_name,
    )

    repository = GitRepository(
        integration_id=integration.id,
        project_id=project_id,
        repo_url=f"https://github.com/{repo_full_name}",
        repo_name=repo_name,
        repo_full_name=repo_full_name,
        is_active=True,
    )

    db.add(repository)
    await db.commit()
    await db.refresh(repository)

    logger.debug("Successfully created repository %s", repository.id)
    logger.debug(
        "Repository details: repo_full_name=%s, repo_url=%s, project_id=%s",
        repository.repo_full_name,
        repository.repo_url,
        repository.project_id,
    )

    return {
        "status": "success",
        "message": "Repository linked to project",
        "repository_id": str(repository.id),
    }


@router.delete("/git/{platform}")
async def disconnect_git_integration(
    platform: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Disconnect Git integration"""
    result = await db.execute(
        select(GitIntegration).where(
            GitIntegration.user_id == current_user.id,
            GitIntegration.platform == platform,
        )
    )
    integration = result.scalar_one_or_none()

    if not integration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No {platform} integration found",
        )

    # Soft delete
    integration.is_active = False
    await db.commit()

    # Log activity for Git disconnection
    try:
        await create_activity(
            db=db,
            user_id=current_user.id,
            entity_type="integration",
            entity_id=integration.id,
            action="disconnected",
            title=f"Disconnected {platform.title()}",
            description=None,
        )
    except Exception as e:
        logger.warning("Failed to log Git disconnection activity: %s", e)

    return {"status": "success", "message": f"{platform} integration disconnected"}
