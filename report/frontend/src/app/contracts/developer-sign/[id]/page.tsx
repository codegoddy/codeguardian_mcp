'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import AuthGuard from '../../../../components/AuthGuard';
import LoadingSpinner from '../../../../components/LoadingSpinner';
import { toast } from '../../../../lib/toast';
import ReactMarkdown from 'react-markdown';
import { CheckCircle, AlertCircle, Shield, PenTool } from 'lucide-react';
import { contractsApi, DeveloperContractPreview } from '../../../../services/contracts';
import { contractKeys } from '../../../../hooks/useContracts';

export default function DeveloperContractSigningPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const contractId = params.id as string;
  
  const [contract, setContract] = useState<DeveloperContractPreview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSigning, setIsSigning] = useState(false);
  const [developerName, setDeveloperName] = useState('');
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    const fetchContract = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const data = await contractsApi.getDeveloperContractPreview(contractId);
        setContract(data);
      } catch (err) {
        console.error('Failed to fetch contract:', err);
        setError(err instanceof Error ? err.message : 'Failed to load contract');
      } finally {
        setIsLoading(false);
      }
    };

    if (contractId) {
      fetchContract();
    }
  }, [contractId]);

  const handleSign = async () => {
    if (!developerName.trim()) {
      toast.error('Name Required', 'Please type your full name to sign the contract');
      return;
    }

    if (!agreed) {
      toast.error('Agreement Required', 'Please confirm that you agree to the terms');
      return;
    }

    setIsSigning(true);

    try {
      await contractsApi.developerSignContract(contractId, {
        developer_name_typed: developerName.trim(),
      });

      toast.success('Contract Signed!', 'Your contract has been sent to the client for their signature.');
      
      // Invalidate contracts cache to refresh the UI
      queryClient.invalidateQueries({ queryKey: contractKeys.all });
      
      // Redirect back to projects page after short delay
      setTimeout(() => {
        router.push('/projects?tab=contract');
      }, 1500);
    } catch (err) {
      console.error('Failed to sign contract:', err);
      toast.error('Signing Failed', err instanceof Error ? err.message : 'Failed to sign contract');
    } finally {
      setIsSigning(false);
    }
  };

  return (
    <AuthGuard>
      {isLoading ? (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <LoadingSpinner />
        </div>
      ) : error ? (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-sm border border-gray-200">
            <div className="flex justify-center mb-6">
              <AlertCircle className="w-12 h-12 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 text-center mb-2">Error</h2>
            <p className="text-gray-600 text-center mb-6">{error}</p>
            <button
              onClick={() => router.push('/projects?tab=contract')}
              className="w-full bg-gray-100 text-gray-700 font-medium py-2 px-4 rounded hover:bg-gray-200 transition-colors"
            >
              Back to Contracts
            </button>
          </div>
        </div>
      ) : !contract ? null : contract.developer_signed ? (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="max-w-md w-full bg-white p-10 shadow-lg border-t-4 border-green-600">
            <div className="flex justify-center mb-6">
              <div className="bg-green-50 p-4 rounded-full">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
            </div>
            <h2 className="text-2xl font-serif font-bold text-gray-900 text-center mb-2">Already Signed</h2>
            <p className="text-gray-600 text-center mb-6 font-serif">
              You signed this contract on {new Date(contract.developer_signed_at!).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
            <button
              onClick={() => router.push('/projects?tab=contract')}
              className="w-full bg-[#ccff00] text-black font-medium py-2 px-4 rounded hover:scale-105 transition-transform"
            >
              Back to Contracts
            </button>
          </div>
        </div>
      ) : (
        <div className="min-h-screen bg-[#e6e6e6] py-8 md:py-12">
          <main className="max-w-[210mm] mx-auto bg-white shadow-xl min-h-[297mm] flex flex-col">
            
            {/* Document Header */}
            <div className="px-12 py-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <div className="flex items-center gap-2 text-gray-500">
                <Shield className="w-4 h-4" />
                <span className="text-xs uppercase tracking-widest font-semibold">Developer Review & Sign</span>
              </div>
              <div className="flex items-center gap-2">
                <PenTool className="w-4 h-4 text-amber-500" />
                <span className="text-xs text-amber-600 font-medium">Awaiting Your Signature</span>
              </div>
            </div>

            {/* Project Info Banner */}
            <div className="px-12 py-4 bg-[#f8f8f8] border-b border-gray-200">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{contract.project_name}</h3>
                  <p className="text-sm text-gray-500">Client: {contract.client_name} ({contract.client_email})</p>
                </div>
              </div>
            </div>

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

              {/* Signature Area */}
              <div className="mt-16 pt-8 border-t border-gray-300">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 mb-8">
                  <h3 className="text-lg font-semibold text-amber-800 mb-2 flex items-center gap-2">
                    <PenTool className="w-5 h-5" />
                    Sign Before Sending to Client
                  </h3>
                  <p className="text-sm text-amber-700">
                    By signing this contract, you confirm you agree to the terms above. 
                    Once signed, this contract will be automatically sent to <strong>{contract.client_name}</strong> for their signature.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                  {/* Signature Block */}
                  <div>
                    <div className="mb-2">
                      <p className="text-sm font-serif italic text-gray-600 mb-6">
                        IN WITNESS WHEREOF, the developer has executed this Agreement as of the date first above written.
                      </p>
                    </div>

                    <div className="space-y-6">
                      <div>
                        <input
                          type="text"
                          value={developerName}
                          onChange={(e) => setDeveloperName(e.target.value)}
                          className="w-full border-b-2 border-dashed border-gray-400 focus:border-black bg-transparent py-2 text-xl font-cursive font-serif placeholder-gray-300 focus:outline-none transition-colors"
                          placeholder="Sign Here (Type Full Name)"
                          disabled={isSigning}
                          style={{ fontFamily: 'Times New Roman, serif' }}
                        />
                        <label className="block mt-1 text-xs uppercase tracking-wider text-gray-500 font-sans">
                          Developer Signature (Type Name)
                        </label>
                      </div>

                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id="agree"
                          checked={agreed}
                          onChange={(e) => setAgreed(e.target.checked)}
                          className="w-4 h-4 text-black border-gray-300 focus:ring-black rounded-sm"
                          disabled={isSigning}
                        />
                        <label htmlFor="agree" className="text-xs text-gray-600 font-sans cursor-pointer select-none">
                          I accept the terms and conditions of this agreement and authorize sending to the client.
                        </label>
                      </div>
                    </div>
                  </div>
                  
                  {/* Actions */}
                  <div className="flex flex-col justify-end gap-3 pb-2">
                    <button
                      onClick={handleSign}
                      disabled={isSigning || !developerName.trim() || !agreed}
                      className="w-full bg-[#ccff00] text-black font-sans font-medium py-3 px-6 rounded hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-md"
                    >
                      {isSigning ? 'Processing...' : 'Sign & Send to Client'}
                    </button>
                    
                    <button
                      onClick={() => router.push('/projects?tab=contract')}
                      disabled={isSigning}
                      className="w-full text-gray-600 hover:text-gray-800 font-sans text-sm font-medium py-2 rounded transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Footer */}
            <div className="px-16 py-8 border-t border-gray-100 mt-auto">
              <p className="text-xs text-gray-400 text-center font-serif">
                Contract ID: {contract.id}
              </p>
            </div>

          </main>
        </div>
      )}
    </AuthGuard>
  );
}
