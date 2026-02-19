'use client';

import { useState } from 'react';
import { contractsApi, ContractSignature } from '@/services/contracts';

interface ContractSectionProps {
  projectId: string;
  projectName: string;
  contractStatus?: 'none' | 'awaiting_signature' | 'signed';
  contractData?: ContractSignature | null;
  onContractGenerated?: (contract: ContractSignature) => void;
  onContractSent?: () => void;
}

export default function ContractSection({
  projectId,
  projectName,
  contractStatus = 'none',
  contractData = null,
  onContractGenerated,
  onContractSent,
}: ContractSectionProps) {
  const [contractType, setContractType] = useState<'auto' | 'custom' | null>(null);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedPdfUrl, setUploadedPdfUrl] = useState<string>('');
  const [showSendConfirmation, setShowSendConfirmation] = useState(false);

  const handleGenerateContract = async () => {
    setGenerating(true);
    setError(null);

    try {
      // Get the default template first
      const templateResponse = await contractsApi.getDefaultTemplate();
      const templateId = templateResponse.id || 'default';

      const contract = await contractsApi.generateContract({
        project_id: projectId,
        template_id: templateId,
      });

      if (onContractGenerated) {
        onContractGenerated(contract);
      }

      alert('Contract generated successfully!');
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to generate contract');
    } finally {
      setGenerating(false);
    }
  };

  const handleUploadContract = async () => {
    if (!uploadedPdfUrl.trim()) {
      setError('Please enter a PDF URL');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const contract = await contractsApi.uploadContract({
        project_id: projectId,
        contract_pdf_url: uploadedPdfUrl,
      });

      if (onContractGenerated) {
        onContractGenerated(contract);
      }

      alert('Contract uploaded successfully!');
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to upload contract');
    } finally {
      setUploading(false);
    }
  };

  const handleSendContract = async () => {
    setSending(true);
    setError(null);

    try {
      const result = await contractsApi.sendContract({
        project_id: projectId,
      });

      if (onContractSent) {
        onContractSent();
      }

      setShowSendConfirmation(false);
      alert(`Contract sent successfully! Signing link expires on ${new Date(result.expires_at).toLocaleDateString()}`);
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to send contract');
    } finally {
      setSending(false);
    }
  };

  // No contract yet - show selection
  if (contractStatus === 'none' && !contractData) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Contract Setup</h2>
        <p className="text-gray-600 mb-6">
          Choose how you want to create the contract for {projectName}
        </p>

        {!contractType && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={() => setContractType('auto')}
              className="p-6 border-2 border-gray-300 rounded-lg hover:border-green-500 hover:bg-green-50 transition-colors text-left"
            >
              <div className="flex items-center mb-3">
                <svg className="w-8 h-8 text-green-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h3 className="text-lg font-semibold text-gray-900">Generate Auto Contract</h3>
              </div>
              <p className="text-sm text-gray-600">
                Automatically generate a contract from your project details using our template
              </p>
            </button>

            <button
              onClick={() => setContractType('custom')}
              className="p-6 border-2 border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left"
            >
              <div className="flex items-center mb-3">
                <svg className="w-8 h-8 text-blue-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <h3 className="text-lg font-semibold text-gray-900">Upload Custom Contract</h3>
              </div>
              <p className="text-sm text-gray-600">
                Upload your own contract PDF that you&apos;ve prepared separately
              </p>
            </button>
          </div>
        )}

        {contractType === 'auto' && (
          <div className="mt-6 p-6 bg-green-50 border border-green-200 rounded-lg">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Auto-Generate Contract</h3>
            <p className="text-sm text-gray-600 mb-4">
              We&apos;ll create a professional contract using your project details, including budget, rates, and revision limits.
            </p>
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">
                {error}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={handleGenerateContract}
                disabled={generating}
                className="px-6 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generating ? 'Generating...' : 'Generate Contract'}
              </button>
              <button
                onClick={() => setContractType(null)}
                className="px-6 py-2 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300"
              >
                Back
              </button>
            </div>
          </div>
        )}

        {contractType === 'custom' && (
          <div className="mt-6 p-6 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Upload Custom Contract</h3>
            <p className="text-sm text-gray-600 mb-4">
              Enter the URL of your contract PDF (must be uploaded to Cloudinary or similar service first).
            </p>
            <div className="mb-4">
              <label htmlFor="pdfUrl" className="block text-sm font-medium text-gray-700 mb-2">
                Contract PDF URL
              </label>
              <input
                type="url"
                id="pdfUrl"
                value={uploadedPdfUrl}
                onChange={(e) => setUploadedPdfUrl(e.target.value)}
                placeholder="https://res.cloudinary.com/..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">
                {error}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={handleUploadContract}
                disabled={uploading || !uploadedPdfUrl.trim()}
                className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? 'Uploading...' : 'Upload Contract'}
              </button>
              <button
                onClick={() => setContractType(null)}
                className="px-6 py-2 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300"
              >
                Back
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Contract awaiting signature
  if (contractStatus === 'awaiting_signature' || (contractData && !contractData.signed)) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-gray-900">Contract Status</h2>
          <span className="px-3 py-1 bg-yellow-100 text-yellow-800 text-sm font-medium rounded-full">
            Awaiting Signature
          </span>
        </div>

        <p className="text-gray-600 mb-6">
          The contract has been created and is ready to be sent to the client for signature.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">
            {error}
          </div>
        )}

        <button
          onClick={() => setShowSendConfirmation(true)}
          className="px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700"
        >
          Send Contract to Client
        </button>

        {/* Send Confirmation Modal */}
        {showSendConfirmation && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-xl font-bold text-gray-900 mb-4">Send Contract?</h3>
              <p className="text-gray-600 mb-6">
                This will send a signing link to the client via email. The link will expire in 7 days.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleSendContract}
                  disabled={sending}
                  className="flex-1 px-4 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {sending ? 'Sending...' : 'Send Contract'}
                </button>
                <button
                  onClick={() => setShowSendConfirmation(false)}
                  disabled={sending}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Contract signed
  if (contractStatus === 'signed' || (contractData && contractData.signed)) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-gray-900">Contract Status</h2>
          <span className="px-3 py-1 bg-green-100 text-green-800 text-sm font-medium rounded-full flex items-center">
            <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Signed
          </span>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
          <p className="text-sm text-green-800 mb-2">
            <strong>Signed by:</strong> {contractData?.client_name_typed}
          </p>
          <p className="text-sm text-green-800">
            <strong>Signed on:</strong> {contractData?.signed_at ? new Date(contractData.signed_at).toLocaleString() : 'N/A'}
          </p>
        </div>

        {contractData?.contract_pdf_url && (
          <a
            href={contractData.contract_pdf_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Download Signed Contract
          </a>
        )}

        <p className="mt-4 text-sm text-gray-600">
          You can now proceed with setting up the project scope guardrail.
        </p>
      </div>
    );
  }

  return null;
}
