'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X, GitCommit, Clock, User, Calendar, AlertTriangle, Check } from 'lucide-react';
import { useState, useEffect } from 'react';
import { CommitReview, reviewsApi, ReviewSubmit } from '../../services/reviews';
import { deliverablesApi, Deliverable } from '../../services/deliverables';
import { SelectField, SelectItem } from './index';

interface CommitReviewModalProps {
  review: CommitReview | null;
  isOpen: boolean;
  onClose?: () => void;
  onReviewSubmitted: () => void;
}

export default function CommitReviewModal({
  review,
  isOpen,
  onClose,
  onReviewSubmitted,
}: CommitReviewModalProps) {
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingDeliverables, setLoadingDeliverables] = useState(false);
  const [formData, setFormData] = useState({
    deliverableId: '',
    manualHours: '',
    manualNotes: '',
  });

  // Blocking modal - cannot close until reviewed
  const handleOpenChange = (open: boolean) => {
    // Only allow closing if onClose is provided (for testing/development)
    if (!open && onClose) {
      onClose();
    }
  };

  useEffect(() => {
    if (isOpen && review) {
      loadDeliverables();
      // Pre-fill form with parsed data
      setFormData({
        deliverableId: review.deliverable_id?.toString() || '',
        manualHours: review.parsed_hours?.toString() || '',
        manualNotes: '',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, review]);

  const loadDeliverables = async () => {
    if (!review) return;
    
    setLoadingDeliverables(true);
    try {
      const data = await deliverablesApi.getDeliverables(review.project_id);
      // Filter to only show in-progress or pending deliverables
      const activeDeliverables = data.filter(
        d => d.status === 'in_progress' || d.status === 'pending'
      );
      setDeliverables(activeDeliverables);
    } catch (error) {
      console.error('Failed to load deliverables:', error);
    } finally {
      setLoadingDeliverables(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!review || !formData.deliverableId) {
      return;
    }

    setLoading(true);

    try {
      const submitData: ReviewSubmit = {
        deliverable_id: formData.deliverableId,
      };

      // Only include manual hours if different from parsed hours
      if (formData.manualHours && parseFloat(formData.manualHours) !== review.parsed_hours) {
        submitData.manual_hours = parseFloat(formData.manualHours);
      }

      // Only include notes if provided
      if (formData.manualNotes.trim()) {
        submitData.manual_notes = formData.manualNotes.trim();
      }

      await reviewsApi.submitReview(review.id, submitData);
      
      // Reset form
      setFormData({
        deliverableId: '',
        manualHours: '',
        manualNotes: '',
      });
      
      onReviewSubmitted();
    } catch (error) {
      console.error('Failed to submit review:', error);
      alert('Failed to submit review. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!review) return;

    const reason = prompt('Please provide a reason for rejecting this commit:');
    if (!reason) return;

    setLoading(true);

    try {
      await reviewsApi.rejectReview(review.id, { reason });
      
      // Reset form
      setFormData({
        deliverableId: '',
        manualHours: '',
        manualNotes: '',
      });
      
      onReviewSubmitted();
    } catch (error) {
      console.error('Failed to reject review:', error);
      alert('Failed to reject review. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!review) return null;

  return (
    <Dialog.Root open={isOpen} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg w-full max-w-2xl z-50 max-h-[90vh] overflow-y-auto"
          style={{
            border: '2px solid #000',
            boxShadow: '4px 4px 0px 0px #000'
          }}
        >
          {/* Header - Sticky like Project Modal */}
          <div className="sticky top-0 bg-white border-b-2 border-black p-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div 
                className="w-10 h-10 flex items-center justify-center bg-[#ccff00] border-2 border-black"
                style={{ boxShadow: '2px 2px 0px 0px #000' }}
              >
                <GitCommit size={20} strokeWidth={3} />
              </div>
              <div>
                <Dialog.Title className="text-2xl font-black tracking-tighter text-gray-900">
                  Review Commit
                </Dialog.Title>
                <Dialog.Description className="text-sm text-gray-600 mt-0.5">
                  Confirm time tracking details
                </Dialog.Description>
              </div>
            </div>
            {onClose && (
              <Dialog.Close asChild>
                <button
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label="Close"
                  disabled={loading}
                >
                  <X size={24} strokeWidth={3} />
                </button>
              </Dialog.Close>
            )}
          </div>

          {/* Content with padding */}
          <div className="p-6">
            {/* Alert Banner - Neobrutalist style */}
            <div 
              className="mb-6 p-4 bg-[#fff3cd] flex items-start gap-3"
              style={{ border: '2px solid #000', boxShadow: '3px 3px 0px 0px #000' }}
            >
              <AlertTriangle className="w-5 h-5 text-black flex-shrink-0 mt-0.5" strokeWidth={3} />
              <div>
                <p className="text-sm font-black text-black">ACTION REQUIRED</p>
                <p className="text-sm text-gray-800 mt-1">
                  This commit needs to be reviewed before time can be tracked.
                </p>
              </div>
            </div>

            {/* Commit Information */}
            <div 
              className="mb-6 p-4 bg-gray-50"
              style={{ border: '2px solid #000' }}
            >
              <h3 className="text-sm font-black text-black mb-3 uppercase tracking-wide">Commit Details</h3>
              
              <div className="space-y-3">
                {/* Commit Hash */}
                <div className="flex items-start gap-3">
                  <GitCommit className="w-4 h-4 text-black mt-0.5 flex-shrink-0" strokeWidth={2.5} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-600 uppercase">Hash</p>
                    <p className="text-sm font-mono text-gray-900 truncate">
                      {review.commit_hash}
                    </p>
                  </div>
                </div>

                {/* Commit Message */}
                <div className="flex items-start gap-3">
                  <div className="w-4 h-4 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs font-bold text-gray-600 uppercase">Message</p>
                    <p className="text-sm text-gray-900 whitespace-pre-wrap break-words">
                      {review.commit_message}
                    </p>
                  </div>
                </div>

                {/* Author */}
                {review.commit_author && (
                  <div className="flex items-start gap-3">
                    <User className="w-4 h-4 text-black mt-0.5 flex-shrink-0" strokeWidth={2.5} />
                    <div className="flex-1">
                      <p className="text-xs font-bold text-gray-600 uppercase">Author</p>
                      <p className="text-sm text-gray-900">{review.commit_author}</p>
                    </div>
                  </div>
                )}

                {/* Timestamp */}
                {review.commit_timestamp && (
                  <div className="flex items-start gap-3">
                    <Calendar className="w-4 h-4 text-black mt-0.5 flex-shrink-0" strokeWidth={2.5} />
                    <div className="flex-1">
                      <p className="text-xs font-bold text-gray-600 uppercase">Committed</p>
                      <p className="text-sm text-gray-900">{formatDate(review.commit_timestamp)}</p>
                    </div>
                  </div>
                )}

                {/* Parsed Hours */}
                {review.parsed_hours && (
                  <div className="flex items-start gap-3">
                    <Clock className="w-4 h-4 text-black mt-0.5 flex-shrink-0" strokeWidth={2.5} />
                    <div className="flex-1">
                      <p className="text-xs font-bold text-gray-600 uppercase">Estimated Time</p>
                      <p className="text-sm font-black text-black">
                        {review.parsed_hours} {review.parsed_hours === 1 ? 'hour' : 'hours'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Review Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Deliverable Selection */}
              <SelectField
                label="Deliverable"
                placeholder={loadingDeliverables ? "Loading deliverables..." : "Select a deliverable"}
                helperText="Choose which deliverable this commit belongs to"
                required
                disabled={loading || loadingDeliverables}
                value={formData.deliverableId}
                onValueChange={(value) => setFormData(prev => ({ ...prev, deliverableId: value }))}
              >
                {deliverables.map((deliverable) => (
                  <SelectItem key={deliverable.id} value={deliverable.id.toString()}>
                    {deliverable.title}
                    {deliverable.task_reference && ` (${deliverable.task_reference})`}
                  </SelectItem>
                ))}
              </SelectField>

              {/* Manual Hours Adjustment */}
              <div>
                <label className="block text-sm font-black text-gray-900 mb-2">
                  Adjust Time (hours)
                </label>
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  value={formData.manualHours}
                  onChange={(e) => setFormData(prev => ({ ...prev, manualHours: e.target.value }))}
                  className="w-full px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#ccff00]"
                  placeholder={review.parsed_hours?.toString() || "Enter hours"}
                  disabled={loading}
                  style={{ border: '2px solid #000' }}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Adjust if the estimated time doesn&apos;t match actual work done
                </p>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-black text-gray-900 mb-2">
                  Notes (optional)
                </label>
                <textarea
                  value={formData.manualNotes}
                  onChange={(e) => setFormData(prev => ({ ...prev, manualNotes: e.target.value }))}
                  className="w-full px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-[#ccff00]"
                  placeholder="Add any additional context or notes about this work..."
                  rows={3}
                  disabled={loading}
                  style={{ border: '2px solid #000' }}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Include details about non-coding work, meetings, or other context
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-6 border-t-2 border-black mt-6">
                <button
                  type="button"
                  onClick={handleReject}
                  className="flex-1 px-4 py-3 text-sm font-black bg-white hover:bg-gray-100 transition-colors flex items-center justify-center gap-2"
                  style={{ border: '2px solid #000', boxShadow: '2px 2px 0px 0px #000' }}
                  disabled={loading}
                >
                  <X size={16} strokeWidth={3} />
                  {loading ? 'Processing...' : 'Reject'}
                </button>
                <button
                  type="submit"
                  disabled={loading || !formData.deliverableId || loadingDeliverables}
                  className={`flex-1 px-4 py-3 text-sm font-black flex items-center justify-center gap-2 transition-all ${
                    !loading && formData.deliverableId && !loadingDeliverables
                      ? 'bg-[#ccff00] text-black hover:translate-x-[-2px] hover:translate-y-[-2px]'
                      : 'bg-gray-200 cursor-not-allowed text-gray-500'
                  }`}
                  style={{
                    border: '2px solid #000',
                    boxShadow: !loading && formData.deliverableId && !loadingDeliverables ? '4px 4px 0px 0px #000' : 'none'
                  }}
                >
                  <Check size={16} strokeWidth={3} />
                  {loading ? 'Submitting...' : 'Approve & Track'}
                </button>
              </div>
            </form>

            {/* Info Footer */}
            <div 
              className="mt-6 p-3 bg-black"
              style={{ border: '2px solid #000' }}
            >
              <p className="text-xs text-white">
                <strong className="text-[#ccff00]">Note:</strong> Once approved, this time will be tracked against the selected deliverable.
              </p>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
