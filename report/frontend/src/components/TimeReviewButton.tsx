'use client';

import { useState } from 'react';
import { Clock } from 'lucide-react';
import { useTimeEntryNotifications } from '@/hooks/useTimeEntryNotifications';
import TimeReviewModal from './TimeReviewModal';

export default function TimeReviewButton() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { pendingCount, isLoading } = useTimeEntryNotifications();

  if (isLoading) return null;

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className="relative email-button bg-white text-black px-4 py-2 flex items-center gap-2"
        title="Review time entries"
      >
        <Clock className="w-4 h-4" />
        <span className="hidden sm:inline">Review Time</span>
        
        {pendingCount > 0 && (
          <span className="absolute -top-2 -right-2 bg-[#ccff00] text-black text-xs font-black rounded-full w-6 h-6 flex items-center justify-center border-2 border-black">
            {pendingCount > 9 ? '9+' : pendingCount}
          </span>
        )}
      </button>

      <TimeReviewModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}
