"""Time tracking session API endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.logging_config import get_logger
from app.db.database import get_db
from app.models.user import User
from app.schemas.time_session import SessionHeartbeatRequest, SessionStartRequest, SessionStopRequest, TimeSessionResponse
from app.services.session_manager import SessionManager

logger = get_logger(__name__)

router = APIRouter(prefix="/api/v1/time-tracking", tags=["time-tracking"])


@router.post("/sessions/start", response_model=TimeSessionResponse)
async def start_session(
    request: SessionStartRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Start a new CLI time tracking session."""
    try:
        session = await SessionManager.start_session(
            db=db,
            user_id=current_user.id,
            tracking_code=request.tracking_code,
            client_session_id=request.client_session_id,
            work_type=request.work_type,
            repo_url=request.repo_url,
        )
        return session
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/sessions/stop", response_model=TimeSessionResponse)
async def stop_session(
    request: SessionStopRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Stop a time tracking session and create time entry."""
    try:
        session = await SessionManager.stop_session(
            db=db,
            session_id=request.session_id,
            user_id=current_user.id,
            commit_message=request.commit_message,
            commit_sha=request.commit_sha,
            deliverable_status_after=request.deliverable_status_after,
            developer_notes=request.developer_notes,
            accumulated_seconds=request.accumulated_seconds,
        )

        # Log activity for CLI time tracking
        try:
            from app.services.activity_service import create_activity

            duration_hours = session.duration_minutes / 60 if session.duration_minutes else 0
            await create_activity(
                db=db,
                user_id=current_user.id,
                entity_type="time_session",
                entity_id=session.id,
                action="tracked",
                title=f"CLI tracked {duration_hours:.1f}h: {session.tracking_code}",
                description=(request.developer_notes[:100] if request.developer_notes else None),
            )
        except Exception as e:
            logger.warning("Failed to log CLI session activity", exc_info=True)

        return session
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/sessions/{session_id}/pause", response_model=TimeSessionResponse)
async def pause_session(
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Pause an active session."""
    try:
        session = await SessionManager.pause_session(db=db, session_id=session_id, user_id=current_user.id)
        return session
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post("/sessions/{session_id}/resume", response_model=TimeSessionResponse)
async def resume_session(
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Resume a paused session."""
    try:
        session = await SessionManager.resume_session(db=db, session_id=session_id, user_id=current_user.id)
        return session
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post("/sessions/{session_id}/heartbeat", response_model=TimeSessionResponse)
async def session_heartbeat(
    session_id: UUID,
    request: SessionHeartbeatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send heartbeat to keep session alive and track activity."""
    try:
        session = await SessionManager.heartbeat(
            db=db,
            session_id=session_id,
            user_id=current_user.id,
            activity_type=request.activity_type,
        )
        return session
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.get("/sessions/active", response_model=list[TimeSessionResponse])
async def get_active_sessions(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get all active and paused sessions for the current user."""
    sessions = await SessionManager.get_active_sessions(db=db, user_id=current_user.id)
    return sessions


@router.delete("/sessions/{session_id}/force")
async def force_delete_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Force delete a stuck session (admin/cleanup endpoint)."""
    from uuid import UUID

    from sqlalchemy import and_, select

    from app.models.time_session import TimeSession

    try:
        session_uuid = UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session ID")

    result = await db.execute(
        select(TimeSession).where(and_(TimeSession.id == session_uuid, TimeSession.user_id == current_user.id))
    )

    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    await db.delete(session)
    await db.commit()

    return {
        "message": "Session deleted successfully",
        "tracking_code": session.tracking_code,
    }
