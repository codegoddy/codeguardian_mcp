'use client';

import { useState } from 'react';
import { useClients, useDeleteClient } from '@/hooks/useClients';
import type { Client } from '@/services/clients';
import AuthGuard from '../../components/AuthGuard';
import LoadingSpinner from '../../components/LoadingSpinner';
import ClientModal from '../../components/ui/ClientModal';
import ClientDetailsSidebar from '../../components/ClientDetailsSidebar';
import { useSettings } from '@/hooks/useSettings';
import { AlertCircle, Trash2 } from 'lucide-react';

export default function ClientsPage() {
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Use the clients hook with Redis caching
  const { data: clients, isLoading, error } = useClients();
  const deleteMutation = useDeleteClient();
  const { data: settings } = useSettings();

  // Get user's currency from settings, default to USD
  const userCurrency = settings?.default_currency || 'USD';

  // Map currency codes to symbols
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

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      setDeleteConfirmId(null);
    } catch (error) {
      alert(`Failed to delete client: ${(error as Error).message}`);
    }
  };

  const handleClientCreated = (client: Client) => {
    setIsClientModalOpen(false);
    setSelectedClient(client);
    setIsSidebarOpen(true);
  };

  const handleViewClient = (client: Client) => {
    setSelectedClient(client);
    setIsSidebarOpen(true);
  };

  const handleCloseSidebar = () => {
    setIsSidebarOpen(false);
    setTimeout(() => setSelectedClient(null), 300);
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

  if (isLoading) {
    return (
      <AuthGuard>
        <div className="min-h-screen" style={{ backgroundColor: '#F5F5F5' }}>
          <main>
            <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-center py-12">
                <LoadingSpinner />
                <span className="ml-3 text-gray-400">Loading clients...</span>
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
                    <p className="text-sm text-red-700">Error loading clients: {(error as Error).message}</p>
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
            {/* Page Header */}
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-2xl font-normal text-black">Clients</h2>
              <button
                onClick={() => setIsClientModalOpen(true)}
                className="px-4 py-2 text-sm font-medium rounded-full hover:scale-105 transition-transform duration-200"
                style={{ backgroundColor: '#ccff00', color: '#000' }}
              >
                Add Client
              </button>
            </div>

            {/* Clients Table */}
            <div className="mb-8 rounded-2xl p-6 bg-white">
              {!clients || clients.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-gray-400 mb-4">
                    <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No clients yet</h3>
                  <p className="text-gray-500 mb-6">Get started by creating your first client.</p>
                  <button
                    onClick={() => setIsClientModalOpen(true)}
                    className="px-4 py-2 text-sm font-medium rounded-full hover:scale-105 transition-transform duration-200"
                    style={{ backgroundColor: '#ccff00', color: '#000' }}
                  >
                    Create your first client
                  </button>
                </div>
              ) : (
                <>
                  <div className="mb-6 flex items-center justify-between">
                    <h3 className="text-xl font-medium text-black">All Clients</h3>
                  </div>

                  <div className="pt-6">
                    {/* Table Header */}
                    <div className="pb-4 border-b-2 border-gray-300">
                      <div className="flex items-center gap-8">
                        <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide" style={{ width: '90px', flexShrink: 0 }}>
                          Payment
                        </div>
                        <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide" style={{ width: '160px', flexShrink: 0 }}>
                          Client Name
                        </div>
                        <div className="flex-1 text-xs font-semibold text-gray-700 uppercase tracking-wide min-w-0">
                          Email
                        </div>
                        <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide" style={{ width: '120px', flexShrink: 0 }}>
                          Hourly Rate
                        </div>
                        <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide" style={{ width: '110px', flexShrink: 0 }}>
                          Actions
                        </div>
                      </div>
                    </div>

                    {/* Client Rows */}
                    {clients?.map((client: Client, index: number) => (
                      <div
                        key={client.id}
                        className={`py-4 ${index !== clients.length - 1 ? 'border-b border-gray-200' : ''}`}
                      >
                        <div className="flex items-center gap-8">
                          <span
                            className={`px-3 py-1 text-xs font-medium rounded-full ${getPaymentMethodBadgeColor(client.payment_method)}`}
                            style={{ width: '90px', textAlign: 'center', display: 'inline-block', flexShrink: 0 }}
                          >
                            {client.payment_method}
                          </span>
                          <div className="text-sm font-semibold text-gray-900" style={{ width: '160px', flexShrink: 0 }}>
                            {client.name}
                          </div>
                          <div className="flex-1 text-sm text-gray-600 min-w-0 truncate">
                            {client.email}
                          </div>
                          <div className="text-sm text-gray-900 font-medium" style={{ width: '120px', flexShrink: 0 }}>
                            {currencySymbol}{client.default_hourly_rate}/hr
                          </div>
                          <div className="flex items-center gap-2" style={{ width: '110px', flexShrink: 0 }}>
                            <button
                              onClick={() => handleViewClient(client)}
                              className="px-3 py-1 text-xs font-medium text-black rounded-full hover:scale-105 transition-transform duration-200"
                              style={{ backgroundColor: '#ccff00' }}
                            >
                              View
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(client.id)}
                              className="p-1.5 hover:bg-red-100 rounded transition-colors"
                              title="Delete client"
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Client Modal */}
            <ClientModal
              isOpen={isClientModalOpen}
              onClose={() => setIsClientModalOpen(false)}
              onClientCreated={handleClientCreated}
            />

            {/* Client Details Sidebar */}
            <ClientDetailsSidebar
              client={selectedClient}
              isOpen={isSidebarOpen}
              onClose={handleCloseSidebar}
            />

            {/* Delete Confirmation Modal */}
            {deleteConfirmId && (
              <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg p-6 max-w-md w-full" style={{
                  border: '1px solid #171717',
                  boxShadow: '2px 2px 0px #171717'
                }}>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Delete Client</h3>
                  <p className="text-gray-600 mb-6">
                    Are you sure you want to delete this client? This action cannot be undone.
                  </p>
                  <div className="flex justify-end space-x-4">
                    <button
                      onClick={() => setDeleteConfirmId(null)}
                      className="px-4 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded font-medium transition-colors duration-200"
                      disabled={deleteMutation.isPending}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleDelete(deleteConfirmId)}
                      className="px-4 py-2 email-button-red text-white rounded hover:scale-105 hover:shadow-lg transition-all duration-200"
                      disabled={deleteMutation.isPending}
                    >
                      {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
