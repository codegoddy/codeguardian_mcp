'use client';

import { toast } from '@/lib/toast';
import { useState, useEffect } from 'react';
import { Invoice } from '@/services/payments';
import LoadingSpinner from '@/components/LoadingSpinner';
import AuthGuard from '@/components/AuthGuard';
import { AlertCircle, Calendar } from 'lucide-react';
import { useInvoices, useSendInvoice, useVerifyInvoice, useResendInvoice } from '@/hooks/useInvoices';
import PaymentScheduleTab from '@/components/PaymentScheduleTab';
import ApiService from '@/services/api';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';

// Type for project list
interface ProjectSummary {
  id: string;
  name: string;
  project_budget: number;
  client_id: string;
}

export default function InvoicesPage() {
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'invoices' | 'schedule'>('invoices');
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [currency, setCurrency] = useState<string>('KSh');

  const { data: invoices, isLoading, error } = useInvoices();
  const verifyMutation = useVerifyInvoice();
  const sendMutation = useSendInvoice();
  const resendMutation = useResendInvoice();

  // Fetch projects for schedule tab
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const data = await ApiService.get<ProjectSummary[]>('/api/projects');
        setProjects(data);
        if (data.length > 0 && !selectedProjectId) {
          setSelectedProjectId(data[0].id);
        }
      } catch (err) {
        console.error('Failed to fetch projects:', err);
      }
    };
    
    const fetchSettings = async () => {
      try {
        const data = await ApiService.get<{ default_currency?: string }>('/api/settings');
        setCurrency(data.default_currency || 'KSh');
      } catch (err) {
        console.error('Failed to fetch settings:', err);
      }
    };
    
    fetchProjects();
    fetchSettings();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const selectedProject = projects.find(p => p.id === selectedProjectId);

  const handleVerifyClick = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setShowVerifyModal(true);
  };

  const handleConfirmVerify = async () => {
    if (selectedInvoice) {
      try {
        await verifyMutation.mutateAsync(selectedInvoice.id);
        setShowVerifyModal(false);
        setSelectedInvoice(null);
        toast.success('Payment Verified', 'The payment has been verified successfully.');
      } catch (error) {
        toast.error('Verification Failed', `Failed to verify payment: ${(error as Error).message}`);
      }
    }
  };

  const handleSendClick = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setShowSendModal(true);
  };

  const handleConfirmSend = async () => {
    if (selectedInvoice) {
      try {
        await sendMutation.mutateAsync(selectedInvoice.id);
        setShowSendModal(false);
        setSelectedInvoice(null);
        toast.success('Invoice Sent', 'The invoice has been sent successfully.');
      } catch (error) {
        toast.error('Send Failed', `Failed to send invoice: ${(error as Error).message}`);
      }
    }
  };

  const handleResend = async (invoice: Invoice) => {
    if (confirm(`Resend invoice ${invoice.invoice_number} to client?`)) {
      try {
        await resendMutation.mutateAsync(invoice.id);
        toast.success('Invoice Resent', 'The invoice has been resent successfully.');
      } catch (error) {
        toast.error('Resend Failed', `Failed to resend invoice: ${(error as Error).message}`);
      }
    }
  };

  const handleViewDetails = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setShowDetailModal(true);
  };

  const filteredInvoices = invoices?.filter((invoice) => {
    if (statusFilter === 'all') return true;
    return invoice.status === statusFilter;
  }) || [];

  const getStatusBadgeColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'paid':
        return 'bg-[#ccff00] text-black';
      case 'awaiting_verification':
        return 'bg-red-500 text-white';
      case 'sent':
        return 'bg-blue-500 text-white';
      case 'draft':
        return 'bg-[#1a1a2e] text-white';
      default:
        return 'bg-[#1a1a2e] text-white';
    }
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-GB');
  };

  const formatCurrency = (amount: number) => {
    // Use currency symbol directly with number formatting
    const formatted = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
    return `${currency} ${formatted}`;
  };

  if (isLoading) {
    return (
      <AuthGuard>
        <div className="min-h-screen" style={{ backgroundColor: '#F5F5F5' }}>
          <main>
            <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-center py-12">
                <LoadingSpinner />
                <span className="ml-3 text-gray-600">Loading invoices...</span>
              </div>
            </div>
          </main>
        </div>
      </AuthGuard>
    );
  }

  if (error) {
    return (
      <AuthGuard>
        <div className="min-h-screen" style={{ backgroundColor: '#F5F5F5' }}>
          <main>
            <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
              <div className="mb-6 p-4 rounded-lg" style={{
                border: '1px solid #ef4444',
                backgroundColor: '#fef2f2',
                boxShadow: '2px 2px 0px #ef4444'
              }}>
                <div className="flex">
                  <AlertCircle className="w-5 h-5 text-red-400 mr-2" />
                  <div>
                    <p className="text-sm text-red-700">Error loading invoices: {(error as Error).message}</p>
                    <button
                      onClick={() => window.location.reload()}
                      className="mt-2 text-sm text-red-600 hover:text-red-800 font-medium"
                    >
                      Try again
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="min-h-screen" style={{ backgroundColor: '#F5F5F5' }}>
        <main>
          <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
            {/* Tab Navigation */}
            <div className="mb-6">
              <nav className="flex space-x-8">
                <button
                  onClick={() => setActiveTab('invoices')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors duration-200 ${
                    activeTab === 'invoices'
                      ? 'border-black text-black'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Invoices
                </button>
                <button
                  onClick={() => setActiveTab('schedule')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors duration-200 ${
                    activeTab === 'schedule'
                      ? 'border-black text-black'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Payment Schedule
                </button>
              </nav>
            </div>

            {/* Page Header */}
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-2xl font-normal text-black">
                {activeTab === 'invoices' ? 'Invoices' : 'Payment Schedule'}
              </h2>
            </div>

            {/* Schedule Tab Content */}
            {activeTab === 'schedule' && (
              <div className="mb-8 rounded-2xl p-6 bg-white">
                <div className="mb-6 flex items-center justify-between">
                  <h3 className="text-xl font-medium text-black">
                    Payment Schedules
                  </h3>
                  <div className="w-64">
                    <Select
                      value={selectedProjectId}
                      onValueChange={setSelectedProjectId}
                    >
                      <SelectTrigger className="email-button">
                        <SelectValue placeholder="Select Project" />
                      </SelectTrigger>
                      <SelectContent>
                        {projects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                {/* Payment Schedule Component */}
                {selectedProject && (
                  <PaymentScheduleTab
                    projectId={selectedProject.id}
                    projectBudget={selectedProject.project_budget}
                    currency={currency}
                  />
                )}
                
                {!selectedProject && projects.length === 0 && (
                  <div className="text-center py-12">
                    <div className="text-gray-400 mb-4">
                      <Calendar className="mx-auto h-12 w-12" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      No projects yet
                    </h3>
                    <p className="text-gray-500">
                      Create a project first to set up payment schedules.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Invoices Tab Content */}
            {activeTab === 'invoices' && (
              <>
                {/* Status Filter */}
                <div className="mb-6 flex space-x-2">
                  {['all', 'draft', 'sent', 'awaiting_verification', 'paid'].map((status) => (
                    <button
                      key={status}
                      onClick={() => setStatusFilter(status)}
                      className={`px-4 py-2 text-sm font-medium transition-all duration-200 ${
                        statusFilter === status
                          ? 'black-button border border-black'
                          : 'email-button border border-black'
                      }`}
                    >
                      {status === 'all' ? 'All' : status.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                    </button>
                  ))}
                </div>


            {/* Invoices Table */}
            <div className="mb-8 rounded-2xl p-6 bg-white">
              {!invoices || invoices.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-gray-400 mb-4">
                    <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No invoices yet</h3>
                  <p className="text-gray-500">Invoices will appear here once created.</p>
                </div>
              ) : (
                <>
                  <div className="mb-6 flex items-center justify-between">
                    <h3 className="text-xl font-medium text-black">All Invoices</h3>
                  </div>

                  <div className="pt-6">
                    {/* Table Header */}
                    <div className="pb-4 border-b-2 border-gray-300">
                      <div className="flex items-center">
                        <div className="w-28 text-xs font-semibold text-gray-700 uppercase tracking-wide">
                          Status
                        </div>
                        <div className="w-36 text-xs font-semibold text-gray-700 uppercase tracking-wide">
                          Invoice #
                        </div>
                        <div className="w-32 text-xs font-semibold text-gray-700 uppercase tracking-wide">
                          Amount
                        </div>
                        <div className="flex-1 text-xs font-semibold text-gray-700 uppercase tracking-wide">
                          Payment Method
                        </div>
                        <div className="w-24 text-xs font-semibold text-gray-700 uppercase tracking-wide">
                          Date
                        </div>
                        <div className="w-32 text-right text-xs font-semibold text-gray-700 uppercase tracking-wide">
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
                        <div className="flex items-center">
                          <div className="w-28">
                            <span
                              className={`px-3 py-1 text-xs font-medium rounded-full ${getStatusBadgeColor(invoice.status)} inline-block text-center`}
                            >
                              {invoice.status === 'awaiting_verification' ? 'PENDING' : invoice.status.toUpperCase()}
                            </span>
                          </div>
                          
                          <div className="w-36 text-sm font-semibold text-gray-900">
                            {invoice.invoice_number}
                          </div>
                          
                          <div className="w-32 text-sm font-bold text-gray-900">
                            {formatCurrency(invoice.total_amount)}
                          </div>
                          
                          <div className="flex-1 text-sm text-gray-600">
                            {invoice.payment_method === 'manual' ? (
                              <span>{invoice.payment_gateway_name || 'Manual'}</span>
                            ) : (
                              <span>Paystack</span>
                            )}
                          </div>
                          
                          <div className="w-24 text-xs text-gray-600">
                            {formatDate(invoice.created_at)}
                          </div>
                          
                          <div className="w-32 flex items-center justify-end gap-1">
                             <button
                               onClick={() => handleViewDetails(invoice)}
                               className="px-2 py-1 text-xs font-medium text-black rounded-full hover:scale-105 transition-transform duration-200"
                               style={{ backgroundColor: '#ccff00' }}
                             >
                               View
                             </button>
                             
                             {invoice.status === 'draft' && (
                               <button
                                 onClick={() => handleSendClick(invoice)}
                                 className="px-2 py-1 text-xs font-medium text-white rounded-full black-button hover:scale-105 transition-transform duration-200"
                               >
                                 Send
                               </button>
                             )}
                             
                             {(invoice.status === 'sent' || invoice.status === 'awaiting_verification') && !invoice.client_marked_paid && (
                               <button
                                 onClick={() => handleResend(invoice)}
                                 disabled={resendMutation.isPending}
                                 className="px-2 py-1 text-xs font-medium text-white rounded-full black-button hover:scale-105 transition-transform duration-200 disabled:opacity-50"
                               >
                                 {resendMutation.isPending ? '...' : 'Resend'}
                               </button>
                             )}
                             
                             {invoice.invoice_pdf_url && (
                               <a
                                 href={invoice.invoice_pdf_url}
                                 target="_blank"
                                 rel="noopener noreferrer"
                                 className="px-2 py-1 text-xs font-medium text-white rounded-full bg-green-500 hover:scale-105 transition-transform duration-200"
                               >
                                 PDF
                               </a>
                             )}
                             
                             {invoice.payment_method === 'manual' && invoice.client_marked_paid && !invoice.developer_verified && (
                               <button
                                 onClick={() => handleVerifyClick(invoice)}
                                 className="px-2 py-1 text-xs font-medium text-white rounded-full bg-green-500 hover:scale-105 transition-transform duration-200"
                               >
                                 Verify
                               </button>
                             )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Send Invoice Confirmation Modal */}
            {showSendModal && selectedInvoice && (
              <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg p-6 max-w-md w-full" style={{
                  border: '1px solid #171717',
                  boxShadow: '2px 2px 0px #171717'
                }}>
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Send Invoice</h2>
                  
                  <div className="mb-6">
                    <p className="text-gray-700 mb-4">
                      Are you sure you want to send invoice <strong>{selectedInvoice.invoice_number}</strong>?
                    </p>
                    <p className="text-gray-600 text-sm">
                      This will:
                    </p>
                    <ul className="list-disc list-inside text-gray-600 text-sm space-y-1 ml-2 mt-2">
                      <li>Generate a PDF invoice</li>
                      <li>Send an email to the client with payment instructions</li>
                      <li>Mark the invoice as &quot;Sent&quot;</li>
                    </ul>
                  </div>

                  <div className="flex justify-end space-x-4">
                    <button
                      onClick={() => {
                        setShowSendModal(false);
                        setSelectedInvoice(null);
                      }}
                      className="px-4 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded font-medium transition-colors duration-200"
                      disabled={sendMutation.isPending}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleConfirmSend}
                      className="px-4 py-2 black-button text-white rounded hover:scale-105 hover:shadow-lg transition-all duration-200"
                      disabled={sendMutation.isPending}
                    >
                      {sendMutation.isPending ? 'Sending...' : 'Send Invoice'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Invoice Detail Modal */}
            {showDetailModal && selectedInvoice && (
              <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 overflow-y-auto p-4">
                <div className="bg-white rounded-lg p-6 max-w-2xl w-full my-8" style={{
                  border: '2px solid #000',
                  boxShadow: '4px 4px 0px 0px #000'
                }}>
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h2 className="text-2xl font-black tracking-tight text-gray-900">Invoice Details</h2>
                      <p className="text-gray-600 mt-1 font-medium">{selectedInvoice.invoice_number}</p>
                    </div>
                    <button
                      onClick={() => {
                        setShowDetailModal(false);
                        setSelectedInvoice(null);
                      }}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">Status</p>
                        <div className="mt-1">
                          <span className={`px-3 py-1 text-xs font-medium rounded-lg ${getStatusBadgeColor(selectedInvoice.status)}`}>
                            {selectedInvoice.status === 'awaiting_verification' ? 'PENDING' : selectedInvoice.status.toUpperCase()}
                          </span>
                        </div>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Payment Method</p>
                        <p className="mt-1 text-gray-900">
                          {selectedInvoice.payment_method === 'manual'
                            ? selectedInvoice.payment_gateway_name || 'Manual'
                            : 'Paystack'}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Created Date</p>
                        <p className="mt-1 text-gray-900">{formatDate(selectedInvoice.created_at)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Due Date</p>
                        <p className="mt-1 text-gray-900">{formatDate(selectedInvoice.due_date)}</p>
                      </div>
                    </div>

                    <div className="border-t-2 border-black pt-4">
                      <h3 className="font-black text-gray-900 mb-4 uppercase tracking-wide text-sm">Amount Breakdown</h3>
                      
                      {/* Summary Cards like AI Estimation Modal */}
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="email-card p-4">
                          <p className="text-sm font-bold text-white uppercase tracking-wide mb-1">Subtotal</p>
                          <p className="text-2xl font-black text-white">{formatCurrency(selectedInvoice.subtotal)}</p>
                        </div>
                        <div className="email-card p-4">
                          <p className="text-sm font-bold text-white uppercase tracking-wide mb-1">Total Due</p>
                          <p className="text-2xl font-black text-[#ccff00]">{formatCurrency(selectedInvoice.total_amount)}</p>
                        </div>
                      </div>

                      {/* Fee Breakdown */}
                      <div className="bg-gray-50 rounded-lg border-2 border-gray-200 p-4 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="font-bold text-gray-600">Subtotal:</span>
                          <span className="font-black text-gray-900">{formatCurrency(selectedInvoice.subtotal)}</span>
                        </div>
                        {selectedInvoice.platform_fee > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="font-bold text-gray-600">Platform Fee (1.5%):</span>
                            <span className="font-black text-gray-900">{formatCurrency(selectedInvoice.platform_fee)}</span>
                          </div>
                        )}
                        {selectedInvoice.tax_amount > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="font-bold text-gray-600">Tax:</span>
                            <span className="font-black text-gray-900">{formatCurrency(selectedInvoice.tax_amount)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-sm border-t-2 border-gray-300 pt-2">
                          <span className="font-black text-gray-900">Total:</span>
                          <span className="font-black text-gray-900">{formatCurrency(selectedInvoice.total_amount)}</span>
                        </div>
                      </div>
                    </div>

                    {selectedInvoice.notes && (
                      <div className="border-t pt-4">
                        <h3 className="font-semibold text-gray-900 mb-2">Notes</h3>
                        <p className="text-gray-600 text-sm">{selectedInvoice.notes}</p>
                      </div>
                    )}

                    {selectedInvoice.payment_method === 'manual' && (
                      <div className="border-t pt-4">
                        <h3 className="font-semibold text-gray-900 mb-2">Payment Status</h3>
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center">
                            <span className={`w-3 h-3 rounded-full mr-2 ${selectedInvoice.client_marked_paid ? 'bg-green-500' : 'bg-gray-300'}`}></span>
                            <span className="text-gray-600">
                              Client marked as paid: {selectedInvoice.client_marked_paid ? formatDate(selectedInvoice.client_marked_paid_at) : 'No'}
                            </span>
                          </div>
                          <div className="flex items-center">
                            <span className={`w-3 h-3 rounded-full mr-2 ${selectedInvoice.developer_verified ? 'bg-green-500' : 'bg-gray-300'}`}></span>
                            <span className="text-gray-600">
                              Developer verified: {selectedInvoice.developer_verified ? formatDate(selectedInvoice.developer_verified_at) : 'No'}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedInvoice.invoice_pdf_url && (
                      <div className="border-t pt-4">
                        <a
                          href={selectedInvoice.invoice_pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center px-4 py-2 email-button-green text-white rounded-lg hover:scale-105 transition-transform duration-200"
                        >
                          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          Download PDF
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Verification Confirmation Modal */}
            {showVerifyModal && selectedInvoice && (
              <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg p-6 max-w-md w-full" style={{
                  border: '1px solid #171717',
                  boxShadow: '2px 2px 0px #171717'
                }}>
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Verify Payment</h2>
                  
                  <div className="mb-6">
                    <p className="text-gray-700 mb-4">
                      Are you sure you want to verify this payment? This action will:
                    </p>
                    <ul className="list-disc list-inside text-gray-600 space-y-2 ml-2">
                      <li>Mark the invoice as paid</li>
                      <li>Update the project budget with {formatCurrency(selectedInvoice.total_amount)}</li>
                      <li>Send confirmation emails to you and the client</li>
                    </ul>
                  </div>

                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="ml-3">
                        <p className="text-sm text-yellow-700">
                          <strong>Important:</strong> Only verify if you have confirmed receipt of payment in your {selectedInvoice.payment_gateway_name || 'payment'} account.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end space-x-4">
                    <button
                      onClick={() => {
                        setShowVerifyModal(false);
                        setSelectedInvoice(null);
                      }}
                      className="px-4 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded font-medium transition-colors duration-200"
                      disabled={verifyMutation.isPending}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleConfirmVerify}
                      className="px-4 py-2 email-button-green text-white rounded hover:scale-105 hover:shadow-lg transition-all duration-200"
                      disabled={verifyMutation.isPending}
                    >
                      {verifyMutation.isPending ? 'Verifying...' : 'Confirm Verification'}
                    </button>
                  </div>
                </div>
              </div>
            )}
              </>
            )}
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
