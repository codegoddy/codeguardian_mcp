'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Checkbox } from './Checkbox';

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

interface CreateTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTemplateCreated: () => void;
}

export default function CreateTemplateModal({
  isOpen,
  onClose,
  onTemplateCreated,
}: CreateTemplateModalProps) {
  const [loading, setLoading] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateCategory, setTemplateCategory] = useState('');
  const [templateType, setTemplateType] = useState<'code' | 'no-code'>('code');
  const [milestones, setMilestones] = useState<Milestone[]>([
    {
      name: 'Milestone 1',
      order: 1,
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

  const handleClose = () => {
    if (!loading) {
      resetForm();
      onClose();
    }
  };

  const resetForm = () => {
    setTemplateName('');
    setTemplateDescription('');
    setTemplateCategory('');
    setTemplateType('code');
    setMilestones([
      {
        name: 'Milestone 1',
        order: 1,
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!templateName || !templateCategory) {
      alert('Please fill in template name and category');
      return;
    }

    setLoading(true);
    try {
      const templateData = {
        name: templateName,
        description: templateDescription,
        category: templateCategory,
        template_type: templateType,
        template_data: {
          milestones
        },
        is_public: false
      };

      // Call API to create template
      const response = await fetch('/api/templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(templateData)
      });

      if (!response.ok) {
        throw new Error('Failed to create template');
      }

      const result = await response.json();
      console.log('Template created:', result);
      alert('Template created successfully!');
      onTemplateCreated();
      handleClose();
    } catch (error) {
      console.error('Failed to create template:', error);
      alert('Failed to create template. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={handleClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl p-6 w-full max-w-4xl z-50 max-h-[90vh] overflow-y-auto"
          style={{
            border: '1px solid #171717',
            boxShadow: '2px 2px 0px #171717'
          }}
        >
          <div className="flex items-start justify-between mb-4">
            <div>
              <Dialog.Title className="text-xl font-semibold text-gray-900">
                Create Custom Template
              </Dialog.Title>
              <Dialog.Description className="text-sm text-gray-600 mt-1">
                Build your own project template with custom milestones and deliverables
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Close"
                disabled={loading}
              >
                <X size={20} />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Info */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900">Template Information</h3>
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
                        className="w-full px-3 py-2 text-xs font-medium border-2 border-dashed rounded-lg hover:bg-gray-50 transition-colors"
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
                onClick={handleClose}
                className="flex-1 px-4 py-2 text-sm font-medium black-button"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !templateName || !templateCategory}
                className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                  !loading && templateName && templateCategory
                    ? 'email-button shadow-lg transform hover:-translate-y-0.5'
                    : 'bg-gray-200 cursor-not-allowed text-gray-500'
                }`}
              >
                {loading ? 'Creating...' : 'Create Template'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
