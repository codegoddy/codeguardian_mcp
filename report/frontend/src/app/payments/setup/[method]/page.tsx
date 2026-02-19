"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useCreatePaystackMethod, useCreateManualMethod } from "../../../../hooks/usePayments";
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

export default function PaymentSetup() {
  const router = useRouter();
  const params = useParams();
  const method = params.method as string;
  
  const [error, setError] = useState<string | null>(null);
  
  // Use payment mutations
  const createPaystackMutation = useCreatePaystackMethod();
  const createManualMutation = useCreateManualMethod();
  
  const loading = createPaystackMutation.isPending || createManualMutation.isPending;

  // Paystack form state
  const [paystackData, setPaystackData] = useState({
    businessName: "",
    settlementBank: "",
    accountNumber: "",
  });

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

  const isPaystack = method === "paystack";
  const isManual = method === "manual";

  if (!isPaystack && !isManual) {
    return (
      <AuthGuard>
        <div className="min-h-screen" style={{ backgroundColor: "#F5F5F5" }}>
          <main>
            <div className="max-w-3xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
              <div className="bg-white rounded-2xl p-6 text-center">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Invalid Payment Method</h2>
                <p className="text-gray-600 mb-6">The payment method you&apos;re trying to set up is not supported.</p>
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

  const handlePaystackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!paystackData.businessName || !paystackData.settlementBank || !paystackData.accountNumber) {
      setError("Please fill in all required fields");
      return;
    }

    setError(null);

    try {
      await createPaystackMutation.mutateAsync({
        businessName: paystackData.businessName,
        settlementBank: paystackData.settlementBank,
        accountNumber: paystackData.accountNumber,
      });
      
      toast.success("Success", "Paystack configuration saved successfully!");
      router.push('/payments');
    } catch (err) {
      console.error("Failed to create Paystack configuration:", err);
      toast.error("Error", "Failed to save configuration. Please try again.");
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
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
      await createManualMutation.mutateAsync({
        paymentMethod: manualData.paymentMethod,
        paymentGatewayName: manualData.paymentMethod === "other" 
          ? manualData.otherGatewayName 
          : manualData.paymentMethod.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
        paymentInstructions: manualData.paymentInstructions,
        // Bank Transfer
        bankName: manualData.bankName,
        accountName: manualData.accountName,
        accountNumber: manualData.accountNumber,
        swiftCode: manualData.swiftCode,
        branchCode: manualData.branchCode,
        // Mobile Money
        mobileMoneyProvider: manualData.mobileMoneyProvider,
        mobileMoneyNumber: manualData.mobileMoneyNumber,
        mobileMoneyName: manualData.mobileMoneyName,
        // PayPal
        paypalEmail: manualData.paypalEmail,
        // Wise
        wiseEmail: manualData.wiseEmail,
        // Cryptocurrency
        cryptoWalletAddress: manualData.cryptoWalletAddress,
        cryptoNetwork: manualData.cryptoNetwork,
        // Other
        otherGatewayName: manualData.otherGatewayName,
        additionalInfo: manualData.additionalInfo,
      });
      
      toast.success("Success", "Manual payment configuration saved successfully!");
      router.push('/payments');
    } catch (err) {
      console.error("Failed to save manual payment configuration:", err);
      toast.error("Error", "Failed to save configuration. Please try again.");
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
                {isPaystack ? "Setup Paystack" : "Setup Manual Payments"}
              </h2>
              <p className="text-sm text-gray-600 mt-2">
                {isPaystack 
                  ? "Configure your Paystack subaccount to receive automated payments"
                  : "Set up custom payment instructions for your clients"}
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

            {/* Paystack Setup Form */}
            {isPaystack && (
              <div className="bg-white rounded-2xl p-6" style={{ border: '1px solid #171717' }}>
                <form onSubmit={handlePaystackSubmit} className="space-y-6">
                  {/* Info Banner */}
                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-blue-800">Automatic Subaccount Creation</h3>
                        <div className="mt-2 text-sm text-blue-700">
                          <p>We&apos;ll automatically create a Paystack subaccount for you. Just provide your bank details below and we&apos;ll handle the rest.</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Business Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Business Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={paystackData.businessName}
                      onChange={(e) => setPaystackData({ ...paystackData, businessName: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Your Business Name"
                      required
                      disabled={loading}
                      style={{ border: '1px solid #171717' }}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      This will appear on payment receipts and invoices
                    </p>
                  </div>

                  {/* Settlement Bank */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Settlement Bank <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={paystackData.settlementBank}
                      onChange={(e) => setPaystackData({ ...paystackData, settlementBank: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="e.g., Equity Bank, KCB Bank, Co-operative Bank"
                      required
                      disabled={loading}
                      style={{ border: '1px solid #171717' }}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      The bank where payments will be settled (must be a Kenyan bank)
                    </p>
                  </div>

                  {/* Account Number */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Account Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={paystackData.accountNumber}
                      onChange={(e) => setPaystackData({ ...paystackData, accountNumber: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="1234567890"
                      required
                      disabled={loading}
                      style={{ border: '1px solid #171717' }}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Your bank account number where funds will be settled
                    </p>
                  </div>

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
                      disabled={loading || !paystackData.businessName || !paystackData.settlementBank || !paystackData.accountNumber}
                      className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                        !loading && paystackData.businessName && paystackData.settlementBank && paystackData.accountNumber
                          ? 'email-button hover:scale-105'
                          : 'bg-gray-200 cursor-not-allowed text-gray-500'
                      }`}
                    >
                      {loading ? (
                        <div className="flex items-center justify-center">
                          <LoadingSpinner size="sm" />
                          <span className="ml-2">Creating Subaccount...</span>
                        </div>
                      ) : (
                        'Create Subaccount'
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Manual Payment Setup Form */}
            {isManual && (
              <div className="bg-white rounded-2xl p-6" style={{ border: '1px solid #171717' }}>
                <form onSubmit={handleManualSubmit} className="space-y-6">
                  {/* Info Banner */}
                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1 a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-blue-800">Flexible Payment Setup</h3>
                        <div className="mt-2 text-sm text-blue-700">
                          <p>Choose your payment method and provide the necessary details for your clients.</p>
                        </div>
                      </div>
                    </div>
                  </div>

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
                    <p className="text-xs text-gray-500 mt-1">
                      Select the payment method you want to configure
                    </p>
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
                    <p className="text-xs text-gray-500 mt-1">
                      These instructions will be shown to clients on invoices
                    </p>
                  </div>

                  {/* Bank Transfer Fields */}
                  {manualData.paymentMethod === 'bank_transfer' && (
                    <div className="border-t border-gray-200 pt-6">
                      <h3 className="text-sm font-semibold text-gray-900 mb-4">
                        Bank Transfer Details
                      </h3>
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
                            Account Name <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={manualData.accountName}
                            onChange={(e) => setManualData({ ...manualData, accountName: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Account holder name"
                            required
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
                      <h3 className="text-sm font-semibold text-gray-900 mb-4">
                        Mobile Money Details
                      </h3>
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
                            Account Name <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={manualData.mobileMoneyName}
                            onChange={(e) => setManualData({ ...manualData, mobileMoneyName: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Registered account name"
                            required
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
                      <h3 className="text-sm font-semibold text-gray-900 mb-4">
                        PayPal Details
                      </h3>
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
                          <p className="text-xs text-gray-500 mt-1">
                            The email address associated with your PayPal account
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Wise Fields */}
                  {manualData.paymentMethod === 'wise' && (
                    <div className="border-t border-gray-200 pt-6">
                      <h3 className="text-sm font-semibold text-gray-900 mb-4">
                        Wise Details
                      </h3>
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
                          <p className="text-xs text-gray-500 mt-1">
                            The email address associated with your Wise account
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Cryptocurrency Fields */}
                  {manualData.paymentMethod === 'cryptocurrency' && (
                    <div className="border-t border-gray-200 pt-6">
                      <h3 className="text-sm font-semibold text-gray-900 mb-4">
                        Cryptocurrency Details
                      </h3>
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
                            Network/Chain <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={manualData.cryptoNetwork}
                            onChange={(e) => setManualData({ ...manualData, cryptoNetwork: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="e.g., Bitcoin, Ethereum, USDT (ERC-20)"
                            required
                            disabled={loading}
                            style={{ border: '1px solid #171717' }}
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Specify the cryptocurrency and network
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Other Payment Method Fields */}
                  {manualData.paymentMethod === 'other' && (
                    <div className="border-t border-gray-200 pt-6">
                      <h3 className="text-sm font-semibold text-gray-900 mb-4">
                        Payment Gateway Details
                      </h3>
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

                  {/* Additional Information (for all methods) */}
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
                          <span className="ml-2">Saving...</span>
                        </div>
                      ) : (
                        'Save Configuration'
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
