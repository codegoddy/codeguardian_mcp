'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X, Plus, Trash2, Sparkles, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useMemo } from 'react';
import { Checkbox } from './Checkbox';
import LoadingSpinner from '../LoadingSpinner';
import { aiEstimationApi } from '../../services/aiEstimation';

import { templatesApi } from '../../services/templates';

interface Deliverable {
  title: string;
  description: string;
  estimated_hours: number;
  acceptance_criteria: string;
}

interface Milestone {
  name: string;
  order: number;
  deliverables: Deliverable[];
}

interface GeneratedTemplate {
  name: string;
  description: string;
  category: string;
  template_type: string;
  template_data: {
    default_hourly_rate: number;
    default_change_request_rate: number;
    max_revisions: number;
    milestones: Milestone[];
  };
}

interface AITemplateGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTemplateCreated: () => void;
}

type Step = 'describe' | 'generating' | 'review';

export default function AITemplateGeneratorModal({
  isOpen,
  onClose,
  onTemplateCreated,
}: AITemplateGeneratorModalProps) {
  // Step state
  const [currentStep, setCurrentStep] = useState<Step>('describe');
  
  // Description step state
  const [description, setDescription] = useState('');
  const [projectType, setProjectType] = useState<'code' | 'no-code'>('code');
  const [categoryHint, setCategoryHint] = useState('');
  
  // Generated template state
  const [generatedTemplate, setGeneratedTemplate] = useState<GeneratedTemplate | null>(null);
  
  // Editable form state (populated from generated template)
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateCategory, setTemplateCategory] = useState('');
  const [templateType, setTemplateType] = useState<'code' | 'no-code'>('code');
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  
  // Loading/error states
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    if (!isGenerating && !isSaving) {
      resetForm();
      onClose();
    }
  };

  const resetForm = () => {
    setCurrentStep('describe');
    setDescription('');
    setProjectType('code');
    setCategoryHint('');
    setGeneratedTemplate(null);
    setTemplateName('');
    setTemplateDescription('');
    setTemplateCategory('');
    setTemplateType('code');
    setMilestones([]);
    setError(null);
  };

  const generateTemplate = async () => {
    if (!description.trim() || description.length < 10) {
      setError('Please provide a more detailed description (at least 10 characters)');
      return;
    }

    setError(null);
    setCurrentStep('generating');
    setIsGenerating(true);

    try {
      const result = await aiEstimationApi.generateTemplate(
        description.trim(),
        projectType,
        categoryHint || undefined
      );
      
      // Populate editable form with generated data
      setGeneratedTemplate(result as GeneratedTemplate);
      setTemplateName(result.name);
      setTemplateDescription(result.description);
      setTemplateCategory(result.category);
      setTemplateType(result.template_type === 'no-code' ? 'no-code' : 'code');
      setMilestones(result.template_data.milestones);
      
      setCurrentStep('review');
    } catch (err) {
      console.error('Template generation failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate template');
      setCurrentStep('describe');
    } finally {
      setIsGenerating(false);
    }
  };

  const regenerateTemplate = () => {
    setCurrentStep('describe');
    setGeneratedTemplate(null);
  };

  // Milestone/Deliverable editing functions
  const addMilestone = () => {
    setMilestones([
      ...milestones,
      {
        name: `Milestone ${milestones.length + 1}`,
        order: milestones.length + 1,
        deliverables: [
          {
            title: '',
            description: '',
            estimated_hours: 0,
            acceptance_criteria: ''
          }
        ]
      }
    ]);
  };

  const removeMilestone = (index: number) => {
    if (milestones.length > 1) {
      setMilestones(milestones.filter((_, i) => i !== index));
    }
  };

  const updateMilestone = (index: number, field: string, value: string) => {
    const updated = [...milestones];
    updated[index] = { ...updated[index], [field]: value };
    setMilestones(updated);
  };

  const addDeliverable = (milestoneIndex: number) => {
    const updated = [...milestones];
    updated[milestoneIndex].deliverables.push({
      title: '',
      description: '',
      estimated_hours: 0,
      acceptance_criteria: ''
    });
    setMilestones(updated);
  };

  const removeDeliverable = (milestoneIndex: number, deliverableIndex: number) => {
    const updated = [...milestones];
    if (updated[milestoneIndex].deliverables.length > 1) {
      updated[milestoneIndex].deliverables = updated[milestoneIndex].deliverables.filter((_, i) => i !== deliverableIndex);
      setMilestones(updated);
    }
  };

  const updateDeliverable = (milestoneIndex: number, deliverableIndex: number, field: string, value: string | number) => {
    const updated = [...milestones];
    updated[milestoneIndex].deliverables[deliverableIndex] = {
      ...updated[milestoneIndex].deliverables[deliverableIndex],
      [field]: value
    };
    setMilestones(updated);
  };

  const handleSaveTemplate = async () => {
    if (!templateName || !templateCategory) {
      setError('Please fill in template name and category');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const templateData = {
        name: templateName,
        description: templateDescription,
        category: templateCategory,
        template_type: templateType,
        template_data: {
          default_hourly_rate: generatedTemplate?.template_data?.default_hourly_rate || 100,
          default_change_request_rate: generatedTemplate?.template_data?.default_change_request_rate || 150,
          max_revisions: generatedTemplate?.template_data?.max_revisions || 2,
          milestones
        },
        is_public: false
      };

      await templatesApi.createTemplate(templateData);

      onTemplateCreated();
      handleClose();
    } catch (err) {
      console.error('Failed to save template:', err);
      setError(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setIsSaving(false);
    }
  };

  // Calculate total hours - memoized to avoid recalculation on every render
  const totalHours = useMemo(() => {
    return milestones.reduce((total, milestone) => {
      return total + milestone.deliverables.reduce((sum, d) => sum + (d.estimated_hours || 0), 0);
    }, 0);
  }, [milestones]);

  return (
    <Dialog.Root open={isOpen} onOpenChange={handleClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" style={{ willChange: 'backdrop-filter' }} />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl p-6 w-full max-w-4xl z-50 max-h-[90vh] overflow-y-auto"
          style={{
            border: '1px solid #171717',
            boxShadow: '2px 2px 0px #171717'
          }}
        >
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div 
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ backgroundColor: '#ccff00' }}
              >
                <Sparkles className="w-5 h-5 text-black" />
              </div>
              <div>
                <Dialog.Title className="text-xl font-semibold text-gray-900">
                  {currentStep === 'describe' && 'Generate Template with AI'}
                  {currentStep === 'generating' && 'Generating Your Template...'}
                  {currentStep === 'review' && 'Review & Edit Template'}
                </Dialog.Title>
                <Dialog.Description className="text-sm text-gray-600 mt-1">
                  {currentStep === 'describe' && 'Describe the type of project template you need'}
                  {currentStep === 'generating' && 'AI is creating milestones and deliverables'}
                  {currentStep === 'review' && 'Review the AI-generated template and make any edits'}
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Close"
                disabled={isGenerating || isSaving}
              >
                <X size={20} />
              </button>
            </Dialog.Close>
          </div>

          {/* Step Progress */}
          <div className="flex items-center gap-2 mb-6">
            <div 
              className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                currentStep === 'describe' 
                  ? 'text-black' 
                  : 'bg-gray-200 text-gray-500'
              }`}
              style={{ backgroundColor: currentStep === 'describe' ? '#ccff00' : undefined }}
            >
              1
            </div>
            <div className="flex-1 h-0.5 bg-gray-200">
              <div 
                className="h-full transition-all duration-300"
                style={{ 
                  backgroundColor: '#ccff00',
                  width: currentStep === 'describe' ? '0%' : currentStep === 'generating' ? '50%' : '100%'
                }}
              />
            </div>
            <div 
              className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                currentStep === 'generating' 
                  ? 'text-black' 
                  : currentStep === 'review' 
                    ? 'bg-gray-200 text-gray-500' 
                    : 'bg-gray-200 text-gray-400'
              }`}
              style={{ backgroundColor: currentStep === 'generating' ? '#ccff00' : undefined }}
            >
              2
            </div>
            <div className="flex-1 h-0.5 bg-gray-200">
              <div 
                className="h-full transition-all duration-300"
                style={{ 
                  backgroundColor: '#ccff00',
                  width: currentStep === 'review' ? '100%' : '0%'
                }}
              />
            </div>
            <div 
              className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                currentStep === 'review' 
                  ? 'text-black' 
                  : 'bg-gray-200 text-gray-400'
              }`}
              style={{ backgroundColor: currentStep === 'review' ? '#ccff00' : undefined }}
            >
              3
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Step 1: Describe */}
          {currentStep === 'describe' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Describe Your Template <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-3 text-sm border rounded-lg resize-none"
                  style={{ border: '1px solid #171717' }}
                  placeholder="E.g., I need a template for building a SaaS dashboard with user authentication, subscription billing, analytics dashboard, and admin panel..."
                  rows={5}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Be as specific as possible. Mention key features, integrations, and project phases.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Project Type <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-4">
                    <Checkbox
                      id="ai-type-code"
                      checked={projectType === 'code'}
                      onChange={() => setProjectType('code')}
                      label="Code-Based"
                    />
                    <Checkbox
                      id="ai-type-no-code"
                      checked={projectType === 'no-code'}
                      onChange={() => setProjectType('no-code')}
                      label="No-Code"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Category Hint (Optional)
                  </label>
                  <input
                    type="text"
                    value={categoryHint}
                    onChange={(e) => setCategoryHint(e.target.value)}
                    className="w-full px-3 py-2 text-sm border rounded-lg"
                    style={{ border: '1px solid #171717' }}
                    placeholder="e.g., web_app, mobile, api, ecommerce"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 px-4 py-2 text-sm font-medium black-button"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={generateTemplate}
                  disabled={!description.trim() || description.length < 10}
                  className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-transform duration-200 flex items-center justify-center gap-2 ${
                    description.trim() && description.length >= 10
                      ? 'email-button shadow-lg hover:-translate-y-0.5'
                      : 'bg-gray-200 cursor-not-allowed text-gray-500'
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                  Generate Template
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Generating */}
          {currentStep === 'generating' && (
            <div className="flex flex-col items-center justify-center py-16">
              <LoadingSpinner size="lg" color="black" />
              <p className="mt-4 text-gray-600">AI is analyzing your requirements...</p>
              <p className="mt-2 text-sm text-gray-400">This may take a few seconds</p>
            </div>
          )}

          {/* Step 3: Review & Edit */}
          {currentStep === 'review' && (
            <form onSubmit={(e) => { e.preventDefault(); handleSaveTemplate(); }} className="space-y-6">
              {/* Basic Info */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">Template Information</h3>
                  <button
                    type="button"
                    onClick={regenerateTemplate}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors hover:bg-gray-100"
                    style={{ border: '1px solid #171717' }}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Regenerate
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Template Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      className="w-full px-3 py-2 text-sm border rounded-lg"
                      style={{ border: '1px solid #171717' }}
                      placeholder="e.g., Web Development"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Category <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={templateCategory}
                      onChange={(e) => setTemplateCategory(e.target.value)}
                      className="w-full px-3 py-2 text-sm border rounded-lg"
                      style={{ border: '1px solid #171717' }}
                      placeholder="e.g., Web, Mobile, API"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Template Type <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-6">
                    <Checkbox
                      id="template-type-code"
                      checked={templateType === 'code'}
                      onChange={() => setTemplateType('code')}
                      label="Code-Based (Custom Development)"
                    />
                    <Checkbox
                      id="template-type-no-code"
                      checked={templateType === 'no-code'}
                      onChange={() => setTemplateType('no-code')}
                      label="No-Code (WordPress, Webflow, etc.)"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={templateDescription}
                    onChange={(e) => setTemplateDescription(e.target.value)}
                    className="w-full px-3 py-2 text-sm border rounded-lg"
                    style={{ border: '1px solid #171717' }}
                    placeholder="Describe what this template is for..."
                    rows={2}
                  />
                </div>
            </div>

              {/* Summary Stats */}
              <div className="flex items-center gap-6 p-3 rounded-lg bg-gray-50" style={{ border: '1px solid #e5e7eb' }}>
                <div className="text-sm">
                  <span className="text-gray-500">Milestones:</span>{' '}
                  <span className="font-semibold text-gray-900">{milestones.length}</span>
                </div>
                <div className="text-sm">
                  <span className="text-gray-500">Deliverables:</span>{' '}
                  <span className="font-semibold text-gray-900">
                    {milestones.reduce((sum, m) => sum + m.deliverables.length, 0)}
                  </span>
                </div>
                <div className="text-sm">
                  <span className="text-gray-500">Total Hours:</span>{' '}
                  <span className="font-semibold text-gray-900">{totalHours}h</span>
                </div>
              </div>

              {/* Milestones */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">Milestones & Deliverables</h3>
                  <button
                    type="button"
                    onClick={addMilestone}
                    className="px-3 py-1.5 text-xs font-medium rounded transition-colors flex items-center gap-1"
                    style={{ 
                      backgroundColor: '#ccff00',
                      color: '#171717',
                      border: '1px solid #171717'
                    }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Milestone
                  </button>
                </div>

                <div className="space-y-4">
                  {milestones.map((milestone, mIdx) => (
                    <div 
                      key={mIdx}
                      className="p-4 rounded-lg bg-gray-50"
                      style={{ border: '1px solid #171717' }}
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <div 
                          className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold text-white"
                          style={{ backgroundColor: '#171717' }}
                        >
                          {mIdx + 1}
                        </div>
                        <input
                          type="text"
                          value={milestone.name}
                          onChange={(e) => updateMilestone(mIdx, 'name', e.target.value)}
                          className="flex-1 px-3 py-1.5 text-sm font-semibold border rounded"
                          style={{ border: '1px solid #171717' }}
                          placeholder="Milestone name"
                        />
                        {milestones.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeMilestone(mIdx)}
                            className="p-1.5 hover:bg-red-100 rounded transition-colors"
                            title="Remove milestone"
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </button>
                        )}
                      </div>

                      <div className="ml-8 space-y-3">
                        {milestone.deliverables.map((deliverable, dIdx) => (
                          <div 
                            key={dIdx}
                            className="p-3 bg-white rounded-lg"
                            style={{ 
                              borderLeft: '3px solid #ccff00',
                              border: '1px solid #e5e7eb'
                            }}
                          >
                            <div className="space-y-2">
                              <div className="flex gap-2 items-start">
                                <div className="flex-1">
                                  <label className="block text-xs font-medium text-gray-700 mb-1">
                                    Title
                                  </label>
                                  <input
                                    type="text"
                                    value={deliverable.title}
                                    onChange={(e) => updateDeliverable(mIdx, dIdx, 'title', e.target.value)}
                                    className="w-full px-2 py-1 text-sm font-medium border rounded"
                                    style={{ border: '1px solid #171717' }}
                                    placeholder="Deliverable title"
                                  />
                                </div>
                                <div className="w-24">
                                  <label className="block text-xs font-medium text-gray-700 mb-1">
                                    Hours
                                  </label>
                                  <div className="relative">
                                    <input
                                      type="number"
                                      value={deliverable.estimated_hours || ''}
                                      onChange={(e) => updateDeliverable(mIdx, dIdx, 'estimated_hours', parseFloat(e.target.value) || 0)}
                                      className="w-full px-2 py-1 text-sm border rounded pr-6"
                                      style={{ border: '1px solid #171717' }}
                                      placeholder="0"
                                      min="0"
                                      step="0.5"
                                    />
                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">
                                      h
                                    </span>
                                  </div>
                                </div>
                                {milestone.deliverables.length > 1 && (
                                  <div className="pt-6">
                                    <button
                                      type="button"
                                      onClick={() => removeDeliverable(mIdx, dIdx)}
                                      className="p-1 hover:bg-red-100 rounded transition-colors"
                                      title="Remove deliverable"
                                    >
                                      <Trash2 className="w-3.5 h-3.5 text-red-600" />
                                    </button>
                                  </div>
                                )}
                              </div>
                              <textarea
                                value={deliverable.description}
                                onChange={(e) => updateDeliverable(mIdx, dIdx, 'description', e.target.value)}
                                className="w-full px-2 py-1 text-xs border rounded"
                                style={{ border: '1px solid #171717' }}
                                placeholder="Description"
                                rows={2}
                              />
                              <input
                                type="text"
                                value={deliverable.acceptance_criteria}
                                onChange={(e) => updateDeliverable(mIdx, dIdx, 'acceptance_criteria', e.target.value)}
                                className="w-full px-2 py-1 text-xs border rounded"
                                style={{ border: '1px solid #171717' }}
                                placeholder="Acceptance criteria"
                              />
                            </div>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => addDeliverable(mIdx)}
                          className="w-full px-3 py-2 text-xs font-medium border-2 border-dashed rounded-lg transition-all duration-200 hover:border-solid hover:bg-[#ccff00] hover:text-black hover:shadow-[2px_2px_0px_#171717]"
                          style={{ borderColor: '#171717' }}
                        >
                          + Add Deliverable
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={regenerateTemplate}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium black-button"
                  disabled={isSaving}
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !templateName || !templateCategory}
                  className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 flex items-center justify-center gap-2 ${
                    !isSaving && templateName && templateCategory
                      ? 'email-button shadow-lg transform hover:-translate-y-0.5'
                      : 'bg-gray-200 cursor-not-allowed text-gray-500'
                  }`}
                >
                  {isSaving ? 'Saving...' : 'Save Template'}
                  {!isSaving && <ChevronRight className="w-4 h-4" />}
                </button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
