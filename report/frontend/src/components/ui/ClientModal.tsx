'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X, ExternalLink } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ClientCreate, Client } from '../../services/clients';
import { usePaymentMethods } from '../../hooks/usePayments';
import { useSettings } from '../../hooks/useSettings';
import { useCreateClient } from '../../hooks/useClients';
import { SelectField, SelectItem } from './Select';

interface ClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onClientCreated: (client: Client) => void;
}

export default function ClientModal({
  isOpen,
  onClose,
  onClientCreated,
}: ClientModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string>('');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    defaultHourlyRate: '',
    changeRequestRate: '',
  });

  // Use hooks for payment methods, settings and client creation
  const { data: paymentMethods = [], isLoading: loadingPaymentMethods } = usePaymentMethods();
  const { data: settings } = useSettings();
  const createClientMutation = useCreateClient();
  
  // Get user's currency from settings, default to USD
  const userCurrency = settings?.default_currency || 'USD';
  
  // Map currency codes to symbols, or use the code itself with proper spacing
  const getCurrencyDisplay = (currency: string) => {
    const symbolMap: Record<string, string> = {
      'USD': '$',
      'EUR': '€',
      'GBP': '£',
      'JPY': '¥',
      'CNY': '¥',
      'INR': '₹',
      'AUD': 'A$',
      'CAD': 'C$',
      'CHF': 'CHF',
      'SEK': 'kr',
      'NZD': 'NZ$',
    };
    return symbolMap[currency] || currency;
  };
  
  const currencySymbol = getCurrencyDisplay(userCurrency);

  useEffect(() => {
    if (isOpen) {
      // Reset form when modal opens
      setFormData({
        name: '',
        email: '',
        company: '',
        defaultHourlyRate: '',
        changeRequestRate: '',
      });
      setSelectedPaymentMethodId('');
    }
  }, [isOpen]);

  const getPaymentMethodLabel = (method: typeof paymentMethods[0]): string => {
    if (method.method_type === 'paystack') {
      return `Paystack${method.paystack_business_name ? ` - ${method.paystack_business_name}` : ''}`;
    } else {
      return `Manual${method.payment_gateway_name ? ` - ${method.payment_gateway_name}` : ' Payment'}`;
    }
  };

  const handleGoToPayments = () => {
    onClose();
    router.push('/payments');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.email || !formData.defaultHourlyRate || !formData.changeRequestRate || !selectedPaymentMethodId) {
      return;
    }

    setLoading(true);

    try {
      const selectedMethod = paymentMethods.find(m => m.id.toString() === selectedPaymentMethodId);
      if (!selectedMethod) {
        alert('Please select a valid payment method');
        setLoading(false);
        return;
      }

      const clientData: ClientCreate = {
        name: formData.name,
        email: formData.email,
        company: formData.company || undefined,
        default_hourly_rate: parseFloat(formData.defaultHourlyRate),
        change_request_rate: parseFloat(formData.changeRequestRate),
        payment_method: selectedMethod.method_type,
        payment_gateway_name: selectedMethod.payment_gateway_name || undefined,
        payment_instructions: selectedMethod.payment_instructions || undefined,
        paystack_subaccount_code: selectedMethod.paystack_subaccount_code || undefined,
        paystack_customer_code: undefined, // This can be set later if needed
      };

      const newClient = await createClientMutation.mutateAsync(clientData);
      onClientCreated(newClient);

      // Reset form
      setFormData({
        name: '',
        email: '',
        company: '',
        defaultHourlyRate: '',
        changeRequestRate: '',
      });
      setSelectedPaymentMethodId('');
      onClose();
    } catch (error) {
      console.error('Failed to create client:', error);
      alert('Failed to create client. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setFormData({
        name: '',
        email: '',
        company: '',
        defaultHourlyRate: '',
        changeRequestRate: '',
      });
      setSelectedPaymentMethodId('');
      onClose();
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={handleClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl p-6 w-full max-w-lg z-50 max-h-[90vh] overflow-y-auto"
          style={{
            border: '1px solid #171717',
            boxShadow: '2px 2px 0px #171717'
          }}
        >
          <div className="flex items-start justify-between mb-4">
            <div>
              <Dialog.Title className="text-xl font-semibold text-gray-900">
                Create New Client
              </Dialog.Title>
              <Dialog.Description className="text-sm text-gray-600 mt-1">
                Add a new client to your project management system
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Close"
                disabled={loading}
              >
                <X size={20} />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Client Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Client Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter client name"
                required
                disabled={loading}
                style={{ border: '1px solid #171717' }}
              />
            </div>

            {/* Client Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="client@example.com"
                required
                disabled={loading}
                style={{ border: '1px solid #171717' }}
              />
            </div>

            {/* Company */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Company
              </label>
              <input
                type="text"
                value={formData.company}
                onChange={(e) => setFormData(prev => ({ ...prev, company: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Company name (optional)"
                disabled={loading}
                style={{ border: '1px solid #171717' }}
              />
            </div>

            {/* Default Hourly Rate */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Default Hourly Rate ({userCurrency}) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">
                  {currencySymbol}
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.defaultHourlyRate}
                  onChange={(e) => setFormData(prev => ({ ...prev, defaultHourlyRate: e.target.value }))}
                  className="w-full pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="75.00"
                  required
                  disabled={loading}
                  style={{ 
                    border: '1px solid #171717',
                    paddingLeft: currencySymbol.length > 1 ? '3.5rem' : '2rem'
                  }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Standard hourly rate for this client
              </p>
            </div>

            {/* Change Request Rate */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Change Request Rate ({userCurrency} /hour) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">
                  {currencySymbol}
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.changeRequestRate}
                  onChange={(e) => setFormData(prev => ({ ...prev, changeRequestRate: e.target.value }))}
                  className="w-full pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="100.00"
                  required
                  disabled={loading}
                  style={{ 
                    border: '1px solid #171717',
                    paddingLeft: currencySymbol.length > 1 ? '3.5rem' : '2rem'
                  }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Hourly rate for change requests and additional work
              </p>
            </div>

            {/* Payment Method Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Payment Method <span className="text-red-500">*</span>
              </label>
              
              {loadingPaymentMethods ? (
                <div className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 text-sm">
                  Loading payment methods...
                </div>
              ) : paymentMethods.length === 0 ? (
                <div className="space-y-3">
                  <div className="w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 text-center">
                    <p className="text-sm text-gray-600 mb-2">
                      No payment methods configured yet
                    </p>
                    <button
                      type="button"
                      onClick={handleGoToPayments}
                      className="inline-flex items-center gap-2 text-sm font-medium text-purple-600 hover:text-purple-700 hover:underline transition-all duration-200 hover:gap-3"
                    >
                      <ExternalLink size={16} className="transition-transform duration-200 group-hover:translate-x-0.5" />
                      Configure Payment Methods
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">
                    You need to set up at least one payment method in the Payments page before creating clients.
                  </p>
                </div>
              ) : (
                <>
                  <SelectField
                    placeholder="Select a configured payment method"
                    required
                    disabled={loading}
                    value={selectedPaymentMethodId}
                    onValueChange={setSelectedPaymentMethodId}
                  >
                    {paymentMethods.map((method) => (
                      <SelectItem key={method.id} value={method.id.toString()}>
                        {getPaymentMethodLabel(method)}
                      </SelectItem>
                    ))}
                  </SelectField>
                  <p className="text-xs text-gray-500 mt-1">
                    Select from your configured payment methods. 
                    <button
                      type="button"
                      onClick={handleGoToPayments}
                      className="ml-1 text-purple-600 hover:text-purple-700 inline-flex items-center gap-1"
                    >
                      Manage payment methods
                      <ExternalLink size={12} />
                    </button>
                  </p>
                </>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 px-4 py-2 text-sm font-medium black-button"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !formData.name || !formData.email || !formData.defaultHourlyRate || !formData.changeRequestRate || !selectedPaymentMethodId || paymentMethods.length === 0}
                className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                  !loading && formData.name && formData.email && formData.defaultHourlyRate && formData.changeRequestRate && selectedPaymentMethodId && paymentMethods.length > 0
                    ? 'email-button shadow-lg transform hover:-translate-y-0.5'
                    : 'bg-gray-200 cursor-not-allowed text-gray-500'
                }`}
              >
                {loading ? 'Creating...' : 'Create Client'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
