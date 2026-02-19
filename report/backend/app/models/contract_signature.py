import uuid

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.sql import func

from app.db.database import Base


class ContractSignature(Base):
    __tablename__ = "contract_signatures"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    project_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    client_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("clients.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Contract details
    contract_content = Column(Text, nullable=False)  # Final contract content
    contract_pdf_url = Column(Text, nullable=True)  # Changed to Text to accommodate long signed URLs

    # Signature details
    signed = Column(Boolean, default=False)
    signed_at = Column(DateTime(timezone=True), nullable=True)
    signature_ip = Column(String(45), nullable=True)
    signature_user_agent = Column(Text, nullable=True)
    client_name_typed = Column(String(255), nullable=True)  # Client types their name as signature

    # Developer signature details
    developer_signed = Column(Boolean, default=False)
    developer_signed_at = Column(DateTime(timezone=True), nullable=True)
    developer_name_typed = Column(String(255), nullable=True)

    # Magic link for signing
    signing_token = Column(String(255), unique=True, nullable=False, index=True)
    signing_token_expires_at = Column(DateTime(timezone=True), nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def __str__(self):
        return f"ContractSignature(id={self.id}, project_id={self.project_id}, signed={self.signed})"
