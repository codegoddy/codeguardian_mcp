'use client';

import { useState, useEffect } from 'react';
import { subscriptionsApi, SubscriptionPlan, Subscription } from '@/services/subscriptions';

export default function SubscriptionPage() {
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [currentSubscription, setCurrentSubscription] = useState<Subscription | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [plansData, subscription] = await Promise.all([
        subscriptionsApi.getPlans(),
        subscriptionsApi.getCurrentSubscription(),
      ]);
      setPlans(plansData.plans);
      setCurrentSubscription(subscription);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load subscription data');
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async (planId: string) => {
    if (planId === 'free') {
      // Downgrade to free
      try {
        setError(null);
        setSuccess(null);
        await subscriptionsApi.subscribe({
          plan: 'free',
          payment_method: 'none',
        });
        setSuccess('Successfully downgraded to Free plan');
        await loadData();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to downgrade plan');
      }
      return;
    }

    // For paid plans, redirect to payment
    // In a real implementation, this would integrate with Paystack
    alert('Payment integration coming soon! This would redirect to Paystack payment page.');
  };

  const handleCancel = async () => {
    try {
      setError(null);
      setSuccess(null);
      await subscriptionsApi.cancel({ reason: cancelReason });
      setSuccess('Subscription cancelled successfully. Access will continue until expiration date.');
      setShowCancelModal(false);
      setCancelReason('');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel subscription');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-8"></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-lg shadow p-6 h-96"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Subscription Plans</h1>
          <p className="text-gray-600">Choose the plan that works best for you</p>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-6 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
            {success}
          </div>
        )}

        {/* Current Subscription Status */}
        {currentSubscription && (
          <div className="mb-8 bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Current Subscription</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-600">Plan</p>
                <p className="text-lg font-semibold capitalize">{currentSubscription.plan}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Status</p>
                <p className="text-lg font-semibold capitalize">{currentSubscription.status}</p>
              </div>
              {currentSubscription.expires_at && (
                <div>
                  <p className="text-sm text-gray-600">Expires</p>
                  <p className="text-lg font-semibold">
                    {new Date(currentSubscription.expires_at).toLocaleDateString()}
                  </p>
                </div>
              )}
            </div>
            {currentSubscription.plan !== 'free' && currentSubscription.status === 'active' && (
              <button
                onClick={() => setShowCancelModal(true)}
                className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Cancel Subscription
              </button>
            )}
          </div>
        )}

        {/* Plan Comparison */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const isCurrentPlan = currentSubscription?.plan === plan.id;
            const isFree = plan.id === 'free';

            return (
              <div
                key={plan.id}
                className={`bg-white rounded-lg shadow-lg overflow-hidden ${
                  isCurrentPlan ? 'ring-2 ring-blue-500' : ''
                }`}
              >
                {/* Plan Header */}
                <div className={`p-6 ${isFree ? 'bg-gray-100' : 'bg-gradient-to-br from-blue-500 to-blue-600 text-white'}`}>
                  <h3 className={`text-2xl font-bold mb-2 ${isFree ? 'text-gray-900' : ''}`}>
                    {plan.name}
                  </h3>
                  <p className={`text-sm mb-4 ${isFree ? 'text-gray-600' : 'text-blue-100'}`}>
                    {plan.description}
                  </p>
                  <div className="flex items-baseline">
                    <span className={`text-4xl font-bold ${isFree ? 'text-gray-900' : ''}`}>
                      ${plan.price}
                    </span>
                    <span className={`ml-2 ${isFree ? 'text-gray-600' : 'text-blue-100'}`}>
                      /{plan.billing_period}
                    </span>
                  </div>
                </div>

                {/* Features */}
                <div className="p-6">
                  <ul className="space-y-3 mb-6">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="flex items-start">
                        <svg
                          className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        <span className="text-sm text-gray-700">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Action Button */}
                  {isCurrentPlan ? (
                    <button
                      disabled
                      className="w-full py-3 px-4 bg-gray-300 text-gray-600 rounded-lg font-semibold cursor-not-allowed"
                    >
                      Current Plan
                    </button>
                  ) : (
                    <button
                      onClick={() => handleUpgrade(plan.id)}
                      className={`w-full py-3 px-4 rounded-lg font-semibold transition-colors ${
                        isFree
                          ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                    >
                      {isFree ? 'Downgrade' : 'Upgrade'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Payment History */}
        {currentSubscription && currentSubscription.plan !== 'free' && (
          <div className="mt-8 bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Payment History</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Plan
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  <tr>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(currentSubscription.started_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 capitalize">
                      {currentSubscription.plan}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ${currentSubscription.amount || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                        Paid
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Cancel Confirmation Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold mb-4">Cancel Subscription</h3>
            <p className="text-gray-600 mb-4">
              Are you sure you want to cancel your subscription? You will continue to have access
              until the end of your billing period.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason for cancellation (optional)
              </label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="Help us improve by telling us why you're cancelling..."
              />
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowCancelModal(false);
                  setCancelReason('');
                }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                Keep Subscription
              </button>
              <button
                onClick={handleCancel}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Cancel Subscription
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
