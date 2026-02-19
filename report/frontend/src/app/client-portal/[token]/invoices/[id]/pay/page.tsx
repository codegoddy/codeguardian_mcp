'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import LoadingSpinner from '../../../../../../components/LoadingSpinner';
import { useCurrencyFormat } from '../../../../../../hooks/use-currency-format';
import { clientPortalService, ClientPortalInvoiceDetail } from '../../../../../../services/clientPortal';
import { 
  ArrowLeft,
  FileText,
  CheckCircle,
  CreditCard,
  Building2,
  AlertCircle,
  Download
} from 'lucide-react';

export default function ClientPortalPaymentPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const invoiceId = params.id as string;
  const { formatWithCurrency } = useCurrencyFormat();
  
  const [invoice, setInvoice] = useState<ClientPortalInvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const fetchInvoice = async () => {
      try {
        const response = await clientPortalService.getInvoiceDetail(token, invoiceId);
        if (response.success && response.data) {
          setInvoice(response.data);
        } else {
          setError(response.error || 'Failed to load invoice');
        }
      } catch {
        setError('Failed to load invoice');
      } finally {
        setLoading(false);
      }
    };

    fetchInvoice();
  }, [token, invoiceId]);

  const handleMarkAsPaid = async () => {
    if (!invoice) return;
    
    setMarking(true);
    try {
      const response = await clientPortalService.markInvoicePaid(token, invoiceId);
      if (response.success) {
        setSuccess(true);
        // Update local state
        setInvoice(prev => prev ? { ...prev, status: 'awaiting_verification', client_marked_paid: true } : null);
      } else {
        alert(response.error || 'Failed to mark as paid');
      }
    } catch {
      alert('Failed to mark as paid');
    } finally {
      setMarking(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#F5F5F5" }}>
        <div className="flex items-center">
          <LoadingSpinner />
          <span className="ml-3 text-gray-600">Loading payment details...</span>
        </div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#F5F5F5" }}>
        <div className="max-w-md w-full mx-4">
          <div className="p-6 rounded-lg bg-white" style={{ border: '1px solid #ef4444' }}>
            <div className="flex items-center mb-4">
              <AlertCircle className="w-6 h-6 text-red-600 mr-3" />
              <h2 className="text-lg font-semibold text-gray-900">Error</h2>
            </div>
            <p className="text-gray-600 mb-4">{error || 'Invoice not found'}</p>
            <button
              onClick={() => router.push(`/client-portal/${token}/invoices`)}
              className="px-4 py-2 text-sm font-medium black-button"
            >
              Back to Invoices
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isManualPayment = invoice.payment_method === 'manual';
  const isPaid = invoice.status === 'paid';
  const isAwaitingVerification = invoice.status === 'awaiting_verification';

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F5F5F5" }}>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push(`/client-portal/${token}/invoices`)}
            className="flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Invoices
          </button>
          <h1 className="text-2xl font-semibold text-black">Pay Invoice</h1>
        </div>

        {/* Success Message */}
        {success && (
          <div className="mb-6 p-4 rounded-lg bg-green-50 border border-green-200">
            <div className="flex items-center">
              <CheckCircle className="w-5 h-5 text-green-600 mr-3" />
              <div>
                <p className="font-medium text-green-800">Payment marked as complete!</p>
                <p className="text-sm text-green-700">The developer will verify your payment shortly.</p>
              </div>
            </div>
          </div>
        )}

        {/* Invoice Summary */}
        <div className="bg-white rounded-2xl p-6 mb-6">
          <div className="flex items-center space-x-3 mb-4">
            <FileText className="w-6 h-6 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">{invoice.invoice_number}</h2>
          </div>
          
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <span className="text-sm text-gray-500">Project</span>
              <p className="font-medium text-gray-900">{invoice.project_name}</p>
            </div>
            <div>
              <span className="text-sm text-gray-500">Status</span>
              <p className="font-medium text-gray-900 capitalize">{invoice.status.replace(/_/g, ' ')}</p>
            </div>
            {invoice.due_date && (
              <div>
                <span className="text-sm text-gray-500">Due Date</span>
                <p className="font-medium text-gray-900">
                  {new Date(invoice.due_date).toLocaleDateString('en-GB')}
                </p>
              </div>
            )}
          </div>

          <div className="border-t border-gray-200 pt-4">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-600">Subtotal</span>
              <span className="text-gray-900">{formatWithCurrency(invoice.subtotal, invoice.currency)}</span>
            </div>
            {invoice.tax_amount > 0 && (
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-600">Tax</span>
                <span className="text-gray-900">{formatWithCurrency(invoice.tax_amount, invoice.currency)}</span>
              </div>
            )}
            {invoice.platform_fee > 0 && (
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-600">Platform Fee</span>
                <span className="text-gray-900">{formatWithCurrency(invoice.platform_fee, invoice.currency)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-semibold border-t border-gray-200 pt-2 mt-2">
              <span className="text-gray-900">Total</span>
              <span className="text-gray-900">{formatWithCurrency(invoice.total_amount, invoice.currency)}</span>
            </div>
          </div>
          
          {invoice.invoice_pdf_url && (
            <a
              href={invoice.invoice_pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center mt-4 text-sm text-blue-600 hover:text-blue-800"
            >
              <Download className="w-4 h-4 mr-1" />
              Download Invoice PDF
            </a>
          )}
        </div>

        {/* Payment Section */}
        {isPaid ? (
          <div className="bg-green-50 rounded-2xl p-6 border border-green-200">
            <div className="flex items-center">
              <CheckCircle className="w-8 h-8 text-green-600 mr-4" />
              <div>
                <h3 className="text-lg font-semibold text-green-800">Invoice Paid</h3>
                <p className="text-green-700">This invoice has been fully paid and verified.</p>
              </div>
            </div>
          </div>
        ) : isAwaitingVerification ? (
          <div className="bg-yellow-50 rounded-2xl p-6 border border-yellow-200">
            <div className="flex items-center">
              <AlertCircle className="w-8 h-8 text-yellow-600 mr-4" />
              <div>
                <h3 className="text-lg font-semibold text-yellow-800">Awaiting Verification</h3>
                <p className="text-yellow-700">You&apos;ve marked this invoice as paid. The developer will verify your payment.</p>
              </div>
            </div>
          </div>
        ) : isManualPayment ? (
          <div className="bg-white rounded-2xl p-6">
            <div className="flex items-center space-x-3 mb-4">
              <Building2 className="w-6 h-6 text-gray-600" />
              <h2 className="text-lg font-semibold text-gray-900">Payment Instructions</h2>
            </div>
            
            {invoice.payment_gateway_name && (
              <div className="mb-4">
                <span className="text-sm text-gray-500">Payment Method</span>
                <p className="font-semibold text-gray-900 text-lg">{invoice.payment_gateway_name}</p>
              </div>
            )}

            {/* Mobile Money Details */}
            {invoice.payment_details?.mobile_money_provider && (
              <div className="bg-blue-50 rounded-lg p-4 mb-4 border border-blue-200">
                <h3 className="text-sm font-semibold text-blue-900 mb-3 flex items-center">
                  <CreditCard className="w-4 h-4 mr-2" />
                  Mobile Money Details
                </h3>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <span className="text-xs text-blue-600 uppercase tracking-wide">Provider</span>
                    <p className="font-semibold text-gray-900 text-lg">{invoice.payment_details.mobile_money_provider}</p>
                  </div>
                  {invoice.payment_details.mobile_money_number && (
                    <div>
                      <span className="text-xs text-blue-600 uppercase tracking-wide">Phone Number</span>
                      <p className="font-semibold text-gray-900 text-lg font-mono">{invoice.payment_details.mobile_money_number}</p>
                    </div>
                  )}
                  {invoice.payment_details.mobile_money_name && (
                    <div>
                      <span className="text-xs text-blue-600 uppercase tracking-wide">Account Name</span>
                      <p className="font-semibold text-gray-900 text-lg">{invoice.payment_details.mobile_money_name}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Bank Transfer Details */}
            {invoice.payment_details?.bank_name && (
              <div className="bg-green-50 rounded-lg p-4 mb-4 border border-green-200">
                <h3 className="text-sm font-semibold text-green-900 mb-3 flex items-center">
                  <Building2 className="w-4 h-4 mr-2" />
                  Bank Transfer Details
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <span className="text-xs text-green-600 uppercase tracking-wide">Bank Name</span>
                    <p className="font-semibold text-gray-900">{invoice.payment_details.bank_name}</p>
                  </div>
                  {invoice.payment_details.account_name && (
                    <div>
                      <span className="text-xs text-green-600 uppercase tracking-wide">Account Name</span>
                      <p className="font-semibold text-gray-900">{invoice.payment_details.account_name}</p>
                    </div>
                  )}
                  {invoice.payment_details.account_number && (
                    <div>
                      <span className="text-xs text-green-600 uppercase tracking-wide">Account Number</span>
                      <p className="font-semibold text-gray-900 font-mono">{invoice.payment_details.account_number}</p>
                    </div>
                  )}
                  {invoice.payment_details.swift_code && (
                    <div>
                      <span className="text-xs text-green-600 uppercase tracking-wide">SWIFT Code</span>
                      <p className="font-semibold text-gray-900 font-mono">{invoice.payment_details.swift_code}</p>
                    </div>
                  )}
                  {invoice.payment_details.branch_code && (
                    <div>
                      <span className="text-xs text-green-600 uppercase tracking-wide">Branch Code</span>
                      <p className="font-semibold text-gray-900 font-mono">{invoice.payment_details.branch_code}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* PayPal Details */}
            {invoice.payment_details?.paypal_email && (
              <div className="bg-indigo-50 rounded-lg p-4 mb-4 border border-indigo-200">
                <h3 className="text-sm font-semibold text-indigo-900 mb-3">PayPal</h3>
                <div>
                  <span className="text-xs text-indigo-600 uppercase tracking-wide">PayPal Email</span>
                  <p className="font-semibold text-gray-900">{invoice.payment_details.paypal_email}</p>
                </div>
              </div>
            )}

            {/* Wise Details */}
            {invoice.payment_details?.wise_email && (
              <div className="bg-teal-50 rounded-lg p-4 mb-4 border border-teal-200">
                <h3 className="text-sm font-semibold text-teal-900 mb-3">Wise</h3>
                <div>
                  <span className="text-xs text-teal-600 uppercase tracking-wide">Wise Email</span>
                  <p className="font-semibold text-gray-900">{invoice.payment_details.wise_email}</p>
                </div>
              </div>
            )}

            {/* Cryptocurrency Details */}
            {invoice.payment_details?.crypto_wallet_address && (
              <div className="bg-orange-50 rounded-lg p-4 mb-4 border border-orange-200">
                <h3 className="text-sm font-semibold text-orange-900 mb-3">Cryptocurrency</h3>
                <div className="space-y-2">
                  {invoice.payment_details.crypto_network && (
                    <div>
                      <span className="text-xs text-orange-600 uppercase tracking-wide">Network</span>
                      <p className="font-semibold text-gray-900">{invoice.payment_details.crypto_network}</p>
                    </div>
                  )}
                  <div>
                    <span className="text-xs text-orange-600 uppercase tracking-wide">Wallet Address</span>
                    <p className="font-semibold text-gray-900 font-mono text-sm break-all">{invoice.payment_details.crypto_wallet_address}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Additional Info */}
            {invoice.payment_details?.additional_info && (
              <div className="bg-gray-50 rounded-lg p-4 mb-4 border border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Additional Information</h3>
                <p className="text-gray-900 whitespace-pre-wrap">{invoice.payment_details.additional_info}</p>
              </div>
            )}
            
            {invoice.payment_instructions && (
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <p className="text-sm font-medium text-gray-700 mb-2">Payment Instructions:</p>
                <p className="text-gray-900 whitespace-pre-wrap">{invoice.payment_instructions}</p>
              </div>
            )}
            
            <div className="border-t border-gray-200 pt-4">
              <p className="text-sm text-gray-600 mb-4">
                After making your payment using the details above, click the button below to notify the developer.
              </p>
              <button
                onClick={handleMarkAsPaid}
                disabled={marking || invoice.client_marked_paid}
                className="w-full flex items-center justify-center px-6 py-3 text-sm font-medium email-button-green text-white border border-black rounded-lg hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {marking ? (
                  <>
                    <LoadingSpinner />
                    <span className="ml-2">Processing...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5 mr-2" />
                    I&apos;ve Made the Payment
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-6">
            <div className="flex items-center space-x-3 mb-4">
              <CreditCard className="w-6 h-6 text-blue-600" />
              <h2 className="text-lg font-semibold text-gray-900">Pay with Paystack</h2>
            </div>
            <p className="text-gray-600 mb-6">
              Click below to securely pay this invoice using Paystack.
            </p>
            <button
              className="w-full flex items-center justify-center px-6 py-3 text-sm font-medium email-button-blue text-white border border-black rounded-lg hover:scale-105 transition-transform"
              onClick={() => {
                // TODO: Implement Paystack payment
                alert('Paystack integration coming soon!');
              }}
            >
              <CreditCard className="w-5 h-5 mr-2" />
              Pay {formatWithCurrency(invoice.total_amount, invoice.currency)}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
