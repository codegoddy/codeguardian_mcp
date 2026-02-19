'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import ApiService from '@/services/api';
import { toast as sonnerToast } from 'sonner';

interface Bank {
  id: string;
  name: string;
  code: string;
  slug: string;
}

interface Subaccount {
  id: string;
  user_id: string;
  subaccount_code: string;
  business_name: string;
  settlement_bank: string;
  account_number: string;
  percentage_charge: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export default function PaymentSettingsPage() {
  const router = useRouter();
  
  const [banks, setBanks] = useState<Bank[]>([]);
  const [subaccount, setSubaccount] = useState<Subaccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingBanks, setLoadingBanks] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    business_name: '',
    settlement_bank: '',
    account_number: '',
    percentage_charge: '1.50',
  });

  // Load banks and existing subaccount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch existing subaccount
        try {
          const subaccountData = await ApiService.get<Subaccount>('/api/paystack/subaccounts');
          if (subaccountData) {
            setSubaccount(subaccountData);
            setFormData({
              business_name: subaccountData.business_name,
              settlement_bank: subaccountData.settlement_bank,
              account_number: subaccountData.account_number,
              percentage_charge: subaccountData.percentage_charge.toString(),
            });
          }
        } catch {
          // No subaccount exists yet or other error
          console.log('No active subaccount found or fetch failed');
        }

        // Fetch banks
        setLoadingBanks(true);
        try {
          const banksData = await ApiService.get<Bank[]>('/api/paystack/banks');
          if (banksData) {
            setBanks(banksData);
          }
        } catch {
          console.error('Failed to fetch banks');
          sonnerToast.error('Failed to load bank list');
        }
      } catch (error) {
        sonnerToast.error('Failed to load payment settings');
        console.error('Error loading payment settings:', error);
      } finally {
        setLoading(false);
        setLoadingBanks(false);
      }
    };
    
    fetchData();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const endpoint = '/api/paystack/subaccounts';
      const data = {
        business_name: formData.business_name,
        settlement_bank: formData.settlement_bank,
        account_number: formData.account_number,
        percentage_charge: parseFloat(formData.percentage_charge),
      };

      let result: Subaccount;
      if (subaccount) {
        result = await ApiService.put<Subaccount>(endpoint, data);
        sonnerToast.success('Subaccount updated successfully');
      } else {
        result = await ApiService.post<Subaccount>(endpoint, data);
        sonnerToast.success('Subaccount created successfully');
      }

      setSubaccount(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save subaccount';
      sonnerToast.error(errorMessage);
      console.error('Error saving subaccount:', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading payment settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/settings')}
            className="text-blue-600 hover:text-blue-700 mb-4 flex items-center"
          >
            ← Back to Settings
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Payment Settings</h1>
          <p className="mt-2 text-gray-600">
            Configure your Paystack subaccount to receive payments directly to your bank account
          </p>
        </div>

        {/* Info Banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800">About Paystack Subaccounts</h3>
              <div className="mt-2 text-sm text-blue-700">
                <p>
                  Paystack subaccounts allow you to receive payments directly to your bank account.
                  The platform charges a {formData.percentage_charge}% fee on transactions.
                  Subscribers can have this fee waived.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Subaccount Status */}
        {subaccount && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-green-800">Subaccount Active</h3>
                <div className="mt-1 text-sm text-green-700">
                  <p>Your Paystack subaccount is configured and ready to receive payments.</p>
                  <p className="mt-1"><strong>Subaccount Code:</strong> {subaccount.subaccount_code}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Subaccount Form */}
        <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg p-6" style={{ border: '1px solid #171717', boxShadow: '2px 2px 0px #171717' }}>
          <h2 className="text-xl font-semibold text-gray-900 mb-6">
            {subaccount ? 'Update Subaccount' : 'Create Subaccount'}
          </h2>
          
          <div className="space-y-6">
            {/* Business Name */}
            <div>
              <label htmlFor="business_name" className="block text-sm font-medium text-gray-700 mb-2">
                Business Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="business_name"
                name="business_name"
                value={formData.business_name}
                onChange={handleInputChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Your business or personal name"
              />
              <p className="mt-1 text-sm text-gray-500">
                This will appear on payment receipts
              </p>
            </div>

            {/* Settlement Bank */}
            <div>
              <label htmlFor="settlement_bank" className="block text-sm font-medium text-gray-700 mb-2">
                Settlement Bank <span className="text-red-500">*</span>
              </label>
              <Select
                value={formData.settlement_bank}
                onValueChange={(value) => handleSelectChange("settlement_bank", value)}
                required
                disabled={loadingBanks}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={loadingBanks ? 'Loading banks...' : 'Select your bank'} />
                </SelectTrigger>
                <SelectContent>
                  {banks.map((bank) => (
                    <SelectItem key={bank.id} value={bank.code}>
                      {bank.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-sm text-gray-500">
                Select the bank where you want to receive payments
              </p>
            </div>

            {/* Account Number */}
            <div>
              <label htmlFor="account_number" className="block text-sm font-medium text-gray-700 mb-2">
                Account Number <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="account_number"
                name="account_number"
                value={formData.account_number}
                onChange={handleInputChange}
                required
                maxLength={10}
                pattern="[0-9]{10}"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="1234567890"
              />
              <p className="mt-1 text-sm text-gray-500">
                Enter your 10-digit bank account number
              </p>
            </div>

            {/* Percentage Charge */}
            <div>
              <label htmlFor="percentage_charge" className="block text-sm font-medium text-gray-700 mb-2">
                Platform Fee (%)
              </label>
              <input
                type="number"
                id="percentage_charge"
                name="percentage_charge"
                value={formData.percentage_charge}
                onChange={handleInputChange}
                step="0.01"
                min="0"
                max="100"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                readOnly
              />
              <p className="mt-1 text-sm text-gray-500">
                Platform fee charged on transactions. Subscribe to waive this fee.
              </p>
            </div>
          </div>

          {/* Submit Button */}
          <div className="mt-8 flex justify-end space-x-4">
            <button
              type="button"
              onClick={() => router.push('/settings')}
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
              style={{ border: '1px solid #171717', boxShadow: '2px 2px 0px #171717' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || loadingBanks}
              className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ border: '1px solid #171717', boxShadow: '2px 2px 0px #171717' }}
            >
              {saving ? 'Saving...' : subaccount ? 'Update Subaccount' : 'Create Subaccount'}
            </button>
          </div>
        </form>

        {/* Settlement Configuration */}
        {subaccount && (
          <div className="mt-6 bg-white shadow rounded-lg p-6" style={{ border: '1px solid #171717', boxShadow: '2px 2px 0px #171717' }}>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Settlement Configuration</h2>
            <div className="space-y-3 text-sm text-gray-600">
              <div className="flex justify-between">
                <span className="font-medium">Bank:</span>
                <span>{banks.find(b => b.code === subaccount.settlement_bank)?.name || subaccount.settlement_bank}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Account Number:</span>
                <span>{subaccount.account_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Platform Fee:</span>
                <span>{subaccount.percentage_charge}%</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Status:</span>
                <span className={subaccount.is_active ? 'text-green-600' : 'text-red-600'}>
                  {subaccount.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
