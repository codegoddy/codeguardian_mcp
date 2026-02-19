'use client';

import { useState, useEffect } from 'react';
import { Clock, Calendar, FileText, CheckCircle } from 'lucide-react';
import ApiService from '@/services/api';
import { deliverablesApi, Deliverable } from '@/services/deliverables';

interface ManualTimeEntryProps {
  projectId: string;
  deliverableId?: string;
  onEntryCreated?: () => void;
}

export default function ManualTimeEntry({
  projectId,
  deliverableId: initialDeliverableId,
  onEntryCreated,
}: ManualTimeEntryProps) {
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [selectedDeliverableId, setSelectedDeliverableId] = useState<string | null>(
    initialDeliverableId || null
  );
  const [notes, setNotes] = useState('');
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loadingDeliverables, setLoadingDeliverables] = useState(true);

  useEffect(() => {
    loadDeliverables();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const loadDeliverables = async () => {
    try {
      setLoadingDeliverables(true);
      const data = await deliverablesApi.getDeliverables(projectId);
      setDeliverables(data);
      
      // If no deliverable is pre-selected and we have deliverables, select the first one
      if (!selectedDeliverableId && data.length > 0) {
        setSelectedDeliverableId(data[0].id);
      }
    } catch (err) {
      console.error('Error loading deliverables:', err);
      setError('Failed to load deliverables');
    } finally {
      setLoadingDeliverables(false);
    }
  };

  const calculateTotalHours = () => {
    const totalMinutes = parseInt(hours || '0') * 60 + parseInt(minutes || '0');
    return totalMinutes / 60;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedDeliverableId) {
      setError('Please select a deliverable');
      return;
    }

    if (!notes.trim()) {
      setError('Please enter a description');
      return;
    }

    const totalHours = calculateTotalHours();
    if (totalHours === 0) {
      setError('Please enter a valid duration');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      await ApiService.post('/time-entries/manual', {
        deliverable_id: selectedDeliverableId,
        hours: totalHours,
        notes: notes.trim(),
        date: date ? new Date(date).toISOString() : undefined,
      });

      // Reset form
      setNotes('');
      setHours('');
      setMinutes('');
      setDate(new Date().toISOString().split('T')[0]);
      setSuccess(true);
      
      // Call the callback if provided
      if (onEntryCreated) {
        onEntryCreated();
      }

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create time entry');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loadingDeliverables) {
    return (
      <div className="border border-gray-200 rounded-lg p-6 bg-white">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          <span className="ml-3 text-gray-600">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg p-6 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
          <Clock className="w-5 h-5 mr-2" />
          Manual Time Entry
        </h3>
      </div>
      
      <p className="text-sm text-gray-600 mb-6">
        For non-code work like meetings, planning, or research.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Deliverable Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
            <FileText className="w-4 h-4 mr-1" />
            Deliverable
          </label>
          <select
            value={selectedDeliverableId || ''}
            onChange={(e) => setSelectedDeliverableId(e.target.value || null)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            disabled={deliverables.length === 0}
          >
            {deliverables.length === 0 ? (
              <option value="">No deliverables available</option>
            ) : (
              <>
                <option value="">Select a deliverable</option>
                {deliverables.map((deliverable) => (
                  <option key={deliverable.id} value={deliverable.id}>
                    {deliverable.title} ({deliverable.status})
                  </option>
                ))}
              </>
            )}
          </select>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Description
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What did you work on? (e.g., Client meeting, Research, Planning)"
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none"
          />
        </div>

        {/* Time Input */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Hours
            </label>
            <input
              type="number"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              min="0"
              max="24"
              placeholder="0"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Minutes
            </label>
            <input
              type="number"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              min="0"
              max="59"
              step="15"
              placeholder="0"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>
        </div>

        {/* Date Picker */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
            <Calendar className="w-4 h-4 mr-1" />
            Date
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            max={new Date().toISOString().split('T')[0]}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          />
        </div>

        {/* Time Summary */}
        {(hours || minutes) && (
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <p className="text-sm text-gray-600">
              Total time: <span className="font-semibold text-gray-900">{calculateTotalHours().toFixed(2)} hours</span>
            </p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-start">
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Success Message */}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center">
            <CheckCircle className="w-4 h-4 mr-2 flex-shrink-0" />
            <span className="text-sm">Time entry created successfully!</span>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting || deliverables.length === 0}
          className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {isSubmitting ? 'Creating...' : 'Create Time Entry'}
        </button>
      </form>
    </div>
  );
}
