/** @format */

"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle,
  Download,
  ArrowLeft,
  Loader2,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import { getApiUrl } from "@/lib/config";
import { useCurrencyFormat } from "@/hooks/use-currency-format";

interface PaymentStatus {
  invoice_id: string;
  invoice_number: string;
  status: string;
  total_amount: number;
  total_paid: number;
  balance_due: number;
  currency: string;
  is_fully_paid: boolean;
  last_payment_at: string | null;
  payment_token: string;
  latest_transaction: {
    id: string;
    reference: string;
    status: string;
    amount: number;
    gateway: string;
    initiated_at: string;
    completed_at: string | null;
  } | null;
}

export default function PaymentSuccessPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { formatWithCurrency } = useCurrencyFormat();

  // Get payment reference and status from URL parameters
  const reference = searchParams.get("reference") || searchParams.get("trxref");
  const paystackStatus = searchParams.get("status"); // Paystack sends status parameter

  // Determine if this is a success or failure based on URL
  const isPaymentSuccess = !paystackStatus || paystackStatus === "success";
  const isPaymentFailure =
    paystackStatus === "failed" || paystackStatus === "cancelled";

  const loadPaymentStatusByReference = useCallback(async (paymentReference: string) => {
    try {
      setIsLoading(true);

      // First, try to find the invoice by payment reference
      const response = await fetch(
        getApiUrl(
          `/api/v1/payments/status-by-reference?reference=${paymentReference}`
        )
      );

      if (response.ok) {
        const statusData = await response.json();
        setPaymentStatus(statusData);

        // If payment is not yet marked as completed, poll for updates
        if (
          !statusData.is_fully_paid &&
          statusData.latest_transaction?.status !== "completed"
        ) {
          console.log(
            "Payment not yet processed by webhook, will check again in 3 seconds..."
          );
          setTimeout(() => {
            loadPaymentStatusByReference(paymentReference);
          }, 3000);
        }
      } else if (response.status === 404) {
        setError(
          "Payment not found. Please contact support if you completed a payment."
        );
      } else {
        setError("Failed to load payment status. Please try again.");
      }
    } catch (error) {
      console.error("Error loading payment status:", error);
      setError("Network error. Please check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (reference) {
      loadPaymentStatusByReference(reference);
    } else {
      setError("No payment reference found in URL");
      setIsLoading(false);
    }
  }, [reference, loadPaymentStatusByReference]);

  const formatCurrency = (amount: number, currency: string) => {
    return formatWithCurrency(amount, currency);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-400 mx-auto mb-4" />
          <div className="text-white">Loading payment status...</div>
          {reference && (
            <div className="text-white/60 text-sm mt-2">
              Reference: {reference}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center text-white max-w-md">
          <XCircle className="h-16 w-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-4">Payment Status Error</h1>
          <p className="text-white/60 mb-6">{error}</p>
          {reference && (
            <div className="text-white/40 text-sm mb-6 font-mono">
              Reference: {reference}
            </div>
          )}
          <button
            onClick={() => router.push("/dashboard")}
            className="border border-blue-400/30 bg-blue-400/10 px-6 py-3 text-blue-400 hover:bg-blue-400/20 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 inline mr-2" />
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Determine if this is a failure case
  const showFailure = isPaymentFailure || paystackStatus === "failed";

  if (!paymentStatus && !showFailure) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center text-white">
          <h1 className="text-2xl font-bold mb-4">
            Payment Status Unavailable
          </h1>
          <p className="text-white/60 mb-6">
            Unable to load payment information for this invoice.
          </p>
          <button
            onClick={() => router.push("/dashboard")}
            className="border border-blue-400/30 bg-blue-400/10 px-6 py-3 text-blue-400 hover:bg-blue-400/20 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 inline mr-2" />
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Check if payment is successful based on backend status OR URL parameters (immediate feedback)
  const isPaymentSuccessful =
    !showFailure &&
    paymentStatus &&
    (paymentStatus.latest_transaction?.status === "completed" ||
      paymentStatus.status === "paid" ||
      paymentStatus.is_fully_paid ||
      (reference && reference.startsWith("inv_") && isPaymentSuccess));

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <div className="border-b border-white/20 bg-black/50 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="text-center">
            <div className="mb-4">
              {showFailure ? (
                <XCircle className="h-16 w-16 text-red-400 mx-auto" />
              ) : isPaymentSuccessful ? (
                <CheckCircle className="h-16 w-16 text-green-400 mx-auto" />
              ) : (
                <div className="h-16 w-16 border-4 border-yellow-400 rounded-full flex items-center justify-center mx-auto">
                  <span className="text-yellow-400 text-2xl">!</span>
                </div>
              )}
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">
              {showFailure
                ? "Payment Failed"
                : isPaymentSuccessful
                  ? "Payment Successful!"
                  : "Payment Processing"}
            </h1>
            <p className="text-white/60">
              {paymentStatus?.invoice_number
                ? `Invoice #${paymentStatus.invoice_number}`
                : reference
                  ? `Reference: ${reference}`
                  : "Payment Status"}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* Failure Message */}
        {showFailure && (
          <div className="border border-red-400/30 bg-red-400/10 p-6">
            <div className="text-center">
              <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-red-400 mb-3">
                Payment Could Not Be Processed
              </h3>
              <p className="text-white/60 mb-6">
                Your payment was not successful. This could be due to
                insufficient funds, an expired card, or a network issue.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button
                  onClick={() => {
                    if (paymentStatus?.payment_token) {
                      router.push(`/payment/${paymentStatus.payment_token}`);
                    } else {
                      router.back();
                    }
                  }}
                  className="border border-blue-400/30 bg-blue-400/10 px-6 py-3 text-blue-400 hover:bg-blue-400/20 transition-colors"
                >
                  Try Again
                </button>
                <button
                  onClick={() => router.push("/dashboard")}
                  className="border border-white/20 bg-transparent px-6 py-3 text-white hover:bg-white/5 transition-colors"
                >
                  Go to Dashboard
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Payment Summary */}
        {!showFailure && paymentStatus && (
          <div className="border border-white/20 bg-transparent p-6">
            <h2 className="text-xl font-semibold text-white mb-6">
              Payment Summary
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <div className="text-white/60 text-sm">Total Amount</div>
                  <div className="text-white text-lg font-medium">
                    {formatCurrency(
                      paymentStatus.total_amount,
                      paymentStatus.currency
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-white/60 text-sm">Amount Paid</div>
                  <div className="text-green-400 text-lg font-medium">
                    {formatCurrency(
                      paymentStatus.total_paid,
                      paymentStatus.currency
                    )}
                  </div>
                </div>

                {paymentStatus.balance_due > 0 && (
                  <div>
                    <div className="text-white/60 text-sm">
                      Remaining Balance
                    </div>
                    <div className="text-yellow-400 text-lg font-medium">
                      {formatCurrency(
                        paymentStatus.balance_due,
                        paymentStatus.currency
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <div className="text-white/60 text-sm">Payment Status</div>
                  <div
                    className={`text-lg font-medium ${
                      isPaymentSuccessful ? "text-green-400" : "text-yellow-400"
                    }`}
                  >
                    {isPaymentSuccessful ? "Completed" : "Processing"}
                  </div>
                </div>

                {paymentStatus.last_payment_at && (
                  <div>
                    <div className="text-white/60 text-sm">Payment Date</div>
                    <div className="text-white text-lg font-medium">
                      {formatDate(paymentStatus.last_payment_at)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Transaction Details */}
        {!showFailure && paymentStatus?.latest_transaction && (
          <div className="border border-white/20 bg-transparent p-6">
            <h3 className="text-lg font-semibold text-white mb-4">
              Transaction Details
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-white/60">Transaction ID:</span>
                <span className="text-white ml-2 font-mono">
                  {paymentStatus.latest_transaction.id}
                </span>
              </div>

              <div>
                <span className="text-white/60">Reference:</span>
                <span className="text-white ml-2 font-mono">
                  {paymentStatus.latest_transaction.reference}
                </span>
              </div>

              <div>
                <span className="text-white/60">Payment Gateway:</span>
                <span className="text-white ml-2 capitalize">
                  {paymentStatus.latest_transaction.gateway}
                </span>
              </div>

              <div>
                <span className="text-white/60">Amount:</span>
                <span className="text-white ml-2">
                  {formatCurrency(
                    paymentStatus.latest_transaction.amount,
                    paymentStatus.currency
                  )}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Success Message */}
        {!showFailure && isPaymentSuccessful && (
          <div className="border border-green-400/30 bg-green-400/10 p-6">
            <div className="text-center">
              <h3 className="text-green-400 font-medium mb-2">
                Thank you for your payment!
              </h3>
              <p className="text-white/60 text-sm">
                Your payment has been processed successfully. You should receive
                a confirmation email shortly.
              </p>
            </div>
          </div>
        )}

        {/* Actions */}
        {!showFailure && (
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {paymentStatus?.payment_token && (
              <button
                onClick={() =>
                  router.push(`/payment/${paymentStatus.payment_token}`)
                }
                className="border border-white/20 bg-transparent px-6 py-3 text-white hover:bg-white/5 transition-colors flex items-center justify-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Invoice
              </button>
            )}

            <button
              onClick={() => window.print()}
              className="border border-blue-400/30 bg-blue-400/10 px-6 py-3 text-blue-400 hover:bg-blue-400/20 transition-colors flex items-center justify-center gap-2"
            >
              <Download className="h-4 w-4" />
              Print Receipt
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-white/40 text-sm">
          <p>Powered by DevHQ Payment System</p>
        </div>
      </div>
    </div>
  );
}
