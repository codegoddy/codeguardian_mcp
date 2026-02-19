"""
Payment Method Model
Stores user payment method configurations for both Paystack and Manual payments
"""

import uuid

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.sql import func

from app.db.database import Base


class PaymentMethod(Base):
    __tablename__ = "payment_methods"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    method_type = Column(String(50), nullable=False, index=True)  # 'paystack' or 'manual'
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    is_default = Column(Boolean, default=False, nullable=False)

    # Paystack specific fields
    paystack_business_name = Column(String(255), nullable=True)
    paystack_settlement_bank = Column(String(255), nullable=True)
    paystack_account_number = Column(String(50), nullable=True)
    paystack_subaccount_code = Column(String(255), nullable=True)

    # Manual payment - general fields
    payment_gateway_name = Column(String(100), nullable=True)
    payment_instructions = Column(Text, nullable=True)
    manual_payment_type = Column(String(50), nullable=True)  # 'bank_transfer', 'mobile_money', 'paypal', etc.

    # Bank Transfer fields
    bank_name = Column(String(255), nullable=True)
    account_name = Column(String(255), nullable=True)
    account_number = Column(String(100), nullable=True)
    swift_code = Column(String(50), nullable=True)
    branch_code = Column(String(50), nullable=True)

    # Mobile Money fields
    mobile_money_provider = Column(String(100), nullable=True)
    mobile_money_number = Column(String(50), nullable=True)
    mobile_money_name = Column(String(255), nullable=True)

    # PayPal fields
    paypal_email = Column(String(255), nullable=True)

    # Wise fields
    wise_email = Column(String(255), nullable=True)

    # Cryptocurrency fields
    crypto_wallet_address = Column(String(255), nullable=True)
    crypto_network = Column(String(100), nullable=True)

    # Other payment gateway fields
    other_gateway_name = Column(String(255), nullable=True)
    additional_info = Column(Text, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __str__(self):
        return f"PaymentMethod(id={self.id}, type={self.method_type}, user_id={self.user_id})"

    def to_dict(self):
        """Convert to dictionary for API responses"""
        return {
            "id": self.id,
            "method_type": self.method_type,
            "is_active": self.is_active,
            "is_default": self.is_default,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            # Paystack fields
            "paystack_business_name": self.paystack_business_name,
            "paystack_settlement_bank": self.paystack_settlement_bank,
            "paystack_account_number": self.paystack_account_number,
            "paystack_subaccount_code": self.paystack_subaccount_code,
            # Manual payment fields
            "payment_gateway_name": self.payment_gateway_name,
            "payment_instructions": self.payment_instructions,
            "manual_payment_type": self.manual_payment_type,
            # Bank transfer
            "bank_name": self.bank_name,
            "account_name": self.account_name,
            "account_number": self.account_number,
            "swift_code": self.swift_code,
            "branch_code": self.branch_code,
            # Mobile money
            "mobile_money_provider": self.mobile_money_provider,
            "mobile_money_number": self.mobile_money_number,
            "mobile_money_name": self.mobile_money_name,
            # PayPal
            "paypal_email": self.paypal_email,
            # Wise
            "wise_email": self.wise_email,
            # Cryptocurrency
            "crypto_wallet_address": self.crypto_wallet_address,
            "crypto_network": self.crypto_network,
            # Other
            "other_gateway_name": self.other_gateway_name,
            "additional_info": self.additional_info,
        }
