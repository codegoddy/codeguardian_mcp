"""
Support Chat API endpoints
AI-powered chat support for authenticated users
"""

import logging
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.db.database import get_db
from app.models.support_conversation import SupportConversation
from app.models.user import User
from app.services.ai_support import AISupportAssistant

router = APIRouter()
logger = logging.getLogger(__name__)


# Request/Response Models
class ChatMessage(BaseModel):
    """Single chat message"""

    role: str = Field(..., pattern="^(user|assistant)$")
    content: str
    timestamp: Optional[str] = None


class ChatRequest(BaseModel):
    """Request to send a chat message"""

    message: str = Field(..., min_length=1, max_length=2000)


class ChatResponse(BaseModel):
    """Response from chat endpoint"""

    message: str
    conversation_id: str
    messages: List[ChatMessage]


class ConversationResponse(BaseModel):
    """Response with conversation details"""

    id: str
    title: Optional[str]
    messages: List[ChatMessage]
    created_at: str
    updated_at: str


class ConversationsListResponse(BaseModel):
    """List of recent conversations"""

    conversations: List[dict]


@router.post("/chat", response_model=ChatResponse)
async def send_chat_message(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Send a message to the AI support assistant.
    Creates or continues a conversation for the user.
    """
    logger.info(f"Support chat message from user {current_user.id}")

    # Get or create active conversation for user
    # (We use the most recent conversation if updated within last hour, otherwise create new)
    one_hour_ago = datetime.utcnow() - timedelta(hours=1)

    result = await db.execute(
        select(SupportConversation)
        .where(
            SupportConversation.user_id == current_user.id,
            SupportConversation.updated_at >= one_hour_ago,
        )
        .order_by(SupportConversation.updated_at.desc())
        .limit(1)
    )
    conversation = result.scalar_one_or_none()

    if not conversation:
        # Create new conversation
        conversation = SupportConversation(
            user_id=current_user.id,
            messages=[],
            title=(request.message[:50] + "..." if len(request.message) > 50 else request.message),
        )
        db.add(conversation)
        await db.flush()
        logger.info(f"Created new conversation {conversation.id}")

    # Get existing messages for context
    existing_messages = conversation.messages or []

    # Format messages for AI (just role and content)
    history_for_ai = [{"role": msg["role"], "content": msg["content"]} for msg in existing_messages]

    # Get AI response
    assistant = AISupportAssistant()
    ai_response = await assistant.chat(user_message=request.message, conversation_history=history_for_ai)

    # Create new message entries
    timestamp = datetime.utcnow().isoformat()

    user_message = {"role": "user", "content": request.message, "timestamp": timestamp}

    assistant_message = {
        "role": "assistant",
        "content": ai_response,
        "timestamp": datetime.utcnow().isoformat(),
    }

    # Update conversation with new messages
    updated_messages = existing_messages + [user_message, assistant_message]
    conversation.messages = updated_messages

    await db.commit()
    await db.refresh(conversation)

    logger.info(f"Chat response sent, conversation {conversation.id} now has {len(updated_messages)} messages")

    return ChatResponse(
        message=ai_response,
        conversation_id=str(conversation.id),
        messages=[ChatMessage(**msg) for msg in updated_messages],
    )


@router.get("/conversations", response_model=ConversationsListResponse)
async def get_conversations(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """
    Get list of recent conversations for the user.
    Returns conversations from the last 30 days.
    """
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)

    result = await db.execute(
        select(SupportConversation)
        .where(
            SupportConversation.user_id == current_user.id,
            SupportConversation.created_at >= thirty_days_ago,
        )
        .order_by(SupportConversation.updated_at.desc())
        .limit(20)
    )
    conversations = result.scalars().all()

    return ConversationsListResponse(
        conversations=[
            {
                "id": str(c.id),
                "title": c.title,
                "message_count": len(c.messages or []),
                "last_message": c.messages[-1]["content"][:100] if c.messages else None,
                "updated_at": c.updated_at.isoformat() if c.updated_at else None,
            }
            for c in conversations
        ]
    )


@router.get("/conversations/{conversation_id}", response_model=ConversationResponse)
async def get_conversation(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get a specific conversation by ID.
    """
    from uuid import UUID

    try:
        conv_uuid = UUID(conversation_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid conversation ID")

    result = await db.execute(
        select(SupportConversation).where(
            SupportConversation.id == conv_uuid,
            SupportConversation.user_id == current_user.id,
        )
    )
    conversation = result.scalar_one_or_none()

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return ConversationResponse(
        id=str(conversation.id),
        title=conversation.title,
        messages=[ChatMessage(**msg) for msg in conversation.messages or []],
        created_at=(conversation.created_at.isoformat() if conversation.created_at else ""),
        updated_at=(conversation.updated_at.isoformat() if conversation.updated_at else ""),
    )


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Delete a conversation.
    """
    from uuid import UUID

    try:
        conv_uuid = UUID(conversation_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid conversation ID")

    result = await db.execute(
        delete(SupportConversation).where(
            SupportConversation.id == conv_uuid,
            SupportConversation.user_id == current_user.id,
        )
    )

    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Conversation not found")

    await db.commit()

    return {"message": "Conversation deleted"}


@router.post("/conversations/new", response_model=ConversationResponse)
async def start_new_conversation(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """
    Start a new conversation (clears current session).
    """
    conversation = SupportConversation(user_id=current_user.id, messages=[], title="New conversation")
    db.add(conversation)
    await db.commit()
    await db.refresh(conversation)

    return ConversationResponse(
        id=str(conversation.id),
        title=conversation.title,
        messages=[],
        created_at=(conversation.created_at.isoformat() if conversation.created_at else ""),
        updated_at=(conversation.updated_at.isoformat() if conversation.updated_at else ""),
    )
