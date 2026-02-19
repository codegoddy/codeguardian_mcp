'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X, Edit2, Check, Plus, Trash2, AlertCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { ProjectTemplate, templatesApi } from '../../services/templates';
import { Checkbox } from './Checkbox';
import { toast } from '../../lib/toast';

interface TemplateEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  template: ProjectTemplate | null;
  onTemplateSaved: () => void;
}

export default function TemplateEditModal({
  isOpen,
  onClose,
  template,
  onTemplateSaved,
}: TemplateEditModalProps) {
  const [loading, setLoading] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateCategory, setTemplateCategory] = useState('');
  const [templateType, setTemplateType] = useState<'code' | 'no-code'>('code');
  
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
  
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [editingMilestoneIndex, setEditingMilestoneIndex] = useState<number | null>(null);
  const [editedMilestoneName, setEditedMilestoneName] = useState<string>('');
  const [editingDeliverable, setEditingDeliverable] = useState<{ milestoneIdx: number; deliverableIdx: number } | null>(null);
  const [editedDeliverable, setEditedDeliverable] = useState<{
    title: string;
    description: string;
    estimated_hours: number;
    acceptance_criteria: string;
  }>({
    title: '',
    description: '',
    estimated_hours: 0,
    acceptance_criteria: ''
  });

  useEffect(() => {
    if (template && isOpen) {
      setTemplateName(template.name);
      setTemplateDescription(template.description || '');
      setTemplateCategory(template.category || '');
      setTemplateType((template.template_type as 'code' | 'no-code') || 'code');
      setMilestones(JSON.parse(JSON.stringify(template.template_data.milestones)));
    }
  }, [template, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!template) {
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
          ...template.template_data,
          milestones: milestones
        }
      };

      // If it's a system template, create a new custom template
      if (template.is_system_template) {
        await templatesApi.createTemplate(templateData);
        toast.success(
          'Custom Template Created',
          `Your custom template "${templateName}" has been created successfully!`
        );
      } else {
        // Update existing custom template
        await templatesApi.updateTemplate(template.id, templateData);
        toast.success(
          'Template Updated',
          `Template "${templateName}" has been updated successfully!`
        );
      }

      onTemplateSaved();
      handleClose();
    } catch (error) {
      console.error('Failed to save template:', error);
      const errorMessage = error instanceof Error ? error.message : 'Please try again.';
      toast.error('Save Failed', `Failed to save template. ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setTemplateName('');
      setTemplateDescription('');
      setTemplateCategory('');
      setTemplateType('code');
      setMilestones([]);
      setEditingMilestoneIndex(null);
      setEditedMilestoneName('');
      setEditingDeliverable(null);
      onClose();
    }
  };

  const handleEditMilestone = (index: number, currentName: string) => {
    setEditingMilestoneIndex(index);
    setEditedMilestoneName(currentName);
  };

  const handleSaveMilestone = (index: number) => {
    const updatedMilestones = [...milestones];
    updatedMilestones[index] = {
      ...updatedMilestones[index],
      name: editedMilestoneName
    };
    setMilestones(updatedMilestones);
    setEditingMilestoneIndex(null);
    setEditedMilestoneName('');
  };

  const handleCancelEdit = () => {
    setEditingMilestoneIndex(null);
    setEditedMilestoneName('');
  };

  const handleEditDeliverable = (milestoneIdx: number, deliverableIdx: number, deliverable: {
    title: string;
    description: string;
    estimated_hours: number;
    acceptance_criteria: string;
  }) => {
    setEditingDeliverable({ milestoneIdx, deliverableIdx });
    setEditedDeliverable({
      title: deliverable.title,
      description: deliverable.description,
      estimated_hours: deliverable.estimated_hours,
      acceptance_criteria: deliverable.acceptance_criteria
    });
  };

  const handleSaveDeliverable = () => {
    if (!editingDeliverable) return;

    const updatedMilestones = [...milestones];
    updatedMilestones[editingDeliverable.milestoneIdx].deliverables[editingDeliverable.deliverableIdx] = {
      ...editedDeliverable
    };
    setMilestones(updatedMilestones);
    setEditingDeliverable(null);
    setEditedDeliverable({
      title: '',
      description: '',
      estimated_hours: 0,
      acceptance_criteria: ''
    });
  };

  const handleCancelDeliverableEdit = () => {
    setEditingDeliverable(null);
    setEditedDeliverable({
      title: '',
      description: '',
      estimated_hours: 0,
      acceptance_criteria: ''
    });
  };

  const handleAddMilestone = () => {
    const newMilestone = {
      name: 'New Milestone',
      order: milestones.length + 1,
      deliverables: []
    };
    setMilestones([...milestones, newMilestone]);
  };

  const handleDeleteMilestone = (index: number) => {
    if (confirm('Are you sure you want to delete this milestone?')) {
      const updatedMilestones = milestones.filter((_, idx) => idx !== index);
      // Reorder remaining milestones
      updatedMilestones.forEach((m, idx) => {
        m.order = idx + 1;
      });
      setMilestones(updatedMilestones);
    }
  };

  const handleAddDeliverable = (milestoneIdx: number) => {
    const newDeliverable = {
      title: 'New Deliverable',
      description: 'Description',
      estimated_hours: 0,
      acceptance_criteria: 'Acceptance criteria'
    };
    const updatedMilestones = [...milestones];
    updatedMilestones[milestoneIdx].deliverables.push(newDeliverable);
    setMilestones(updatedMilestones);
  };

  const handleDeleteDeliverable = (milestoneIdx: number, deliverableIdx: number) => {
    if (confirm('Are you sure you want to delete this deliverable?')) {
      const updatedMilestones = [...milestones];
      updatedMilestones[milestoneIdx].deliverables = updatedMilestones[milestoneIdx].deliverables.filter(
        (_: Deliverable, idx: number) => idx !== deliverableIdx
      );
      setMilestones(updatedMilestones);
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={handleClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl p-6 w-full max-w-3xl z-50 max-h-[85vh] overflow-y-auto"
          style={{
            border: '1px solid #171717',
            boxShadow: '2px 2px 0px #171717'
          }}
        >
          <div className="flex items-start justify-between mb-4">
            <div>
              <Dialog.Title className="text-xl font-semibold text-gray-900">
                {template?.is_system_template ? 'Edit Template (Save as Custom)' : 'Edit Template'}
              </Dialog.Title>
              <Dialog.Description className="text-sm text-gray-600 mt-1">
                {template?.is_system_template 
                  ? 'Changes will be saved as a new custom template'
                  : 'Modify your custom template'}
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

          {/* System Template Notice */}
          {template?.is_system_template && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-blue-900 mb-1">
                  Editing System Template
                </h4>
                <p className="text-sm text-blue-700">
                  System templates cannot be modified directly. When you save, a new custom template will be created with your changes. The original system template will remain unchanged.
                </p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Template Basic Info */}
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Template Name
                </label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                  style={{ border: '1px solid #171717' }}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={templateDescription}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                  style={{ border: '1px solid #171717' }}
                  rows={2}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category
                </label>
                <input
                  type="text"
                  value={templateCategory}
                  onChange={(e) => setTemplateCategory(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                  style={{ border: '1px solid #171717' }}
                  placeholder="e.g., Web, Mobile, E-commerce"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Template Type
                </label>
                <div className="flex gap-6">
                  <Checkbox
                    id="edit-template-type-code"
                    checked={templateType === 'code'}
                    onChange={() => setTemplateType('code')}
                    label="Code-Based (Custom Development)"
                  />
                  <Checkbox
                    id="edit-template-type-no-code"
                    checked={templateType === 'no-code'}
                    onChange={() => setTemplateType('no-code')}
                    label="No-Code (WordPress, Webflow, etc.)"
                  />
                </div>
              </div>
            </div>

            {/* Milestones & Deliverables */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-gray-900">Milestones & Deliverables</h4>
                <button
                  type="button"
                  onClick={handleAddMilestone}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded transition-all duration-200 hover:scale-105"
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
              <div 
                className="max-h-96 overflow-y-auto rounded-lg bg-white"
                style={{ border: '1px solid #171717' }}
              >
                <div className="p-4 space-y-4">
                  {milestones.map((milestone, idx) => (
                    <div key={idx} className="space-y-2">
                      <div className="flex items-center gap-2 sticky top-0 bg-white py-2 z-10 border-b border-gray-200">
                        <div 
                          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0"
                          style={{ backgroundColor: '#171717' }}
                        >
                          {milestone.order}
                        </div>
                        {editingMilestoneIndex === idx ? (
                          <>
                            <input
                              type="text"
                              value={editedMilestoneName}
                              onChange={(e) => setEditedMilestoneName(e.target.value)}
                              className="flex-1 text-sm font-semibold text-gray-900 px-2 py-1 border rounded"
                              style={{ border: '1px solid #171717' }}
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleSaveMilestone(idx);
                                } else if (e.key === 'Escape') {
                                  handleCancelEdit();
                                }
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveMilestone(idx)}
                              className="p-1 hover:bg-gray-100 rounded transition-colors"
                              title="Save"
                            >
                              <Check className="w-4 h-4 text-green-600" />
                            </button>
                            <button
                              type="button"
                              onClick={handleCancelEdit}
                              className="p-1 hover:bg-gray-100 rounded transition-colors"
                              title="Cancel"
                            >
                              <X className="w-4 h-4 text-red-600" />
                            </button>
                          </>
                        ) : (
                          <>
                            <h5 className="text-sm font-semibold text-gray-900 flex-1">{milestone.name}</h5>
                            <span className="text-xs text-gray-500">
                              ({milestone.deliverables.length} deliverable{milestone.deliverables.length !== 1 ? 's' : ''})
                            </span>
                            <button
                              type="button"
                              onClick={() => handleEditMilestone(idx, milestone.name)}
                              className="p-1 hover:bg-gray-100 rounded transition-colors"
                              title="Edit milestone name"
                            >
                              <Edit2 className="w-4 h-4 text-gray-600" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteMilestone(idx)}
                              className="p-1 hover:bg-red-100 rounded transition-colors"
                              title="Delete milestone"
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </button>
                          </>
                        )}
                      </div>
                      <div className="ml-9 space-y-2 pb-2">
                        {milestone.deliverables.map((deliverable: Deliverable, dIdx: number) => {
                          const isEditing = editingDeliverable?.milestoneIdx === idx && editingDeliverable?.deliverableIdx === dIdx;
                          
                          return (
                            <div 
                              key={dIdx} 
                              className="p-3 bg-gray-50 rounded-lg"
                              style={{ 
                                borderLeft: '3px solid #ccff00',
                                border: '1px solid #e5e7eb'
                              }}
                            >
                              {isEditing ? (
                                <div className="space-y-3">
                                  <div>
                                    <label className="text-xs font-medium text-gray-700 mb-1 block">Title</label>
                                    <input
                                      type="text"
                                      value={editedDeliverable.title}
                                      onChange={(e) => setEditedDeliverable({ ...editedDeliverable, title: e.target.value })}
                                      className="w-full text-sm font-semibold text-gray-900 px-2 py-1 border rounded"
                                      style={{ border: '1px solid #171717' }}
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs font-medium text-gray-700 mb-1 block">Description</label>
                                    <textarea
                                      value={editedDeliverable.description}
                                      onChange={(e) => setEditedDeliverable({ ...editedDeliverable, description: e.target.value })}
                                      className="w-full text-xs text-gray-600 px-2 py-1 border rounded"
                                      style={{ border: '1px solid #171717' }}
                                      rows={2}
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs font-medium text-gray-700 mb-1 block">Acceptance Criteria</label>
                                    <input
                                      type="text"
                                      value={editedDeliverable.acceptance_criteria}
                                      onChange={(e) => setEditedDeliverable({ ...editedDeliverable, acceptance_criteria: e.target.value })}
                                      className="w-full text-xs text-gray-500 px-2 py-1 border rounded"
                                      style={{ border: '1px solid #171717' }}
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs font-medium text-gray-700 mb-1 block">Estimated Hours</label>
                                    <input
                                      type="number"
                                      value={editedDeliverable.estimated_hours}
                                      onChange={(e) => setEditedDeliverable({ ...editedDeliverable, estimated_hours: parseFloat(e.target.value) || 0 })}
                                      className="w-24 text-xs font-semibold px-2 py-1 border rounded"
                                      style={{ border: '1px solid #171717' }}
                                      min="0"
                                      step="0.5"
                                    />
                                  </div>
                                  <div className="flex gap-2 pt-2">
                                    <button
                                      type="button"
                                      onClick={handleSaveDeliverable}
                                      className="flex-1 px-3 py-1.5 text-xs font-medium rounded transition-all duration-200 hover:scale-105 hover:shadow-md"
                                      style={{ 
                                        backgroundColor: '#ccff00',
                                        color: '#171717',
                                        border: '1px solid #171717'
                                      }}
                                    >
                                      Save Changes
                                    </button>
                                    <button
                                      type="button"
                                      onClick={handleCancelDeliverableEdit}
                                      className="px-3 py-1.5 text-xs font-medium rounded transition-all duration-200 border hover:bg-gray-100 hover:scale-105"
                                      style={{ border: '1px solid #171717' }}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-gray-900 mb-1">{deliverable.title}</p>
                                    <p className="text-xs text-gray-600 mb-2">{deliverable.description}</p>
                                    <div className="flex items-start gap-1">
                                      <span className="text-xs text-gray-500">✓</span>
                                      <p className="text-xs text-gray-500 italic">
                                        {deliverable.acceptance_criteria}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex flex-col items-end gap-2">
                                    <span 
                                      className="text-xs font-semibold px-2 py-1 rounded whitespace-nowrap"
                                      style={{ 
                                        backgroundColor: '#ccff00',
                                        color: '#171717',
                                        border: '1px solid #171717'
                                      }}
                                    >
                                      {deliverable.estimated_hours}h
                                    </span>
                                    <div className="flex gap-1">
                                      <button
                                        type="button"
                                        onClick={() => handleEditDeliverable(idx, dIdx, deliverable)}
                                        className="p-1 hover:bg-gray-200 rounded transition-colors"
                                        title="Edit deliverable"
                                      >
                                        <Edit2 className="w-3.5 h-3.5 text-gray-600" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteDeliverable(idx, dIdx)}
                                        className="p-1 hover:bg-red-200 rounded transition-colors"
                                        title="Delete deliverable"
                                      >
                                        <Trash2 className="w-3.5 h-3.5 text-red-600" />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => handleAddDeliverable(idx)}
                          className="w-full py-2 text-xs font-medium border-2 border-dashed rounded-lg hover:bg-gray-50 transition-colors"
                          style={{ borderColor: '#171717' }}
                        >
                          + Add Deliverable
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div 
                className="mt-2 p-2 rounded text-xs font-medium text-center"
                style={{ 
                  backgroundColor: '#f5f5f5',
                  border: '1px solid #171717'
                }}
              >
                Total estimated hours: {milestones.reduce((sum, m) => 
                  sum + m.deliverables.reduce((dSum: number, d: Deliverable) => dSum + d.estimated_hours, 0), 0
                )}h
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
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
                disabled={loading}
                className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                  !loading
                    ? 'email-button shadow-lg transform hover:-translate-y-0.5'
                    : 'bg-gray-200 cursor-not-allowed text-gray-500'
                }`}
              >
                {loading 
                  ? 'Saving...' 
                  : template?.is_system_template 
                    ? 'Create Custom Template' 
                    : 'Save Changes'
                }
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
