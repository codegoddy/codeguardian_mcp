'use client';

import { X, Clock } from 'lucide-react';
import { usePendingTimeEntries, useApproveTimeEntry, useRejectTimeEntry } from '@/hooks/useTimeEntries';
import TimeEntryCard from './TimeEntryCard';

interface TimeReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TimeReviewModal({ isOpen, onClose }: TimeReviewModalProps) {
  const { data: pendingEntries, isLoading } = usePendingTimeEntries();
  const approveTimeEntry = useApproveTimeEntry();
  const rejectTimeEntry = useRejectTimeEntry();

  if (!isOpen) return null;

  const handleApprove = (sessionId: string, adjustedHours?: number, notes?: string) => {
    approveTimeEntry.mutate(
      { session_id: sessionId, adjusted_hours: adjustedHours, notes },
      {
        onSuccess: () => {
          // Show success toast or notification
          console.log('Time entry approved successfully');
        },
        onError: (error) => {
          console.error('Failed to approve time entry:', error);
        },
      }
    );
  };

  const handleReject = (sessionId: string, reason?: string) => {
    rejectTimeEntry.mutate(
      { session_id: sessionId, reason },
      {
        onSuccess: () => {
          // Show success toast or notification
          console.log('Time entry rejected successfully');
        },
        onError: (error) => {
          console.error('Failed to reject time entry:', error);
        },
      }
    );
  };

  const totalHours = pendingEntries?.reduce((sum, entry) => sum + entry.duration_hours, 0) || 0;
  const totalCost = pendingEntries?.reduce((sum, entry) => sum + (entry.estimated_cost || 0), 0) || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div 
        className="bg-white max-w-4xl w-full max-h-[90vh] flex flex-col rounded-lg"
        style={{
          border: '2px solid #000',
          boxShadow: '4px 4px 0px 0px #000'
        }}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b-2 border-black p-6">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-black tracking-tighter">
                Review Time Entries
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Approve or adjust time entries calculated from your Git commits
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={24} />
            </button>
          </div>

        </div>

        {/* Summary Stats */}
        {pendingEntries && pendingEntries.length > 0 && (
          <div className="px-6 pt-6">
            <div className="grid grid-cols-3 gap-4">
              <div className="email-card p-4">
                <div className="text-xs uppercase tracking-wider mb-1 text-white">
                  Pending Entries
                </div>
                <div className="text-2xl font-black tracking-tighter text-white">
                  {pendingEntries.length}
                </div>
              </div>
              <div className="email-card p-4">
                <div className="text-xs uppercase tracking-wider mb-1 text-white">
                  Total Hours
                </div>
                <div className="text-2xl font-black tracking-tighter text-white">
                  {totalHours.toFixed(2)}
                </div>
              </div>
              <div className="p-4 bg-[#ccff00] border-2 border-black" style={{ boxShadow: '2px 2px 0px 0px #000' }}>
                <div className="text-xs uppercase tracking-wider mb-1 text-black">
                  Estimated Cost
                </div>
                <div className="text-2xl font-black tracking-tighter text-black">
                  ${totalCost.toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center space-x-2">
                <Clock className="w-6 h-6 animate-spin" />
                <span className="text-lg font-bold">Loading time entries...</span>
              </div>
            </div>
          ) : !pendingEntries || pendingEntries.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <h3 className="text-xl font-black tracking-tighter mb-2">
                No Pending Time Entries
              </h3>
              <p className="text-gray-600">
                All your time entries have been reviewed. Keep coding!
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingEntries.map((entry) => (
                <TimeEntryCard
                  key={entry.session_id}
                  entry={entry}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  isLoading={approveTimeEntry.isPending || rejectTimeEntry.isPending}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t-2 border-black bg-gray-50">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-600">
              Time entries are calculated from your Git commits using smart session grouping
            </p>
            <button
              onClick={onClose}
              className="email-button bg-black text-white px-6 py-2"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
