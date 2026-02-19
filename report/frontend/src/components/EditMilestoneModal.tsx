import React, { useState } from 'react';
import { Milestone, MilestoneUpdate } from '@/services/milestones';
import FormModal from './ui/FormModal';
import { SelectField, SelectItem } from './ui/Select';
import CalendarModal from './ui/CalendarModal';

interface EditMilestoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  milestone: Milestone;
  onSave: (data: MilestoneUpdate) => Promise<void>;
}

export default function EditMilestoneModal({
  isOpen,
  onClose,
  milestone,
  onSave,
}: EditMilestoneModalProps) {
  const [formData, setFormData] = useState<MilestoneUpdate>({
    name: milestone.name,
    description: milestone.description || '',
    target_date: milestone.target_date || undefined,
    status: milestone.status,
  });
  const [saving, setSaving] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(formData);
      onClose();
    } catch (error) {
      console.error('Failed to update milestone:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormModal isOpen={isOpen} onClose={onClose} title="Edit Milestone" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Name *
          </label>
          <input
            type="text"
            value={formData.name || ''}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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
            Target Date
          </label>
          <div className="relative">
            <input
              type="text"
              value={formData.target_date ? new Date(formData.target_date).toLocaleDateString() : ''}
              onClick={() => setShowCalendar(true)}
              readOnly
              placeholder="Select date"
              className="w-full px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer"
              style={{ border: '1px solid #171717' }}
            />
            {showCalendar && (
              <CalendarModal
                isOpen={showCalendar}
                onClose={() => setShowCalendar(false)}
                mode="single"
                title="Select Target Date"
                onDateSelect={(date: Date) => {
                  setFormData({ ...formData, target_date: date.toISOString().split('T')[0] });
                  setShowCalendar(false);
                }}
              />
            )}
          </div>
        </div>

        <SelectField
          label="Status"
          value={formData.status || 'pending'}
          onValueChange={(value: string) => setFormData({ ...formData, status: value })}
        >
          <SelectItem value="pending">Pending</SelectItem>
          <SelectItem value="in_progress">In Progress</SelectItem>
          <SelectItem value="completed">Completed</SelectItem>
          <SelectItem value="billed">Billed</SelectItem>
        </SelectField>

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
