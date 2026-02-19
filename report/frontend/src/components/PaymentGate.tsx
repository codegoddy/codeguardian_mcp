'use client';

import React, { useState } from 'react';
import { Lock, CreditCard, Building2, AlertCircle, CheckCircle } from 'lucide-react';

export interface PaymentGateProps {
  // Payment info
  paymentName: string;
  paymentAmount: number;
  currency: string;
  projectName: string;
  
  // Payment method
  paymentMethod: 'paystack' | 'manual';
  
  // Manual payment details (if paymentMethod is 'manual')
  manualPaymentDetails?: {
    paymentGatewayName: string;
    paymentInstructions: string;
    bankName?: string;
    accountName?: string;
    accountNumber?: string;
    mobileMoneyProvider?: string;
    mobileMoneyNumber?: string;
    mobileMoneyName?: string;
  };
  
  // Callbacks
  onPayWithPaystack?: () => void;
  onMarkAsPaid?: () => void;
  
  // State
  isLoading?: boolean;
  isPendingConfirmation?: boolean;
}

const formatCurrency = (amount: number, currency: string) => {
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

export default function PaymentGate({
  paymentName,
  paymentAmount,
  currency,
  projectName,
  paymentMethod,
  manualPaymentDetails,
  onPayWithPaystack,
  onMarkAsPaid,
  isLoading = false,
  isPendingConfirmation = false
}: PaymentGateProps) {
  const [showManualDetails, setShowManualDetails] = useState(false);

  if (isPendingConfirmation) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="max-w-md w-full bg-[#1a1f2e]/80 backdrop-blur-sm rounded-2xl border border-orange-500/20 p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-orange-500/10 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-orange-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Payment Pending Confirmation</h2>
          <p className="text-gray-400 mb-6">
            Thank you for your payment. The developer is reviewing your payment and will confirm it shortly.
          </p>
          <div className="bg-orange-500/10 rounded-lg p-4 text-sm text-orange-300">
            <p>You will receive access once the payment is confirmed.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[400px] flex items-center justify-center">
      <div className="max-w-md w-full bg-[#1a1f2e]/80 backdrop-blur-sm rounded-2xl border border-yellow-500/20 p-8">
        {/* Lock Icon */}
        <div className="w-16 h-16 rounded-full bg-yellow-500/10 flex items-center justify-center mx-auto mb-6">
          <Lock className="w-8 h-8 text-yellow-400" />
        </div>

        {/* Header */}
        <h2 className="text-xl font-bold text-white text-center mb-2">
          Payment Required
        </h2>
        <p className="text-gray-400 text-center mb-6">
          Complete the {paymentName.toLowerCase()} to access your project portal.
        </p>

        {/* Payment Info */}
        <div className="bg-white/5 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-sm">Project</span>
            <span className="text-white font-medium">{projectName}</span>
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-sm">Payment</span>
            <span className="text-white font-medium">{paymentName}</span>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-white/10">
            <span className="text-gray-400 text-sm">Amount Due</span>
            <span className="text-2xl font-bold text-emerald-400">
              {formatCurrency(paymentAmount, currency)}
            </span>
          </div>
        </div>

        {/* Payment Method: Paystack */}
        {paymentMethod === 'paystack' && onPayWithPaystack && (
          <button
            onClick={onPayWithPaystack}
            disabled={isLoading}
            className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <CreditCard className="w-5 h-5" />
                Pay Now
              </>
            )}
          </button>
        )}

        {/* Payment Method: Manual */}
        {paymentMethod === 'manual' && manualPaymentDetails && (
          <>
            {!showManualDetails ? (
              <button
                onClick={() => setShowManualDetails(true)}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <Building2 className="w-5 h-5" />
                View Payment Details
              </button>
            ) : (
              <div className="space-y-4">
                {/* Payment Instructions */}
                <div className="bg-white/5 rounded-xl p-4">
                  <h3 className="text-sm font-medium text-white mb-2">
                    {manualPaymentDetails.paymentGatewayName}
                  </h3>
                  <p className="text-gray-400 text-sm whitespace-pre-wrap">
                    {manualPaymentDetails.paymentInstructions}
                  </p>
                </div>

                {/* Bank Details */}
                {manualPaymentDetails.bankName && (
                  <div className="bg-white/5 rounded-xl p-4 space-y-2">
                    <h4 className="text-xs text-gray-400 uppercase tracking-wide">Bank Details</h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Bank</span>
                        <span className="text-white font-mono">{manualPaymentDetails.bankName}</span>
                      </div>
                      {manualPaymentDetails.accountName && (
                        <div className="flex justify-between">
                          <span className="text-gray-400">Account Name</span>
                          <span className="text-white font-mono">{manualPaymentDetails.accountName}</span>
                        </div>
                      )}
                      {manualPaymentDetails.accountNumber && (
                        <div className="flex justify-between">
                          <span className="text-gray-400">Account Number</span>
                          <span className="text-white font-mono">{manualPaymentDetails.accountNumber}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Mobile Money Details */}
                {manualPaymentDetails.mobileMoneyProvider && (
                  <div className="bg-white/5 rounded-xl p-4 space-y-2">
                    <h4 className="text-xs text-gray-400 uppercase tracking-wide">Mobile Money</h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Provider</span>
                        <span className="text-white font-mono">{manualPaymentDetails.mobileMoneyProvider}</span>
                      </div>
                      {manualPaymentDetails.mobileMoneyNumber && (
                        <div className="flex justify-between">
                          <span className="text-gray-400">Number</span>
                          <span className="text-white font-mono">{manualPaymentDetails.mobileMoneyNumber}</span>
                        </div>
                      )}
                      {manualPaymentDetails.mobileMoneyName && (
                        <div className="flex justify-between">
                          <span className="text-gray-400">Name</span>
                          <span className="text-white font-mono">{manualPaymentDetails.mobileMoneyName}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Mark as Paid Button */}
                {onMarkAsPaid && (
                  <button
                    onClick={onMarkAsPaid}
                    disabled={isLoading}
                    className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-5 h-5" />
                        I Have Paid
                      </>
                    )}
                  </button>
                )}

                <p className="text-xs text-gray-500 text-center">
                  After payment, click &quot;I Have Paid&quot; and the developer will confirm your payment.
                </p>
              </div>
            )}
          </>
        )}

        {/* Help Text */}
        <p className="text-xs text-gray-500 text-center mt-4">
          Need help? Contact your developer.
        </p>
      </div>
    </div>
  );
}
