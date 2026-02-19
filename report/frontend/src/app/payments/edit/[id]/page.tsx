"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { usePaymentMethods, useUpdatePaymentMethod } from "../../../../hooks/usePayments";
import AuthGuard from "../../../../components/AuthGuard";
import LoadingSpinner from "../../../../components/LoadingSpinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../../components/ui/Select";
import { toast } from "../../../../lib/toast";

export default function PaymentEdit() {
  const router = useRouter();
  const params = useParams();
  const methodId = params.id as string;
  
  const [error, setError] = useState<string | null>(null);
  
  // Fetch payment methods to get the one we're editing
  const { data: paymentMethods, isLoading: loadingMethods } = usePaymentMethods();
  const updateMutation = useUpdatePaymentMethod();
  
  const loading = updateMutation.isPending;
  const method = paymentMethods?.find(m => m.id === methodId);

  // Manual payment form state
  const [manualData, setManualData] = useState({
    paymentMethod: "",
    paymentInstructions: "",
    // Bank Transfer fields
    bankName: "",
    accountName: "",
    accountNumber: "",
    swiftCode: "",
    branchCode: "",
    // Mobile Money fields
    mobileMoneyProvider: "",
    mobileMoneyNumber: "",
    mobileMoneyName: "",
    // PayPal fields
    paypalEmail: "",
    // Wise fields
    wiseEmail: "",
    // Cryptocurrency fields
    cryptoWalletAddress: "",
    cryptoNetwork: "",
    // Other fields
    otherGatewayName: "",
    additionalInfo: "",
  });

  // Load existing data when method is fetched
  useEffect(() => {
    if (method && method.method_type === "manual") {
      setManualData({
        paymentMethod: method.manual_payment_type || "",
        paymentInstructions: method.payment_instructions || "",
        bankName: method.bank_name || "",
        accountName: method.account_name || "",
        accountNumber: method.account_number || "",
        swiftCode: method.swift_code || "",
        branchCode: method.branch_code || "",
        mobileMoneyProvider: method.mobile_money_provider || "",
        mobileMoneyNumber: method.mobile_money_number || "",
        mobileMoneyName: method.mobile_money_name || "",
        paypalEmail: method.paypal_email || "",
        wiseEmail: method.wise_email || "",
        cryptoWalletAddress: method.crypto_wallet_address || "",
        cryptoNetwork: method.crypto_network || "",
        otherGatewayName: method.other_gateway_name || "",
        additionalInfo: method.additional_info || "",
      });
    }
  }, [method]);

  if (loadingMethods) {
    return (
      <AuthGuard>
        <div className="min-h-screen" style={{ backgroundColor: "#F5F5F5" }}>
          <main>
            <div className="max-w-3xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-center py-12">
                <LoadingSpinner />
              </div>
            </div>
          </main>
        </div>
      </AuthGuard>
    );
  }

  if (!method) {
    return (
      <AuthGuard>
        <div className="min-h-screen" style={{ backgroundColor: "#F5F5F5" }}>
          <main>
            <div className="max-w-3xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
              <div className="bg-white rounded-2xl p-6 text-center">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Payment Method Not Found</h2>
                <p className="text-gray-600 mb-6">The payment method you&apos;re trying to edit doesn&apos;t exist.</p>
                <button
                  onClick={() => router.push('/payments')}
                  className="px-4 py-2 email-button text-sm font-medium"
                >
                  Back to Payments
                </button>
              </div>
            </div>
          </main>
        </div>
      </AuthGuard>
    );
  }

  if (method.method_type !== "manual") {
    return (
      <AuthGuard>
        <div className="min-h-screen" style={{ backgroundColor: "#F5F5F5" }}>
          <main>
            <div className="max-w-3xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
              <div className="bg-white rounded-2xl p-6 text-center">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Cannot Edit This Payment Method</h2>
                <p className="text-gray-600 mb-6">Only manual payment methods can be edited.</p>
                <button
                  onClick={() => router.push('/payments')}
                  className="px-4 py-2 email-button text-sm font-medium"
                >
                  Back to Payments
                </button>
              </div>
            </div>
          </main>
        </div>
      </AuthGuard>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!manualData.paymentMethod || !manualData.paymentInstructions) {
      setError("Please fill in all required fields");
      return;
    }

    // Validate method-specific required fields
    if (manualData.paymentMethod === "bank_transfer" && (!manualData.bankName || !manualData.accountNumber)) {
      setError("Please fill in bank details");
      return;
    }
    if (manualData.paymentMethod === "mobile_money" && (!manualData.mobileMoneyProvider || !manualData.mobileMoneyNumber)) {
      setError("Please fill in mobile money details");
      return;
    }
    if (manualData.paymentMethod === "paypal" && !manualData.paypalEmail) {
      setError("Please provide PayPal email");
      return;
    }
    if (manualData.paymentMethod === "wise" && !manualData.wiseEmail) {
      setError("Please provide Wise email");
      return;
    }
    if (manualData.paymentMethod === "cryptocurrency" && !manualData.cryptoWalletAddress) {
      setError("Please provide cryptocurrency wallet address");
      return;
    }
    if (manualData.paymentMethod === "other" && !manualData.otherGatewayName) {
      setError("Please provide payment gateway name");
      return;
    }

    setError(null);

    try {
      await updateMutation.mutateAsync({
        methodId,
        data: {
          paymentMethod: manualData.paymentMethod,
          paymentGatewayName: manualData.paymentMethod === "other" 
            ? manualData.otherGatewayName 
            : manualData.paymentMethod.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
          paymentInstructions: manualData.paymentInstructions,
          bankName: manualData.bankName,
          accountName: manualData.accountName,
          accountNumber: manualData.accountNumber,
          swiftCode: manualData.swiftCode,
          branchCode: manualData.branchCode,
          mobileMoneyProvider: manualData.mobileMoneyProvider,
          mobileMoneyNumber: manualData.mobileMoneyNumber,
          mobileMoneyName: manualData.mobileMoneyName,
          paypalEmail: manualData.paypalEmail,
          wiseEmail: manualData.wiseEmail,
          cryptoWalletAddress: manualData.cryptoWalletAddress,
          cryptoNetwork: manualData.cryptoNetwork,
          otherGatewayName: manualData.otherGatewayName,
          additionalInfo: manualData.additionalInfo,
        },
      });
      
      toast.success("Success", "Payment configuration updated successfully!");
      router.push('/payments');
    } catch (err) {
      console.error("Failed to update payment configuration:", err);
      toast.error("Error", "Failed to update configuration. Please try again.");
    }
  };

  return (
    <AuthGuard>
      <div className="min-h-screen" style={{ backgroundColor: "#F5F5F5" }}>
        <main>
          <div className="max-w-3xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
            {/* Back Button */}
            <button
              onClick={() => router.push('/payments')}
              className="mb-6 flex items-center text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Payments
            </button>

            {/* Page Header */}
            <div className="mb-6">
              <h2 className="text-2xl font-normal text-black">
                Edit Payment Configuration
              </h2>
              <p className="text-sm text-gray-600 mt-2">
                Update your payment method details
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-6 p-4 rounded-lg border-l-4 border-red-500 bg-red-50">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Edit Form - Reuse the manual payment form structure */}
            <div className="bg-white rounded-2xl p-6" style={{ border: '1px solid #171717' }}>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Payment Method Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Payment Method <span className="text-red-500">*</span>
                  </label>
                  <Select
                    value={manualData.paymentMethod}
                    onValueChange={(value) => setManualData({ ...manualData, paymentMethod: value })}
                    disabled={loading}
                  >
                    <SelectTrigger className="w-full" style={{ border: '1px solid #171717' }}>
                      <SelectValue placeholder="Select payment method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="mobile_money">Mobile Money</SelectItem>
                      <SelectItem value="paypal">PayPal</SelectItem>
                      <SelectItem value="wise">Wise</SelectItem>
                      <SelectItem value="cryptocurrency">Cryptocurrency</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Payment Instructions */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Payment Instructions <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={manualData.paymentInstructions}
                    onChange={(e) => setManualData({ ...manualData, paymentInstructions: e.target.value })}
                    rows={4}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    placeholder="Provide detailed payment instructions for your clients..."
                    required
                    disabled={loading}
                    style={{ border: '1px solid #171717' }}
                  />
                </div>

                {/* Conditional fields based on payment method - same as setup page */}
                {/* Bank Transfer Fields */}
                {manualData.paymentMethod === 'bank_transfer' && (
                  <div className="border-t border-gray-200 pt-6">
                    <h3 className="text-sm font-semibold text-gray-900 mb-4">Bank Transfer Details</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Bank Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={manualData.bankName}
                          onChange={(e) => setManualData({ ...manualData, bankName: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="e.g., Equity Bank, Chase Bank"
                          required
                          disabled={loading}
                          style={{ border: '1px solid #171717' }}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Account Name
                        </label>
                        <input
                          type="text"
                          value={manualData.accountName}
                          onChange={(e) => setManualData({ ...manualData, accountName: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="Account holder name"
                          disabled={loading}
                          style={{ border: '1px solid #171717' }}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Account Number <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={manualData.accountNumber}
                          onChange={(e) => setManualData({ ...manualData, accountNumber: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="1234567890"
                          required
                          disabled={loading}
                          style={{ border: '1px solid #171717' }}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          SWIFT/BIC Code
                        </label>
                        <input
                          type="text"
                          value={manualData.swiftCode}
                          onChange={(e) => setManualData({ ...manualData, swiftCode: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="For international transfers"
                          disabled={loading}
                          style={{ border: '1px solid #171717' }}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Branch Code
                        </label>
                        <input
                          type="text"
                          value={manualData.branchCode}
                          onChange={(e) => setManualData({ ...manualData, branchCode: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="Branch code (if applicable)"
                          disabled={loading}
                          style={{ border: '1px solid #171717' }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Mobile Money Fields */}
                {manualData.paymentMethod === 'mobile_money' && (
                  <div className="border-t border-gray-200 pt-6">
                    <h3 className="text-sm font-semibold text-gray-900 mb-4">Mobile Money Details</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Provider <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={manualData.mobileMoneyProvider}
                          onChange={(e) => setManualData({ ...manualData, mobileMoneyProvider: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="e.g., M-Pesa, Airtel Money, MTN Mobile Money"
                          required
                          disabled={loading}
                          style={{ border: '1px solid #171717' }}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Mobile Number <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="tel"
                          value={manualData.mobileMoneyNumber}
                          onChange={(e) => setManualData({ ...manualData, mobileMoneyNumber: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="+254 712 345 678"
                          required
                          disabled={loading}
                          style={{ border: '1px solid #171717' }}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Account Name
                        </label>
                        <input
                          type="text"
                          value={manualData.mobileMoneyName}
                          onChange={(e) => setManualData({ ...manualData, mobileMoneyName: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="Registered account name"
                          disabled={loading}
                          style={{ border: '1px solid #171717' }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* PayPal Fields */}
                {manualData.paymentMethod === 'paypal' && (
                  <div className="border-t border-gray-200 pt-6">
                    <h3 className="text-sm font-semibold text-gray-900 mb-4">PayPal Details</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          PayPal Email <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="email"
                          value={manualData.paypalEmail}
                          onChange={(e) => setManualData({ ...manualData, paypalEmail: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="your@email.com"
                          required
                          disabled={loading}
                          style={{ border: '1px solid #171717' }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Wise Fields */}
                {manualData.paymentMethod === 'wise' && (
                  <div className="border-t border-gray-200 pt-6">
                    <h3 className="text-sm font-semibold text-gray-900 mb-4">Wise Details</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Wise Email <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="email"
                          value={manualData.wiseEmail}
                          onChange={(e) => setManualData({ ...manualData, wiseEmail: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="your@email.com"
                          required
                          disabled={loading}
                          style={{ border: '1px solid #171717' }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Cryptocurrency Fields */}
                {manualData.paymentMethod === 'cryptocurrency' && (
                  <div className="border-t border-gray-200 pt-6">
                    <h3 className="text-sm font-semibold text-gray-900 mb-4">Cryptocurrency Details</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Wallet Address <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={manualData.cryptoWalletAddress}
                          onChange={(e) => setManualData({ ...manualData, cryptoWalletAddress: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                          placeholder="0x..."
                          required
                          disabled={loading}
                          style={{ border: '1px solid #171717' }}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Network/Chain
                        </label>
                        <input
                          type="text"
                          value={manualData.cryptoNetwork}
                          onChange={(e) => setManualData({ ...manualData, cryptoNetwork: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="e.g., Bitcoin, Ethereum, USDT (ERC-20)"
                          disabled={loading}
                          style={{ border: '1px solid #171717' }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Other Payment Method Fields */}
                {manualData.paymentMethod === 'other' && (
                  <div className="border-t border-gray-200 pt-6">
                    <h3 className="text-sm font-semibold text-gray-900 mb-4">Payment Gateway Details</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Gateway Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={manualData.otherGatewayName}
                          onChange={(e) => setManualData({ ...manualData, otherGatewayName: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="e.g., Venmo, Cash App, Zelle"
                          required
                          disabled={loading}
                          style={{ border: '1px solid #171717' }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Additional Information */}
                {manualData.paymentMethod && (
                  <div className="border-t border-gray-200 pt-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Additional Information
                      </label>
                      <textarea
                        value={manualData.additionalInfo}
                        onChange={(e) => setManualData({ ...manualData, additionalInfo: e.target.value })}
                        rows={3}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                        placeholder="Any other relevant payment information..."
                        disabled={loading}
                        style={{ border: '1px solid #171717' }}
                      />
                    </div>
                  </div>
                )}

                {/* Submit Button */}
                <div className="flex gap-4 pt-4">
                  <button
                    type="button"
                    onClick={() => router.push('/payments')}
                    className="flex-1 px-4 py-2 text-sm font-medium border rounded-lg transition-all duration-200 hover:scale-105"
                    style={{
                      border: '1px solid #171717',
                      backgroundColor: 'white'
                    }}
                    disabled={loading}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !manualData.paymentMethod || !manualData.paymentInstructions}
                    className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                      !loading && manualData.paymentMethod && manualData.paymentInstructions
                        ? 'email-button hover:scale-105'
                        : 'bg-gray-200 cursor-not-allowed text-gray-500'
                    }`}
                  >
                    {loading ? (
                      <div className="flex items-center justify-center">
                        <LoadingSpinner size="sm" />
                        <span className="ml-2">Updating...</span>
                      </div>
                    ) : (
                      'Update Configuration'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
