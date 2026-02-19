'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import LoadingSpinner from '../../../../components/LoadingSpinner';
import { useCurrencyFormat } from '../../../../hooks/use-currency-format';
import { clientPortalService, ClientPortalInvoice } from '../../../../services/clientPortal';
import { 
  ArrowLeft,
  FileText,
  Download,
  CreditCard,
  Clock,
  AlertCircle,
  Package,
  X,
  Maximize2,
  Minimize2
} from 'lucide-react';

interface Activity {
  id: string;
  type: string;
  title: string;
  description: string;
  time: string;
  projectName?: string;
}

export default function ClientPortalInvoicesPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const { formatWithCurrency } = useCurrencyFormat();
  
  const [invoices, setInvoices] = useState<ClientPortalInvoice[]>([]);
  const [currency, setCurrency] = useState('USD');
  const [clientName, setClientName] = useState('');
  const [sessionExpires, setSessionExpires] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'unpaid' | 'paid'>('all');
  const [isActivitiesSidebarOpen, setIsActivitiesSidebarOpen] = useState(false);
  const [isActivitiesSidebarExpanded, setIsActivitiesSidebarExpanded] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Validate token and get client info
        const validateResponse = await clientPortalService.validateToken(token);
        if (validateResponse.success && validateResponse.data) {
          setClientName(validateResponse.data.client_name || 'Client');
          setSessionExpires(validateResponse.data.expires_at || null);
        }

        // Fetch invoices
        const response = await clientPortalService.getInvoices(token);
        if (response.success && response.data) {
          setInvoices(response.data.invoices);
          setCurrency(response.data.currency);
        } else {
          setError(response.error || 'Failed to load invoices');
        }
      } catch {
        setError('Failed to load invoices');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [token]);

  const filteredInvoices = invoices.filter(inv => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'unpaid') return ['sent', 'awaiting_verification'].includes(inv.status);
    if (statusFilter === 'paid') return inv.status === 'paid';
    return true;
  });

  const getStatusBadgeColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'paid':
        return 'bg-[#ccff00] text-black';
      case 'awaiting_verification':
        return 'bg-[#1a1a2e] text-white';
      case 'sent':
        return 'bg-blue-500 text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  const needsPayment = (invoice: ClientPortalInvoice) => {
    return invoice.status === 'sent' && !invoice.client_marked_paid;
  };

  const getActivityIcon = (type: string) => {
    const borderColorClass = {
      deliverable: "border-purple-400",
      invoice: "border-green-400",
      change_request: "border-blue-400",
      default: "border-gray-400",
    };
    const borderColor = borderColorClass[type as keyof typeof borderColorClass] || borderColorClass.default;
    return <div className={`w-3 h-3 bg-white rounded-full border-2 ${borderColor}`}></div>;
  };

  // Mock activities for right sidebar
  const activities: Activity[] = [
    {
      id: "1",
      type: "invoice",
      title: "Invoice Sent",
      description: "Invoice #INV-001 sent",
      time: "1d ago",
    },
    {
      id: "2",
      type: "invoice",
      title: "Invoice Paid",
      description: "Invoice #INV-002 marked as paid",
      time: "5d ago",
    },
    {
      id: "3",
      type: "invoice",
      title: "Invoice Generated",
      description: "Invoice #INV-003 generated",
      time: "2w ago",
    },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#F5F5F5" }}>
        <div className="flex items-center">
          <LoadingSpinner />
          <span className="ml-3 text-gray-600">Loading invoices...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#F5F5F5" }}>
        <div className="max-w-md w-full mx-4">
          <div className="p-6 rounded-lg bg-white" style={{ border: '1px solid #ef4444' }}>
            <div className="flex items-center mb-4">
              <AlertCircle className="w-6 h-6 text-red-600 mr-3" />
              <h2 className="text-lg font-semibold text-gray-900">Error</h2>
            </div>
            <p className="text-gray-600 mb-4">{error}</p>
            <button
              onClick={() => router.push(`/client-portal/${token}`)}
              className="px-4 py-2 text-sm font-medium black-button"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  const unpaidCount = invoices.filter(inv => ['sent', 'awaiting_verification'].includes(inv.status)).length;
  const paidCount = invoices.filter(inv => inv.status === 'paid').length;
  const totalAmount = invoices.reduce((sum, inv) => sum + inv.total_amount, 0);

  return (
    <div className="flex h-screen" style={{ backgroundColor: "#F5F5F5" }}>
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <div className="lg:pr-96">
            <div className="px-4 sm:px-6 lg:px-8 py-8">
              {/* Header */}
              <div className="mb-8">
                <button
                  onClick={() => router.push(`/client-portal/${token}`)}
                  className="flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4"
                >
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  Back to Dashboard
                </button>
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-2xl font-semibold text-black">Invoices</h1>
                    <p className="text-sm text-gray-600 mt-1">
                      {invoices.length} total • {unpaidCount} unpaid
                    </p>
                  </div>
                </div>
              </div>

              {/* Stats Cards */}
              <div className="mb-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="email-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: "#3b82f6" }}
                      />
                      <span className="text-sm font-bold text-white uppercase tracking-wide">
                        Total Invoices
                      </span>
                    </div>
                    <div className="text-2xl font-black text-white">
                      {invoices.length}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {formatWithCurrency(totalAmount, currency)} total
                    </div>
                  </div>

                  <div className="email-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: "#f59e0b" }}
                      />
                      <span className="text-sm font-bold text-white uppercase tracking-wide">
                        Unpaid
                      </span>
                    </div>
                    <div className="text-2xl font-black text-white">
                      {unpaidCount}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      Awaiting payment
                    </div>
                  </div>

                  <div className="email-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: "#22c55e" }}
                      />
                      <span className="text-sm font-bold text-white uppercase tracking-wide">
                        Paid
                      </span>
                    </div>
                    <div className="text-2xl font-black text-white">
                      {paidCount}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      Completed
                    </div>
                  </div>
                </div>
              </div>

              {/* Filters */}
              <div className="mb-6">
                <div className="flex space-x-2">
                  {(['all', 'unpaid', 'paid'] as const).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setStatusFilter(filter)}
                      className={`px-4 py-2 text-sm font-medium rounded-full transition-all ${
                        statusFilter === filter
                          ? 'bg-black text-white'
                          : 'bg-white text-gray-700 border border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      {filter.charAt(0).toUpperCase() + filter.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Invoices Table */}
              <div className="bg-white rounded-2xl p-6">
                <div className="mb-6 flex items-center justify-between">
                  <h3 className="text-xl font-medium text-black">Invoice List</h3>
                  <span className="text-sm text-gray-600">
                    {filteredInvoices.length} invoice{filteredInvoices.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {filteredInvoices.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No invoices found</h3>
                    <p className="text-gray-500">
                      {statusFilter === 'all' 
                        ? "You don't have any invoices yet."
                        : `No ${statusFilter} invoices.`}
                    </p>
                  </div>
                ) : (
                  <div className="pt-6">
                    {/* Table Header */}
                    <div className="pb-4 border-b-2 border-gray-300">
                      <div className="flex items-center space-x-4">
                        <div
                          className="text-xs font-semibold text-gray-700 uppercase tracking-wide"
                          style={{ width: '100px' }}
                        >
                          Status
                        </div>
                        <div className="flex-1 grid grid-cols-4 gap-4">
                          <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                            Invoice
                          </div>
                          <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                            Amount
                          </div>
                          <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                            Due Date
                          </div>
                          <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                            Project
                          </div>
                        </div>
                        <div
                          className="text-xs font-semibold text-gray-700 uppercase tracking-wide"
                          style={{ width: '140px' }}
                        >
                          Actions
                        </div>
                      </div>
                    </div>

                    {/* Invoice Rows */}
                    {filteredInvoices.map((invoice, index) => (
                      <div
                        key={invoice.id}
                        className={`py-4 ${index !== filteredInvoices.length - 1 ? 'border-b border-gray-200' : ''}`}
                      >
                        <div className="flex items-center space-x-4">
                          <span
                            className={`px-3 py-1 text-xs font-medium rounded-full ${getStatusBadgeColor(invoice.status)}`}
                            style={{ minWidth: '100px', textAlign: 'center', display: 'inline-block' }}
                          >
                            {invoice.status.replace(/_/g, ' ').toUpperCase()}
                          </span>
                          <div className="flex-1 grid grid-cols-4 gap-4">
                            <div>
                              <div className="text-sm font-semibold text-gray-900">{invoice.invoice_number}</div>
                              {invoice.payment_method && (
                                <div className="text-xs text-gray-500 capitalize">{invoice.payment_method}</div>
                              )}
                            </div>
                            <div className="text-sm font-bold text-gray-900">
                              {formatWithCurrency(invoice.total_amount, currency)}
                            </div>
                            <div className="text-sm text-gray-600">
                              {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('en-GB') : 'N/A'}
                            </div>
                            <div className="text-sm text-gray-600 truncate">
                              {invoice.project_name}
                            </div>
                          </div>
                          <div className="flex items-center gap-2" style={{ width: '140px' }}>
                            {needsPayment(invoice) && (
                              <button
                                onClick={() => router.push(`/client-portal/${token}/invoices/${invoice.id}/pay`)}
                                className="px-3 py-1 text-xs font-medium text-white rounded-full hover:scale-105 transition-transform duration-200 flex items-center gap-1"
                                style={{ backgroundColor: '#22c55e' }}
                              >
                                <CreditCard className="w-3 h-3" />
                                Pay
                              </button>
                            )}
                            {invoice.invoice_pdf_url && (
                              <a
                                href={invoice.invoice_pdf_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-1 text-xs font-medium text-black rounded-full hover:scale-105 transition-transform duration-200 flex items-center gap-1"
                                style={{ backgroundColor: '#ccff00' }}
                              >
                                <Download className="w-3 h-3" />
                                PDF
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Sidebar */}
      <div className="hidden lg:fixed lg:right-0 lg:top-0 lg:z-50 lg:flex lg:w-96 lg:flex-col lg:h-screen">
        <div className="flex flex-col h-full bg-white">
          {/* Sidebar Header */}
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center space-x-3">
              {/* Empty space for alignment */}
            </div>
            <div className="flex items-center space-x-3">
              <span className="text-sm font-medium text-black">
                {clientName || 'Client'}
              </span>
              <div className="w-8 h-8 rounded-full bg-gray-500 flex items-center justify-center" style={{ border: '1px solid #171717' }}>
                <span className="text-white font-semibold text-xs">
                  {clientName ? clientName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) : 'CL'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col flex-1 overflow-y-auto px-4 py-6">
            {/* Quick Actions */}
            <div className="pb-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-normal text-black">Quick Actions</h2>
              </div>
              <div className="space-y-2">
                <button
                  onClick={() => router.push(`/client-portal/${token}`)}
                  className="flex items-center px-4 py-2 text-sm font-medium email-button w-full"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Dashboard
                </button>
                <button
                  onClick={() => router.push(`/client-portal/${token}`)}
                  className="flex items-center px-4 py-2 text-sm font-medium purple-button w-full"
                >
                  <Package className="h-4 w-4 mr-2" />
                  View Projects
                </button>
                <button
                  className="flex items-center px-4 py-2 text-sm font-medium black-button w-full"
                >
                  <Clock className="h-4 w-4 mr-2" />
                  Request Support
                </button>
              </div>
            </div>

            {/* Session Info */}
            <div className="pb-6">
              <div className="rounded-lg p-4 bg-green-50" style={{ border: '1px solid #22c55e' }}>
                <div className="flex items-center mb-2">
                  <AlertCircle className="w-4 h-4 text-green-600 mr-2" />
                  <span className="text-sm font-semibold text-green-900">Session Active</span>
                </div>
                <p className="text-xs text-green-700">
                  Expires: {sessionExpires ? new Date(sessionExpires).toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  }) : 'N/A'}
                </p>
              </div>
            </div>

            {/* Activities Section */}
            <div className="py-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-normal text-black">Recent Activity</h2>
              </div>
              <div className="space-y-3">
                {activities.slice(0, 3).map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-start space-x-2 relative hover:scale-105 transform transition-all duration-300 ease-in-out"
                  >
                    <div className="flex-shrink-0 flex flex-col items-center">
                      <div className="mt-0.5">
                        {getActivityIcon(activity.type)}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-normal text-black truncate">
                        {activity.description}
                      </p>
                      <p className="text-xs text-gray-600 mt-1">
                        {activity.time}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Show All Activities Button */}
            <div className="pb-6">
              <button 
                onClick={() => setIsActivitiesSidebarOpen(true)}
                className="px-4 py-2 text-sm font-medium black-button w-full"
              >
                Show All Activities
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Activities Sidebar */}
      <>
        {/* Backdrop overlay when expanded */}
        {isActivitiesSidebarOpen && isActivitiesSidebarExpanded && (
          <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 transition-opacity duration-300"
            onClick={() => setIsActivitiesSidebarExpanded(false)}
          />
        )}

        {/* Full Activities Sidebar */}
        <div
          className={`fixed right-0 top-0 z-[60] flex flex-col h-screen bg-white transform transition-all duration-300 ease-in-out ${
            isActivitiesSidebarOpen ? "translate-x-0" : "translate-x-full"
          } ${isActivitiesSidebarExpanded ? "w-full lg:w-2/3" : "w-96"}`}
        >
          <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                All Activities
              </h2>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setIsActivitiesSidebarExpanded(!isActivitiesSidebarExpanded)}
                  className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
                  aria-label={isActivitiesSidebarExpanded ? "Collapse" : "Expand"}
                >
                  {isActivitiesSidebarExpanded ? (
                    <Minimize2 className="h-5 w-5" />
                  ) : (
                    <Maximize2 className="h-5 w-5" />
                  )}
                </button>
                <button
                  onClick={() => {
                    setIsActivitiesSidebarOpen(false);
                    setIsActivitiesSidebarExpanded(false);
                  }}
                  className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Activities List */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="space-y-4">
                {activities.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-start space-x-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-shrink-0 mt-1">
                      {getActivityIcon(activity.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {activity.title}
                      </p>
                      <p className="text-sm text-gray-600 mt-0.5">
                        {activity.description}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {activity.time}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </>
    </div>
  );
}
