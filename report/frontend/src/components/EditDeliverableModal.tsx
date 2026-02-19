import React, { useState } from 'react';
import { Deliverable, DeliverableUpdate } from '@/services/deliverables';
import { Milestone } from '@/services/milestones';
import FormModal from './ui/FormModal';
import { SelectField, SelectItem } from './ui/Select';

interface EditDeliverableModalProps {
  isOpen: boolean;
  onClose: () => void;
  deliverable: Deliverable;
  onSave: (data: DeliverableUpdate) => Promise<void>;
  milestones?: Milestone[];
}

export default function EditDeliverableModal({
  isOpen,
  onClose,
  deliverable,
  onSave,
  milestones = [],
}: EditDeliverableModalProps) {
  const [formData, setFormData] = useState<DeliverableUpdate>({
    title: deliverable.title,
    description: deliverable.description || '',
    estimated_hours: deliverable.estimated_hours || undefined,
    status: deliverable.status,
    milestone_id: deliverable.milestone_id,
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(formData);
      onClose();
    } catch (error) {
      console.error('Failed to update deliverable:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormModal isOpen={isOpen} onClose={onClose} title="Edit Deliverable" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Title *
          </label>
          <input
            type="text"
            value={formData.title || ''}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            className="w-full px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            style={{ border: '1px solid #171717' }}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            value={formData.description || ''}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            style={{ border: '1px solid #171717' }}
            rows={3}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Estimated Hours
          </label>
          <input
            type="number"
            step="0.5"
            value={formData.estimated_hours || ''}
            onChange={(e) => setFormData({
              ...formData,
              estimated_hours: e.target.value ? parseFloat(e.target.value) : undefined
            })}
            className="w-full px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            style={{ border: '1px solid #171717' }}
          />
        </div>

        <SelectField
          label="Status"
          value={formData.status || 'pending'}
          onValueChange={(value: string) => setFormData({ ...formData, status: value })}
        >
          <SelectItem value="pending">Pending</SelectItem>
          <SelectItem value="in_progress">In Progress</SelectItem>
          <SelectItem value="completed">Completed</SelectItem>
          <SelectItem value="verified">Verified</SelectItem>
          <SelectItem value="ready_to_bill">Ready to Bill</SelectItem>
          <SelectItem value="billed">Billed</SelectItem>
        </SelectField>

        {milestones.length > 0 && (
          <SelectField
            label="Milestone"
            value={formData.milestone_id || ''}
            onValueChange={(value: string) => setFormData({ ...formData, milestone_id: value || null })}
          >
            <SelectItem value="">No Milestone</SelectItem>
            {milestones.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectField>
        )}

        <div className="flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium email-button"
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </FormModal>
  );
}
