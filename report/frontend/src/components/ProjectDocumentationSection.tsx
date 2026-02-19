'use client';

import React, { useState } from 'react';
import { documentationApi } from '@/services/documentation';
import DocumentationViewer from './DocumentationViewer';
import { ButtonSpinner } from '@/components/ui';

interface ProjectDocumentationSectionProps {
  projectId: string;
  projectName: string;
}

export default function ProjectDocumentationSection({
  projectId,
  projectName,
}: ProjectDocumentationSectionProps) {
  const [documentation, setDocumentation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDocumentation, setShowDocumentation] = useState(false);

  const handleGenerateDocumentation = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await documentationApi.getProjectDocumentation(projectId);
      setDocumentation(response.data.documentation);
      setShowDocumentation(true);
    } catch (err) {
      setError('Failed to generate project documentation. Please try again.');
      console.error('Error generating documentation:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Project Documentation</h3>
          <p className="text-sm text-gray-500 mt-1">
            Auto-generated comprehensive project documentation
          </p>
        </div>
        {!showDocumentation && (
          <button
            onClick={handleGenerateDocumentation}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <ButtonSpinner size="sm" />
                Generating...
              </>
            ) : (
              <>
                <svg
                  className="w-4 h-4 inline mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                Generate Documentation
              </>
            )}
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {showDocumentation && documentation && (
        <div className="mt-6">
          <DocumentationViewer
            documentation={documentation}
            title={`${projectName} - Complete Documentation`}
            showRegenerateButton={false}
          />
          <button
            onClick={() => setShowDocumentation(false)}
            className="mt-4 px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-md transition-colors"
          >
            Hide Documentation
          </button>
        </div>
      )}

      {!showDocumentation && !loading && (
        <div className="text-center py-8 text-gray-500">
          <svg
            className="w-16 h-16 mx-auto mb-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <p className="text-sm">
            Generate comprehensive project documentation including all milestones, deliverables, and metrics.
          </p>
        </div>
      )}
    </div>
  );
}
