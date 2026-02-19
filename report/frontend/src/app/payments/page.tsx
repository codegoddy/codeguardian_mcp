"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  usePaymentMethods,
  useDeletePaymentMethod,
} from "../../hooks/usePayments";
import AuthGuard from "../../components/AuthGuard";
import LoadingSpinner from "../../components/LoadingSpinner";
import Image from "next/image";
import { toast } from "../../lib/toast";

const PAYMENT_PROVIDERS = [
  {
    id: "paystack",
    name: "Paystack",
    description:
      "Accept payments from clients in Kenya with automated payment processing and subaccounts",
    logo: "/paystack.png",
    color: "#00C3F7",
    availability: "Kenya only",
    comingSoon: true,
    features: [
      "Automated payment collection",
      "Subaccount management",
      "Real-time payment notifications",
      "Automatic invoice generation",
      "Split payments support",
    ],
  },
  {
    id: "manual",
    name: "Manual Payments",
    description:
      "Set up custom payment instructions for bank transfers, PayPal, Wise, or any payment method",
    logo: "/manual payment.png",
    color: "#6B7280",
    availability: "Available worldwide",
    features: [
      "Custom payment instructions",
      "Flexible payment methods",
      "Bank transfer details",
      "PayPal, Wise, or any gateway",
      "Manual invoice tracking",
    ],
  },
];

export default function Payments() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"available" | "configured">(
    "available"
  );
  const [settingUpProvider, setSettingUpProvider] = useState<string | null>(null);

  // Use the payment methods hook with Redis caching
  const {
    data: paymentMethods = [],
    isLoading,
    error: queryError,
  } = usePaymentMethods();
  const deleteMutation = useDeletePaymentMethod();

  const error = queryError
    ? "Failed to load payment methods. Please try again."
    : null;

  const handleSetup = (providerId: string) => {
    // Set loading state for this provider
    setSettingUpProvider(providerId);
    // Navigate to setup page
    router.push(`/payments/setup/${providerId}`);
  };

  const handleRemove = async (methodId: string, methodType: string) => {
    if (
      !confirm(
        `Are you sure you want to remove this ${methodType} payment method? This will affect how clients pay you.`
      )
    ) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(methodId);
      toast.success("Removed", `Payment method removed successfully!`);
    } catch (err) {
      console.error(`Failed to remove payment method:`, err);
      toast.error("Error", `Failed to remove payment method. Please try again.`);
    }
  };

  const isRemoving = (methodId: string) => deleteMutation.isPending && deleteMutation.variables === methodId;

  const isConfigured = (providerId: string) => {
    return paymentMethods.some(
      (m) => m.method_type === providerId && m.is_active
    );
  };

  const getPaymentMethod = (providerId: string) => {
    return paymentMethods.find(
      (m) => m.method_type === providerId && m.is_active
    );
  };

  return (
    <AuthGuard>
      <div className="min-h-screen" style={{ backgroundColor: "#F5F5F5" }}>
        <main>
          <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
            {/* Page Header */}
            <div className="mb-6">
              <h2 className="text-2xl font-normal text-black">
                Payment Methods
              </h2>
              <p className="text-sm text-gray-600 mt-2">
                Configure how you receive payments from your clients
              </p>
            </div>

            {/* Tab Navigation */}
            <div className="mb-6">
              <nav className="flex space-x-8">
                <button
                  onClick={() => setActiveTab("available")}
                  className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors duration-200 ${
                    activeTab === "available"
                      ? "border-black text-black"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  Available Methods
                </button>
                <button
                  onClick={() => setActiveTab("configured")}
                  className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors duration-200 ${
                    activeTab === "configured"
                      ? "border-black text-black"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  Configured ({paymentMethods.filter((m) => m.is_active).length}
                  )
                </button>
              </nav>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-6 p-4 rounded-lg border-l-4 border-red-500 bg-red-50">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg
                      className="h-5 w-5 text-red-400"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Loading State */}
            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <div className="flex items-center">
                  <LoadingSpinner />
                  <span className="ml-3 text-gray-600">
                    Loading payment methods...
                  </span>
                </div>
              </div>
            )}

            {/* Available Payment Methods Tab */}
            {!isLoading && activeTab === "available" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {PAYMENT_PROVIDERS.map((provider) => {
                  const configured = isConfigured(provider.id);
                  const method = getPaymentMethod(provider.id);

                  return (
                    <div
                      key={provider.id}
                      className="bg-white rounded-2xl p-6 flex flex-col h-full hover:shadow-lg transition-shadow duration-200"
                      style={{ border: "1px solid #171717" }}
                    >
                      {/* Provider Header */}
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          <div className="relative w-12 h-12 flex-shrink-0">
                            <Image
                              src={provider.logo}
                              alt={`${provider.name} logo`}
                              width={48}
                              height={48}
                              className="rounded-lg"
                            />
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-gray-900">
                              {provider.name}
                            </h3>
                            {configured && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                Configured
                              </span>
                            )}
                            {'comingSoon' in provider && provider.comingSoon && !configured && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                                Coming Soon
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Availability Badge */}
                      <div className="mb-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            provider.id === "paystack"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-green-100 text-green-800"
                          }`}
                        >
                          {provider.availability}
                        </span>
                      </div>

                      {/* Description */}
                      <p className="text-sm text-gray-600 mb-4 flex-grow">
                        {provider.description}
                      </p>

                      {/* Features */}
                      <div className="mb-6">
                        <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                          Features
                        </h4>
                        <ul className="space-y-1">
                          {provider.features.map((feature, index) => (
                            <li
                              key={index}
                              className="flex items-start text-sm text-gray-600"
                            >
                              <svg
                                className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                  clipRule="evenodd"
                                />
                              </svg>
                              {feature}
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Configured Info */}
                      {configured && method && (
                        <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                          <div className="text-xs text-gray-600">
                            {method.method_type === "paystack" &&
                              method.paystack_business_name && (
                                <div className="flex justify-between mb-1">
                                  <span className="font-medium">Business:</span>
                                  <span>{method.paystack_business_name}</span>
                                </div>
                              )}
                            {method.method_type === "manual" &&
                              method.payment_gateway_name && (
                                <div className="flex justify-between mb-1">
                                  <span className="font-medium">Gateway:</span>
                                  <span>{method.payment_gateway_name}</span>
                                </div>
                              )}
                            <div className="flex justify-between">
                              <span className="font-medium">Configured:</span>
                              <span>
                                {new Date(
                                  method.created_at
                                ).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Action Button */}
                      <div className="mt-auto">
                        {configured ? (
                          <div className="space-y-2">
                            <button
                              onClick={() => router.push(`/payments/edit/${method?.id}`)}
                              className="w-full px-4 py-2 text-sm font-medium border rounded-lg transition-all duration-200 hover:scale-105"
                              style={{
                                border: "1px solid #171717",
                                backgroundColor: "white",
                              }}
                            >
                              Edit Configuration
                            </button>
                            <button
                              onClick={() =>
                                method && handleRemove(method.id, provider.name)
                              }
                              disabled={deleteMutation.isPending}
                              className="w-full px-4 py-2 text-sm font-medium border rounded-lg transition-all duration-200 hover:scale-105 disabled:opacity-70 disabled:cursor-not-allowed"
                              style={{
                                border: "1px solid #dc2626",
                                color: "#dc2626",
                                backgroundColor: "white",
                              }}
                            >
                              {deleteMutation.isPending ? (
                                <div className="flex items-center justify-center">
                                  <LoadingSpinner size="sm" color="gray" />
                                  <span className="ml-2">Removing...</span>
                                </div>
                              ) : (
                                'Remove'
                              )}
                            </button>
                          </div>
                        ) : 'comingSoon' in provider && provider.comingSoon ? (
                          <button
                            disabled
                            className="w-full px-4 py-2 text-sm font-medium border rounded-lg cursor-not-allowed opacity-60"
                            style={{
                              border: '1px solid #9ca3af',
                              color: '#6b7280',
                              backgroundColor: '#f3f4f6'
                            }}
                          >
                            Coming Soon
                          </button>
                        ) : (
                          <button
                            onClick={() => handleSetup(provider.id)}
                            disabled={settingUpProvider === provider.id}
                            className={`w-full email-button px-4 py-2 text-sm font-medium transition-all duration-200 ${
                              settingUpProvider === provider.id
                                ? 'opacity-70 cursor-not-allowed'
                                : 'hover:scale-105'
                            }`}
                          >
                            {settingUpProvider === provider.id ? (
                              <div className="flex items-center justify-center">
                                <LoadingSpinner size="sm" />
                                <span className="ml-2">Setting up...</span>
                              </div>
                            ) : (
                              `Setup ${provider.name}`
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Configured Payment Methods Tab */}
            {!isLoading && activeTab === "configured" && (
              <div className="bg-white rounded-2xl p-6">
                {paymentMethods.filter((m) => m.is_active).length === 0 ? (
                  <div className="text-center py-12">
                    <div className="text-gray-400 mb-4">
                      <svg
                        className="mx-auto h-12 w-12"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                        />
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      No payment methods configured
                    </h3>
                    <p className="text-gray-500 mb-6">
                      Set up a payment method to start receiving payments from
                      clients.
                    </p>
                    <button
                      onClick={() => setActiveTab("available")}
                      className="px-4 py-2 text-sm font-medium email-button"
                    >
                      Browse Available Methods
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {paymentMethods
                      .filter((m) => m.is_active)
                      .map((method) => {
                        const provider = PAYMENT_PROVIDERS.find(
                          (p) => p.id === method.method_type
                        );
                        if (!provider) return null;

                        return (
                          <div
                            key={method.id}
                            className="flex items-center justify-between p-4 border rounded-lg hover:shadow-md transition-shadow"
                            style={{ border: "1px solid #171717" }}
                          >
                            <div className="flex items-center space-x-4">
                              <div className="relative w-10 h-10 flex-shrink-0">
                                <Image
                                  src={provider.logo}
                                  alt={`${provider.name} logo`}
                                  width={40}
                                  height={40}
                                  className="rounded"
                                />
                              </div>
                              <div>
                                <h4 className="text-base font-semibold text-gray-900">
                                  {provider.name}
                                </h4>
                                <p className="text-sm text-gray-600">
                                  {method.method_type === "paystack" &&
                                  method.paystack_business_name
                                    ? method.paystack_business_name
                                    : method.method_type === "manual" &&
                                        method.payment_gateway_name
                                      ? method.payment_gateway_name
                                      : "Configured"}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center space-x-4">
                              <div className="text-right">
                                <p className="text-xs text-gray-500">
                                  Configured
                                </p>
                                <p className="text-sm font-medium text-gray-900">
                                  {new Date(
                                    method.created_at
                                  ).toLocaleDateString()}
                                </p>
                              </div>
                              <button
                                onClick={() => router.push(`/payments/edit/${method.id}`)}
                                className="px-3 py-1.5 text-xs font-medium border rounded-lg transition-all duration-200 hover:scale-105"
                                style={{
                                  border: "1px solid #171717",
                                  backgroundColor: "white",
                                }}
                              >
                                Edit
                              </button>
                              <button
                                onClick={() =>
                                  handleRemove(method.id, provider.name)
                                }
                                disabled={deleteMutation.isPending}
                                className="px-3 py-1.5 text-xs font-medium border rounded-lg transition-all duration-200 hover:scale-105 disabled:opacity-70 disabled:cursor-not-allowed"
                                style={{
                                  border: "1px solid #dc2626",
                                  color: "#dc2626",
                                  backgroundColor: "white",
                                }}
                              >
                                {deleteMutation.isPending ? (
                                  <div className="flex items-center justify-center">
                                    <LoadingSpinner size="sm" color="gray" />
                                  </div>
                                ) : (
                                  'Remove'
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            )}

            {/* Info Section */}
            <div className="mt-8 bg-blue-50 rounded-2xl p-6 border border-blue-200">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-blue-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-blue-800">
                    Payment Method Guidelines
                  </h3>
                  <div className="mt-2 text-sm text-blue-700">
                    <ul className="list-disc list-inside space-y-1">
                      <li>
                        <strong>Paystack:</strong> Automated payments for Kenyan
                        users with subaccount support
                      </li>
                      <li>
                        <strong>Manual Payments:</strong> Set up custom
                        instructions for any payment gateway worldwide
                      </li>
                      <li>
                        You can configure multiple payment methods for different
                        clients
                      </li>
                      <li>
                        Payment methods are linked to clients when creating
                        projects
                      </li>
                      <li>
                        Invoices will include the appropriate payment
                        instructions based on client setup
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
