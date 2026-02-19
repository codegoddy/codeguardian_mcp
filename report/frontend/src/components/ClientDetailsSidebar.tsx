'use client';

import { useState, useEffect } from 'react';
import {
  X,
  Mail,
  Building2,
  DollarSign,
  CreditCard,
  ExternalLink,
  Maximize2,
  Minimize2,
  Copy,
  Check,
  Edit2,
  Save,
  XCircle,
  Send,
  Link as LinkIcon,
  CheckCircle,
  AlertCircle,
  Clock,
  Loader2,
} from 'lucide-react';
import type { Client } from '@/services/clients';
import { useSettings } from '@/hooks/useSettings';
import { useUpdateClient, useClient } from '@/hooks/useClients';
import { useCurrencyFormat } from '@/hooks/use-currency-format';
import ApiService from '@/services/api';
import { toast } from '@/lib/toast';

interface ClientDetailsSidebarProps {
  client: Client | null;
  isOpen: boolean;
  onClose: () => void;
}

type EditField = 'email' | 'company' | 'hourly_rate' | 'change_request_rate' | null;

export default function ClientDetailsSidebar({
  client: initialClient,
  isOpen,
  onClose,
}: ClientDetailsSidebarProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<EditField>(null);
  const [sendingPortalLink, setSendingPortalLink] = useState(false);
  const [editValues, setEditValues] = useState({
    email: '',
    company: '',
    hourly_rate: '',
    change_request_rate: '',
  });
  const { data: settings } = useSettings();
  const updateMutation = useUpdateClient();
  const { formatWithCurrency } = useCurrencyFormat();

  // Fetch fresh client data from cache when the sidebar is open
  const { data: freshClientData, isLoading: isLoadingClient } = useClient(
    initialClient?.id || '',
    isOpen // Only enable when sidebar is open
  );

  // Use fresh data if available, otherwise fall back to initial prop
  const client = freshClientData || initialClient;

  // Sync edit values when client data changes
  useEffect(() => {
    if (client) {
      setEditValues({
        email: client.email,
        company: client.company || '',
        hourly_rate: client.default_hourly_rate.toString(),
        change_request_rate: client.change_request_rate.toString(),
      });
    }
  }, [client?.id, client?.email, client?.company, client?.default_hourly_rate, client?.change_request_rate]);

  if (!client) return null;

  const startEditing = (field: EditField) => {
    if (!field) return;
    setEditingField(field);
    setEditValues({
      email: client.email,
      company: client.company || '',
      hourly_rate: client.default_hourly_rate.toString(),
      change_request_rate: client.change_request_rate.toString(),
    });
  };

  const cancelEditing = () => {
    setEditingField(null);
    setEditValues({
      email: '',
      company: '',
      hourly_rate: '',
      change_request_rate: '',
    });
  };

  const saveEdit = async () => {
    if (!editingField || !client) return;

    try {
      const updateData: Record<string, string | number> = {};

      if (editingField === 'email') {
        updateData.email = editValues.email;
      } else if (editingField === 'company') {
        updateData.company = editValues.company;
      } else if (editingField === 'hourly_rate') {
        updateData.default_hourly_rate = parseFloat(editValues.hourly_rate);
      } else if (editingField === 'change_request_rate') {
        updateData.change_request_rate = parseFloat(editValues.change_request_rate);
      }

      await updateMutation.mutateAsync({
        id: client.id,
        data: updateData,
      });

      setEditingField(null);
      toast.success('Updated', 'Client information has been updated successfully!');
    } catch (error) {
      console.error('Failed to update client:', error);
      toast.error('Failed', 'Failed to update client. Please try again.');
    }
  };

  const handleSendPortalLink = async () => {
    if (!client) return;
    
    try {
      setSendingPortalLink(true);
      const response = await ApiService.post<{
        magic_link: string;
        expires_at: string;
        client_email: string;
      }>(`/api/clients/${client.id}/send-portal-link`);
      
      toast.success(
        'Portal Link Sent',
        `Client portal access link has been sent to ${response.client_email}`
      );
    } catch (err: unknown) {
      console.error('Error sending portal link:', err);
      const errorMessage = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail || 'Failed to generate and send client portal link'
        : 'Failed to generate and send client portal link';
      toast.error(
        'Failed to Send Link',
        errorMessage
      );
    } finally {
      setSendingPortalLink(false);
    }
  };

  const handleCopyPortalLink = (link: string) => {
    navigator.clipboard.writeText(link);
    toast.success('Copied!', 'Portal link copied to clipboard');
  };

  // Get user's currency from settings, default to USD
  const userCurrency = settings?.default_currency || 'USD';

  // Map currency codes to symbols, or use the code itself with proper spacing
  const getCurrencyDisplay = (currency: string) => {
    const symbolMap: Record<string, string> = {
      USD: '$',
      EUR: '€',
      GBP: '£',
      JPY: '¥',
      CNY: '¥',
      INR: '₹',
      AUD: 'A$',
      CAD: 'C$',
      CHF: 'CHF',
      SEK: 'kr',
      NZD: 'NZ$',
    };
    return symbolMap[currency] || currency;
  };

  const currencySymbol = getCurrencyDisplay(userCurrency);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const getPaymentMethodBadgeColor = (method: string) => {
    switch (method) {
      case 'paystack':
        return 'bg-[#ccff00] text-black';
      case 'stripe':
        return 'bg-blue-500 text-white';
      default:
        return 'bg-purple-500 text-white';
    }
  };

  const portalUrl = client.portal_access_token
    ? `${window.location.origin}/portal/${client.portal_access_token}`
    : null;

  const getActivityIcon = (type: string) => {
    const borderColorClass = {
      completed: "border-green-400",
      feedback: "border-blue-400",
      commit: "border-purple-400",
      default: "border-gray-400",
    };
    const borderColor = borderColorClass[type as keyof typeof borderColorClass] || borderColorClass.default;
    return <div className={`w-3 h-3 bg-white rounded-full border-2 ${borderColor}`}></div>;
  };

  return (
    <>
      {/* Backdrop overlay when expanded */}
      {isOpen && isExpanded && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 transition-opacity duration-300"
          onClick={() => setIsExpanded(false)}
        />
      )}

      <div
        className={`fixed top-0 right-0 h-screen bg-white flex flex-col shadow-lg transition-all duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        } ${isExpanded ? 'w-[800px] z-50' : 'w-96 z-60'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <h2 className="text-xl font-semibold text-black">Client Details</h2>
            {isLoadingClient && (
              <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 hover:bg-gray-100 rounded transition-colors"
              title={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? (
                <Minimize2 className="w-5 h-5 text-gray-600" />
              ) : (
                <Maximize2 className="w-5 h-5 text-gray-600" />
              )}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-gray-100 rounded transition-colors"
            >
              <X className="w-6 h-6 text-gray-600" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Client Overview */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-black">{client.name}</h3>
              <span
                className={`px-3 py-1 text-xs font-medium rounded-full ${getPaymentMethodBadgeColor(
                  client.payment_method
                )}`}
              >
                {client.payment_method.toUpperCase()}
              </span>
            </div>

            <div className="space-y-4">
              {/* Email */}
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center space-x-3 flex-1">
                  <Mail className="w-4 h-4 text-gray-500" />
                  <span className="text-gray-600">Email:</span>
                  {editingField === 'email' ? (
                    <input
                      type="email"
                      value={editValues.email}
                      onChange={(e) =>
                        setEditValues({ ...editValues, email: e.target.value })
                      }
                      className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                      autoFocus
                    />
                  ) : (
                    <span className="font-medium text-black">{client.email}</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {editingField === 'email' ? (
                    <>
                      <button
                        onClick={saveEdit}
                        disabled={updateMutation.isPending}
                        className="p-1 hover:bg-green-100 rounded transition-colors"
                      >
                        <Save className="w-4 h-4 text-green-600" />
                      </button>
                      <button
                        onClick={cancelEditing}
                        disabled={updateMutation.isPending}
                        className="p-1 hover:bg-red-100 rounded transition-colors"
                      >
                        <XCircle className="w-4 h-4 text-red-600" />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => startEditing('email')}
                      className="p-1 hover:bg-gray-100 rounded transition-colors"
                    >
                      <Edit2 className="w-3 h-3 text-gray-600" />
                    </button>
                  )}
                </div>
              </div>

              {/* Company */}
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center space-x-3 flex-1">
                  <Building2 className="w-4 h-4 text-gray-500" />
                  <span className="text-gray-600">Company:</span>
                  {editingField === 'company' ? (
                    <input
                      type="text"
                      value={editValues.company}
                      onChange={(e) =>
                        setEditValues({ ...editValues, company: e.target.value })
                      }
                      className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                      autoFocus
                    />
                  ) : (
                    <span className="font-medium text-black">
                      {client.company || 'Not set'}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {editingField === 'company' ? (
                    <>
                      <button
                        onClick={saveEdit}
                        disabled={updateMutation.isPending}
                        className="p-1 hover:bg-green-100 rounded transition-colors"
                      >
                        <Save className="w-4 h-4 text-green-600" />
                      </button>
                      <button
                        onClick={cancelEditing}
                        disabled={updateMutation.isPending}
                        className="p-1 hover:bg-red-100 rounded transition-colors"
                      >
                        <XCircle className="w-4 h-4 text-red-600" />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => startEditing('company')}
                      className="p-1 hover:bg-gray-100 rounded transition-colors"
                    >
                      <Edit2 className="w-3 h-3 text-gray-600" />
                    </button>
                  )}
                </div>
              </div>

              {/* Hourly Rate */}
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center space-x-3 flex-1">
                  <DollarSign className="w-4 h-4 text-gray-500" />
                  <span className="text-gray-600">Hourly Rate:</span>
                  {editingField === 'hourly_rate' ? (
                    <div className="flex items-center gap-1 flex-1">
                      <span className="text-gray-600">{currencySymbol}</span>
                      <input
                        type="number"
                        step="0.01"
                        value={editValues.hourly_rate}
                        onChange={(e) =>
                          setEditValues({ ...editValues, hourly_rate: e.target.value })
                        }
                        className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                        autoFocus
                      />
                      <span className="text-gray-600">/hr</span>
                    </div>
                  ) : (
                    <span className="font-medium text-black">
                      {currencySymbol}
                      {client.default_hourly_rate}/hr
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {editingField === 'hourly_rate' ? (
                    <>
                      <button
                        onClick={saveEdit}
                        disabled={updateMutation.isPending}
                        className="p-1 hover:bg-green-100 rounded transition-colors"
                      >
                        <Save className="w-4 h-4 text-green-600" />
                      </button>
                      <button
                        onClick={cancelEditing}
                        disabled={updateMutation.isPending}
                        className="p-1 hover:bg-red-100 rounded transition-colors"
                      >
                        <XCircle className="w-4 h-4 text-red-600" />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => startEditing('hourly_rate')}
                      className="p-1 hover:bg-gray-100 rounded transition-colors"
                    >
                      <Edit2 className="w-3 h-3 text-gray-600" />
                    </button>
                  )}
                </div>
              </div>

              {/* Change Request Rate */}
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center space-x-3 flex-1">
                  <DollarSign className="w-4 h-4 text-gray-500" />
                  <span className="text-gray-600">Change Request Rate:</span>
                  {editingField === 'change_request_rate' ? (
                    <div className="flex items-center gap-1 flex-1">
                      <span className="text-gray-600">{currencySymbol}</span>
                      <input
                        type="number"
                        step="0.01"
                        value={editValues.change_request_rate}
                        onChange={(e) =>
                          setEditValues({
                            ...editValues,
                            change_request_rate: e.target.value,
                          })
                        }
                        className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                        autoFocus
                      />
                      <span className="text-gray-600">/hr</span>
                    </div>
                  ) : (
                    <span className="font-medium text-black">
                      {currencySymbol}
                      {client.change_request_rate}/hr
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {editingField === 'change_request_rate' ? (
                    <>
                      <button
                        onClick={saveEdit}
                        disabled={updateMutation.isPending}
                        className="p-1 hover:bg-green-100 rounded transition-colors"
                      >
                        <Save className="w-4 h-4 text-green-600" />
                      </button>
                      <button
                        onClick={cancelEditing}
                        disabled={updateMutation.isPending}
                        className="p-1 hover:bg-red-100 rounded transition-colors"
                      >
                        <XCircle className="w-4 h-4 text-red-600" />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => startEditing('change_request_rate')}
                      className="p-1 hover:bg-gray-100 rounded transition-colors"
                    >
                      <Edit2 className="w-3 h-3 text-gray-600" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Payment Information */}
          <div className="mb-8 p-4 rounded-lg border border-gray-200">
            <h4 className="text-base font-medium text-black mb-3 flex items-center">
              <CreditCard className="w-4 h-4 mr-2" />
              Payment Information
            </h4>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Method:</span>
                <span className="text-sm font-medium text-black">
                  {client.payment_method === 'paystack' ? 'Paystack' : 'Manual Payment'}
                </span>
              </div>

              {client.payment_method === 'manual' && client.payment_gateway_name && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Gateway:</span>
                  <span className="text-sm font-medium text-black">
                    {client.payment_gateway_name}
                  </span>
                </div>
              )}

              {client.payment_method === 'paystack' && client.paystack_subaccount_code && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Subaccount:</span>
                    <button
                      onClick={() =>
                        copyToClipboard(client.paystack_subaccount_code!, 'subaccount')
                      }
                      className="flex items-center gap-1 text-sm font-medium text-black hover:text-gray-700"
                    >
                      {copiedField === 'subaccount' ? (
                        <>
                          <Check className="w-3 h-3 text-green-600" />
                          <span className="text-green-600">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span className="font-mono text-xs">
                            {client.paystack_subaccount_code.substring(0, 12)}...
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {client.payment_method === 'manual' && client.payment_instructions && (
              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-600 mb-1 font-medium">Payment Instructions:</p>
                <p className="text-sm text-gray-900 whitespace-pre-wrap">
                  {client.payment_instructions}
                </p>
              </div>
            )}
          </div>

          {/* Client Portal Access */}
          <div className="mb-8 p-4 rounded-lg border border-gray-200 bg-gradient-to-br from-blue-50 to-purple-50">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-base font-medium text-black flex items-center">
                <LinkIcon className="w-4 h-4 mr-2 text-blue-600" />
                Client Portal Access
              </h4>
              {client.is_active && (
                <span className="text-xs px-2 py-1 bg-[#ccff00] text-black rounded-full font-medium">
                  Active
                </span>
              )}
            </div>

            <div className="space-y-3">
              <p className="text-xs text-gray-600 mb-3">
                Generate and send a secure portal access link to your client.
              </p>

              {portalUrl && (
                <div className="p-3 bg-white rounded-lg border border-gray-200 mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-gray-700">Permanent Portal Link</span>
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={portalUrl}
                      readOnly
                      className="flex-1 text-xs bg-gray-50 px-2 py-1 rounded border border-gray-200 font-mono text-gray-600 truncate"
                    />
                    <button
                      onClick={() => handleCopyPortalLink(portalUrl)}
                      className="p-2 hover:bg-gray-100 rounded transition-colors"
                      title="Copy link"
                    >
                      <Copy className="w-4 h-4 text-gray-600" />
                    </button>
                  </div>
                </div>
              )}

              <button
                onClick={handleSendPortalLink}
                disabled={sendingPortalLink}
                className="w-full flex items-center justify-center px-4 py-2 text-sm font-medium email-button rounded-lg transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
              >
                {sendingPortalLink ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Generating Link...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Generate & Send Portal Link
                  </>
                )}
              </button>

              <div className="flex items-start space-x-2 p-2 bg-blue-50 rounded-lg border border-blue-100">
                <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-blue-700">
                  Link will be emailed to <strong>{client.name}</strong> and expires in 30 days.
                </p>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="mb-8">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-lg font-normal text-black">
                Recent Activity
              </h4>
              <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center">
                <Clock className="w-5 h-5 text-white" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-start space-x-2 relative hover:scale-105 transform transition-all duration-300 ease-in-out">
                <div className="flex-shrink-0 flex flex-col items-center">
                  <div className="mt-0.5">
                    {getActivityIcon('completed')}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-normal text-black truncate">
                    Client profile updated
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    Just now
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-2 relative hover:scale-105 transform transition-all duration-300 ease-in-out">
                <div className="flex-shrink-0 flex flex-col items-center">
                  <div className="mt-0.5">
                    {getActivityIcon('feedback')}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-normal text-black truncate">
                    Payment method verified
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    1 day ago
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-2 relative hover:scale-105 transform transition-all duration-300 ease-in-out">
                <div className="flex-shrink-0 flex flex-col items-center">
                  <div className="mt-0.5">
                    {getActivityIcon('commit')}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-normal text-black truncate">
                    Client created
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    {new Date(client.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="mb-8">
            <h4 className="text-base font-medium text-black mb-3">Quick Actions</h4>
            <div className="space-y-2">
              <button
                onClick={() => portalUrl && window.open(portalUrl, '_blank')}
                disabled={!portalUrl}
                className="flex items-center justify-center w-full px-4 py-2 text-sm font-medium email-button rounded-lg transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Open Client Portal
              </button>

              <button className="flex items-center justify-center w-full px-4 py-2 text-sm font-medium purple-button rounded-lg transition-all duration-200 hover:scale-105">
                <Building2 className="w-4 h-4 mr-2" />
                View Projects
              </button>

              <button className="flex items-center justify-center w-full px-4 py-2 text-sm font-medium black-button rounded-lg transition-all duration-200 hover:scale-105">
                <DollarSign className="w-4 h-4 mr-2" />
                View Invoices
              </button>
            </div>
          </div>

          {/* Client Stats */}
          <div className="mb-8 p-4 rounded-lg border border-gray-200">
            <h4 className="text-base font-medium text-black mb-3">Statistics</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-xs text-gray-600 mb-1">Active Projects</p>
                <p className="text-2xl font-bold text-gray-900">0</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-xs text-gray-600 mb-1">Total Invoices</p>
                <p className="text-2xl font-bold text-gray-900">0</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-xs text-gray-600 mb-1">Total Paid</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatWithCurrency(0, userCurrency)}
                </p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-xs text-gray-600 mb-1">Outstanding</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatWithCurrency(0, userCurrency)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
