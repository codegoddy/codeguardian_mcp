'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import LoadingSpinner from '../../../../components/LoadingSpinner';
import { toast } from '../../../../lib/toast';
import ReactMarkdown from 'react-markdown';
import { CheckCircle, AlertCircle, Shield } from 'lucide-react';
import { contractKeys } from '../../../../hooks/useContracts';

interface ContractData {
  id: string;
  project_id: string;
  client_id: string;
  contract_content: string;
  contract_pdf_url: string | null;
  signed: boolean;
  signed_at: string | null;
  signing_token: string;
  signing_token_expires_at: string;
  created_at: string;
  developer_signed: boolean;
  developer_signed_at: string | null;
  developer_name_typed: string | null;
  developer_name: string | null;
  client_name: string;
}

export default function ContractSigningPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const token = params.token as string;
  
  const [contract, setContract] = useState<ContractData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSigning, setIsSigning] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);
  const [clientName, setClientName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [showDeclineModal, setShowDeclineModal] = useState(false);

  useEffect(() => {
    const fetchContract = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/contracts/sign/${token}`);
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || 'Failed to load contract');
        }

        const data = await response.json();
        setContract(data);
        // Pre-fill client name from profile (editable)
        if (data.client_name) {
          setClientName(data.client_name);
        }
      } catch (err) {
        console.error('Failed to fetch contract:', err);
        setError(err instanceof Error ? err.message : 'Failed to load contract');
      } finally {
        setIsLoading(false);
      }
    };

    if (token) {
      fetchContract();
    }
  }, [token]);

  const handleSign = async () => {
    if (!clientName.trim()) {
      toast.error('Name Required', 'Please type your full name to sign the contract');
      return;
    }

    if (!agreed) {
      toast.error('Agreement Required', 'Please confirm that you agree to the terms');
      return;
    }

    setIsSigning(true);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/contracts/sign/${token}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_name_typed: clientName.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to sign contract');
      }

      const data = await response.json();
      toast.success('Contract Signed!', 'Your project is now active. Check your email for portal access.');
      
      // Invalidate contracts cache to refresh the UI
      queryClient.invalidateQueries({ queryKey: contractKeys.all });
      
      // Show success state
      setContract(prev => prev ? { ...prev, signed: true, signed_at: data.signed_at } : null);
    } catch (err) {
      console.error('Failed to sign contract:', err);
      toast.error('Signing Failed', err instanceof Error ? err.message : 'Failed to sign contract');
    } finally {
      setIsSigning(false);
    }
  };

  const handleDecline = async () => {
    setIsDeclining(true);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/contracts/decline/${token}`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to decline contract');
      }

      toast.success('Contract Declined', 'The developer has been notified of your decision.');
      router.push('/');
    } catch (err) {
      console.error('Failed to decline contract:', err);
      toast.error('Decline Failed', err instanceof Error ? err.message : 'Failed to decline contract');
    } finally {
      setIsDeclining(false);
      setShowDeclineModal(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-sm border border-gray-200">
          <div className="flex justify-center mb-6">
            <AlertCircle className="w-12 h-12 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 text-center mb-2">Unavailable</h2>
          <p className="text-gray-600 text-center mb-6">{error}</p>
        </div>
      </div>
    );
  }

  if (!contract) {
    return null;
  }

  if (contract.signed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white p-10 shadow-lg border-t-4 border-green-600">
          <div className="flex justify-center mb-6">
            <div className="bg-green-50 p-4 rounded-full">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
          </div>
          <h2 className="text-2xl font-serif font-bold text-gray-900 text-center mb-2">Agreement Signed</h2>
          <p className="text-gray-600 text-center mb-0 font-serif">
            Executed on {new Date(contract.signed_at!).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </div>
    );
  }

  // const expiryDate = new Date(contract.signing_token_expires_at);
  // const daysUntilExpiry = Math.ceil((expiryDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));

  return (
    <div className="min-h-screen bg-[#e6e6e6] py-8 md:py-12">
      <main className="max-w-[210mm] mx-auto bg-white shadow-xl min-h-[297mm] flex flex-col">
        
        {/* Document Header Label (Subtle) */}
        <div className="px-12 py-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 print:hidden">
          <div className="flex items-center gap-2 text-gray-500">
            <Shield className="w-4 h-4" />
            <span className="text-xs uppercase tracking-widest font-semibold">Secure Document</span>
          </div>
          <div className="text-xs text-gray-400">
            ID: {contract.id.substring(0, 8)}
          </div>
        </div>

        {/* Developer Info Banner */}
        {contract.developer_signed && (
          <div className="px-12 py-4 bg-green-50 border-b border-green-200">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{contract.developer_name || 'Developer'}</h3>
                <p className="text-sm text-gray-500">Developer</p>
              </div>
              <div className="flex items-center gap-2 text-green-700 bg-white px-3 py-1 rounded-full border border-green-200">
                <CheckCircle className="w-4 h-4" />
                <span className="text-xs font-medium">
                  Signed {contract.developer_signed_at ? new Date(contract.developer_signed_at).toLocaleDateString() : ''}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Content Area */}
        <div className="px-12 py-12 md:px-16 md:py-16 flex-1">
          <div className="prose prose-slate max-w-none contract-content font-serif">
             <style jsx>{`
              .contract-content {
                color: #000;
                line-height: 1.6;
              }
              .contract-content :global(h1) {
                text-align: center;
                text-decoration: underline;
                text-underline-offset: 8px;
                font-size: 24pt;
                font-weight: 700;
                color: #000;
                margin-bottom: 2rem;
                text-transform: uppercase;
                letter-spacing: 0.05em;
              }
              .contract-content :global(h2) {
                font-size: 14pt;
                font-weight: 700;
                color: #000;
                border-bottom: 1px solid #000;
                padding-bottom: 4px;
                margin-top: 2.5rem;
                margin-bottom: 1rem;
              }
              .contract-content :global(h3) {
                font-size: 12pt;
                font-weight: 700;
                color: #333;
                margin-top: 1.5rem;
                margin-bottom: 0.5rem;
              }
              .contract-content :global(p) {
                text-align: justify;
                margin-bottom: 1em;
                font-size: 11pt;
              }
              .contract-content :global(ul), .contract-content :global(ol) {
                margin: 0.5em 0 1em 2em;
              }
              .contract-content :global(li) {
                margin-bottom: 0.25em;
                font-size: 11pt;
              }
              .contract-content :global(strong) {
                font-weight: bold;
                color: #000;
              }
              .contract-content :global(hr) {
                border-top: 1px solid #ccc;
                margin: 2em 0;
              }
            `}</style>
            <ReactMarkdown>{contract.contract_content}</ReactMarkdown>
          </div>

          <div className="mt-16 pt-8 border-t border-gray-300">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
               
               {/* Signature Block */}
               <div>
                  <div className="mb-2">
                    <p className="text-sm font-serif italic text-gray-600 mb-6">
                      IN WITNESS WHEREOF, the client has executed this Agreement as of the date first above written.
                    </p>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <input
                        type="text"
                        value={clientName}
                        onChange={(e) => setClientName(e.target.value)}
                        className="w-full border-b-2 border-dashed border-gray-400 focus:border-black bg-transparent py-2 text-xl font-cursive font-serif placeholder-gray-300 focus:outline-none transition-colors"
                        placeholder="Sign Here (Type Full Name)"
                        disabled={isSigning || isDeclining}
                        style={{ fontFamily: 'Times New Roman, serif' }}
                      />
                      <label className="block mt-1 text-xs uppercase tracking-wider text-gray-500 font-sans">
                        Client Signature (Edit if needed)
                      </label>
                    </div>

                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="agree"
                        checked={agreed}
                        onChange={(e) => setAgreed(e.target.checked)}
                        className="w-4 h-4 text-black border-gray-300 focus:ring-black rounded-sm"
                        disabled={isSigning || isDeclining}
                      />
                      <label htmlFor="agree" className="text-xs text-gray-600 font-sans cursor-pointer select-none">
                        I accept the terms and conditions of this agreement.
                      </label>
                    </div>
                  </div>
               </div>
               
               {/* Actions */}
               <div className="flex flex-col justify-end gap-3 pb-2">
                 <button
                    onClick={handleSign}
                    disabled={isSigning || isDeclining || !clientName.trim() || !agreed}
                    className="w-full bg-[#ccff00] text-black font-sans font-medium py-3 px-6 rounded hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-md"
                  >
                    {isSigning ? 'Processing...' : 'Complete & Sign Agreement'}
                  </button>
                  
                  <button
                    onClick={() => setShowDeclineModal(true)}
                    disabled={isSigning || isDeclining}
                    className="w-full text-red-600 hover:text-red-800 font-sans text-sm font-medium py-2 rounded transition-colors"
                  >
                    Decline Agreement
                  </button>
               </div>
             </div>
          </div>
        </div>
        
        {/* Footer for print */}
        <div className="px-16 py-8 border-t border-gray-100 mt-auto hidden print:block">
           <p className="text-xs text-gray-400 text-center font-serif">
             Page 1 of 1 • {contract.id}
           </p>
        </div>

      </main>

      {/* Decline Modal (Professional) */}
      {showDeclineModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-2 font-serif">Decline Agreement</h3>
            <p className="text-sm text-gray-600 mb-6 font-sans">
              Are you sure you wish to decline? This action will notify the issuer and cannot be undone.
            </p>
            <div className="flex justify-end gap-3 font-sans text-sm">
              <button
                onClick={() => setShowDeclineModal(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                disabled={isDeclining}
              >
                Cancel
              </button>
              <button
                onClick={handleDecline}
                disabled={isDeclining}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                {isDeclining ? 'Processing...' : 'Decline'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
