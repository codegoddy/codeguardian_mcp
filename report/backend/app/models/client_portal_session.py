import secrets
import uuid
from datetime import datetime, timedelta

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.sql import func

from app.db.database import Base


class ClientPortalSession(Base):
    __tablename__ = "client_portal_sessions"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    client_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("clients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    magic_token = Column(String(255), unique=True, nullable=False, index=True)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(Text, nullable=True)

    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    accessed_at = Column(DateTime(timezone=True), nullable=True)
    is_revoked = Column(Boolean, default=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def __str__(self):
        return f"ClientPortalSession(id={self.id}, client_id={self.client_id}, expires_at={self.expires_at})"

    @staticmethod
    def generate_magic_token():
        """Generate a secure magic token"""
        return secrets.token_urlsafe(32)

    def is_valid(self):
        """Check if session is valid (not expired and not revoked)"""
        from datetime import timezone as tz

        if self.is_revoked:
            return False
        if self.expires_at < datetime.now(tz.utc):
            return False
        return True


class ClientPortalAccessLog(Base):
    __tablename__ = "client_portal_access_logs"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    client_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("clients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    session_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("client_portal_sessions.id", ondelete="SET NULL"),
        nullable=True,
    )

    action = Column(String(100), nullable=False)  # 'login', 'view_project', 'approve_cr', 'make_payment', 'sign_contract'
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(Text, nullable=True)
    success = Column(Boolean, nullable=False)
    failure_reason = Column(String(255), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    def __str__(self):
        return f"ClientPortalAccessLog(id={self.id}, client_id={self.client_id}, action={self.action}, success={self.success})"
