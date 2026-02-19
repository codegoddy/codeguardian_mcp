'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '../../../components/AuthGuard';
import { contractsApi } from '../../../services/contracts';
import LoadingSpinner from '../../../components/LoadingSpinner';
import { toast } from '../../../lib/toast';

export default function ContractTemplatePage() {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [missingVariables, setMissingVariables] = useState<string[]>([]);
  
  const [template, setTemplate] = useState(`# Service Agreement

This Service Agreement ("Agreement") is entered into between **{{DEVELOPER_NAME}}** and **{{CLIENT_NAME}}**.

## Project Details

**Project Name:** {{PROJECT_NAME}}

**Project Budget:** {{PROJECT_BUDGET}}

**Hourly Rate:** {{HOURLY_RATE}}

**Change Request Rate:** {{CHANGE_REQUEST_RATE}}

**Maximum Revisions:** {{MAX_REVISIONS}}

## Scope of Work

The Developer agrees to provide the following services:

{{MILESTONES_AND_DELIVERABLES}}

## Payment Terms

- **Total Project Cost:** {{PROJECT_BUDGET}}
- **Payment Schedule:**
  - 30% upfront payment
  - 40% at midpoint
  - 30% upon completion

## Timeline

- **Project Start Date:** {{START_DATE}}
- **Estimated Completion:** {{END_DATE}}
- **Maximum Revisions:** {{MAX_REVISIONS}}

## Terms and Conditions

1. **Intellectual Property:** Upon full payment, the Client will own all rights to the final deliverables.

2. **Revisions:** The Client is entitled to **{{MAX_REVISIONS}}** per deliverable at no additional cost.

3. **Change Requests:** Additional work beyond the agreed scope will be billed at the hourly rate.

4. **Timeline:** The Developer will make reasonable efforts to meet the project timeline.

5. **Communication:** Both parties agree to maintain open communication throughout the project.

## Contact Information

**Developer:** {{DEVELOPER_NAME}}  
**Client:** {{CLIENT_NAME}}  
**Email:** {{CLIENT_EMAIL}}

---

By signing below, both parties agree to the terms and conditions outlined in this Agreement.`);

  // Load template on mount
  useEffect(() => {
    const loadTemplate = async () => {
      try {
        setIsLoading(true);
        const defaultTemplate = await contractsApi.getDefaultTemplate();
        setTemplate(defaultTemplate.template_content);
        validateTemplate(defaultTemplate.template_content);
        
        // Optionally show a subtle info message if using default
        if (!defaultTemplate.is_saved) {
          console.log('Using default template (not yet saved)');
        }
      } catch (error) {
        console.error('Failed to load template:', error);
        // If API fails, keep the hardcoded default that's already in state
        // Only show error toast for actual API failures
        toast.error('Could not connect to server', 'Using offline default template. Your changes will be saved when you click Save.');
      } finally {
        setIsLoading(false);
      }
    };

    loadTemplate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    if (!validateTemplate(template)) {
      toast.error(
        'Cannot save template',
        `Missing required variables: ${missingVariables.join(', ')}`
      );
      return;
    }

    setIsSaving(true);
    try {
      await contractsApi.saveDefaultTemplate(template);
      toast.success('Template saved successfully!', 'Your contract template has been saved.');
      router.push('/projects');
    } catch (error) {
      console.error('Failed to save template:', error);
      toast.error('Failed to save template', 'Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTemplateChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newTemplate = e.target.value;
    setTemplate(newTemplate);
    validateTemplate(newTemplate);
  };

  const systemVariables = [
    { name: '{{DEVELOPER_NAME}}', description: 'Developer/Company name (logged in user)', required: true },
    { name: '{{PROJECT_NAME}}', description: 'Project name from project details', required: true },
    { name: '{{CLIENT_NAME}}', description: 'Client full name', required: true },
    { name: '{{CLIENT_EMAIL}}', description: 'Client email address', required: true },
    { name: '{{PROJECT_BUDGET}}', description: 'Total project budget', required: true },
    { name: '{{HOURLY_RATE}}', description: 'Hourly billing rate', required: true },
    { name: '{{CHANGE_REQUEST_RATE}}', description: 'Rate for change requests', required: true },
    { name: '{{MAX_REVISIONS}}', description: 'Maximum number of revisions', required: true },
    { name: '{{START_DATE}}', description: 'Project start date', required: true },
    { name: '{{END_DATE}}', description: 'Project end date', required: true },
    { name: '{{MILESTONES_AND_DELIVERABLES}}', description: 'Project milestones with their deliverables', required: true },
  ];

  const validateTemplate = (templateText: string) => {
    const missing: string[] = [];
    systemVariables.forEach((variable) => {
      if (variable.required && !templateText.includes(variable.name)) {
        missing.push(variable.name);
      }
    });
    setMissingVariables(missing);
    return missing.length === 0;
  };

  if (isLoading) {
    return (
      <AuthGuard>
        <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#F5F5F5" }}>
          <div className="flex items-center">
            <LoadingSpinner />
            <span className="ml-3 text-gray-600">Loading template...</span>
          </div>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="min-h-screen" style={{ backgroundColor: "#F5F5F5" }}>
        <main>
          <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
            {/* Header */}
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-normal text-black mb-2">Edit Contract Template</h1>
                <p className="text-sm text-gray-600">
                  Customize your contract template. Use system variables for dynamic content.
                </p>
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => router.push('/projects')}
                  className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  style={{ border: '1px solid #171717' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving || missingVariables.length > 0}
                  className="px-4 py-2 text-sm font-medium email-button disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? 'Saving...' : 'Save Template'}
                </button>
              </div>
            </div>

            {/* Disclaimer */}
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-start">
                <svg className="w-5 h-5 text-yellow-600 mr-3 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <h3 className="text-sm font-medium text-yellow-800 mb-1">Global Template</h3>
                  <p className="text-sm text-yellow-700">
                    This template will be used for all projects. Any changes you make here will apply to all future contracts generated across your workspace.
                  </p>
                </div>
              </div>
            </div>

            {/* Missing Variables Warning */}
            {missingVariables.length > 0 && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start">
                  <svg className="w-5 h-5 text-red-600 mr-3 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <h3 className="text-sm font-medium text-red-800 mb-1">Missing Required Variables</h3>
                    <p className="text-sm text-red-700 mb-2">
                      The following required variables are missing from your template:
                    </p>
                    <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
                      {missingVariables.map((variable) => (
                        <li key={variable} className="font-mono">{variable}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* System Variables Reference */}
            <div className="mb-6">
              <div className="rounded-2xl p-6 bg-white">
                <h3 className="text-lg font-medium text-black mb-4">System Variables</h3>
                <p className="text-sm text-gray-600 mb-4">
                  These variables will be automatically replaced with actual values when generating contracts. Copy and paste them into your template where needed.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {systemVariables.map((variable) => (
                    <div key={variable.name} className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                      <code className="text-xs font-mono px-2 py-1 bg-gray-100 rounded text-black break-all block mb-2">
                        {variable.name}
                      </code>
                      <p className="text-xs text-gray-600">{variable.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Markdown Formatting Guide */}
            <div className="mb-6">
              <div className="rounded-2xl p-6 bg-white">
                <h3 className="text-lg font-medium text-black mb-4">Markdown Formatting Guide</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Use these markdown symbols to format your contract and make it look professional:
                </p>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Headings */}
                  <div className="space-y-3">
                    <div className="border-b border-gray-200 pb-2">
                      <h4 className="text-sm font-semibold text-black mb-2">Headings</h4>
                    </div>
                    <div className="space-y-2">
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <code className="text-xs font-mono text-black block mb-1"># Main Title</code>
                        <p className="text-xs text-gray-600">Large centered heading with underline</p>
                      </div>
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <code className="text-xs font-mono text-black block mb-1">## Section Heading</code>
                        <p className="text-xs text-gray-600">Medium heading with bottom border</p>
                      </div>
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <code className="text-xs font-mono text-black block mb-1">### Subsection</code>
                        <p className="text-xs text-gray-600">Smaller heading for milestones</p>
                      </div>
                    </div>
                  </div>

                  {/* Text Formatting */}
                  <div className="space-y-3">
                    <div className="border-b border-gray-200 pb-2">
                      <h4 className="text-sm font-semibold text-black mb-2">Text Formatting</h4>
                    </div>
                    <div className="space-y-2">
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <code className="text-xs font-mono text-black block mb-1">**Bold Text**</code>
                        <p className="text-xs text-gray-600">Makes text bold and prominent</p>
                      </div>
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <code className="text-xs font-mono text-black block mb-1">*Italic Text*</code>
                        <p className="text-xs text-gray-600">Makes text italic</p>
                      </div>
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <code className="text-xs font-mono text-black block mb-1">Text  (two spaces)</code>
                        <p className="text-xs text-gray-600">Line break - add 2 spaces at end</p>
                      </div>
                    </div>
                  </div>

                  {/* Lists */}
                  <div className="space-y-3">
                    <div className="border-b border-gray-200 pb-2">
                      <h4 className="text-sm font-semibold text-black mb-2">Lists</h4>
                    </div>
                    <div className="space-y-2">
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <code className="text-xs font-mono text-black block mb-1">- List item<br />- Another item</code>
                        <p className="text-xs text-gray-600">Bullet point list</p>
                      </div>
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <code className="text-xs font-mono text-black block mb-1">1. First item<br />2. Second item</code>
                        <p className="text-xs text-gray-600">Numbered list</p>
                      </div>
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <code className="text-xs font-mono text-black block mb-1">  - Nested item</code>
                        <p className="text-xs text-gray-600">Indent with 2 spaces for sub-items</p>
                      </div>
                    </div>
                  </div>

                  {/* Horizontal Rule */}
                  <div className="space-y-3">
                    <div className="border-b border-gray-200 pb-2">
                      <h4 className="text-sm font-semibold text-black mb-2">Separators</h4>
                    </div>
                    <div className="space-y-2">
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <code className="text-xs font-mono text-black block mb-1">---</code>
                        <p className="text-xs text-gray-600">Horizontal line separator</p>
                      </div>
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <code className="text-xs font-mono text-black block mb-1">(blank line)</code>
                        <p className="text-xs text-gray-600">Add spacing between sections</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Example Section */}
                <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h4 className="text-sm font-semibold text-blue-900 mb-2">💡 Quick Example</h4>
                  <pre className="text-xs font-mono text-blue-900 overflow-x-auto whitespace-pre-wrap">
{`## Project Details

**Project Name:** {{PROJECT_NAME}}  
**Budget:** {{PROJECT_BUDGET}}

### Milestone 1
- Deliverable one
- Deliverable two

---

**Note:** Use two spaces at line end for breaks`}
                  </pre>
                </div>
              </div>
            </div>

            {/* Editor */}
            <div className="mb-6">
              <div className="rounded-2xl p-6 bg-white">
                <h3 className="text-lg font-medium text-black mb-4">Template Content</h3>
                <textarea
                  value={template}
                  onChange={handleTemplateChange}
                  className="w-full p-4 border border-gray-300 rounded-lg font-mono text-sm resize-none outline-none"
                  style={{ border: '1px solid #171717', minHeight: '800px' }}
                  placeholder="Enter your contract template here..."
                />
                <p className="mt-2 text-xs text-gray-500">
                  Supports Markdown formatting. Use system variables for dynamic content.
                </p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
