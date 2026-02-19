'use client';

import React, { useState, useEffect } from 'react';
import { documentationApi } from '@/services/documentation';
import DocumentationViewer from './DocumentationViewer';

interface DeliverableDocumentationProps {
  deliverableId: string;
  deliverableTitle: string;
  autoLoad?: boolean;
}

export default function DeliverableDocumentation({
  deliverableId,
  deliverableTitle,
  autoLoad = false,
}: DeliverableDocumentationProps) {
  const [documentation, setDocumentation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDocumentation, setShowDocumentation] = useState(autoLoad);

  useEffect(() => {
    if (autoLoad) {
      loadDocumentation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliverableId, autoLoad]);

  const loadDocumentation = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await documentationApi.getDeliverableDocumentation(deliverableId);
      setDocumentation(response.data.documentation);
      setShowDocumentation(true);
    } catch (err) {
      setError('Failed to load documentation. Please try again.');
      console.error('Error loading documentation:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    setError(null);
    
    try {
      const response = await documentationApi.regenerateDeliverableDocumentation(deliverableId);
      setDocumentation(response.data.documentation);
    } catch (err) {
      setError('Failed to regenerate documentation. Please try again.');
      console.error('Error regenerating documentation:', err);
    } finally {
      setRegenerating(false);
    }
  };

  if (!showDocumentation && !autoLoad) {
    return (
      <button
        onClick={loadDocumentation}
        disabled={loading}
        className="text-sm text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
      >
        {loading ? 'Loading...' : 'View Documentation'}
      </button>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <svg
          className="animate-spin h-8 w-8 text-blue-600"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-md">
        <p className="text-sm text-red-600">{error}</p>
        <button
          onClick={loadDocumentation}
          className="mt-2 text-sm text-red-700 hover:text-red-800 font-medium"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!documentation) {
    return null;
  }

  return (
    <DocumentationViewer
      documentation={documentation}
      title={deliverableTitle}
      onRegenerate={handleRegenerate}
      isRegenerating={regenerating}
      showRegenerateButton={true}
    />
  );
}
