import { useEffect, useState } from 'react';
import { usePendingTimeEntries } from './useTimeEntries';
import { toast } from '@/lib/toast';

/**
 * Hook to manage time entry notifications
 * Shows toast notifications for new pending time entries
 * Returns count of pending entries for badge display
 */
export const useTimeEntryNotifications = () => {
  const { data: pendingEntries, isLoading } = usePendingTimeEntries();
  const [previousCount, setPreviousCount] = useState(0);
  const [hasShownInitialToast, setHasShownInitialToast] = useState(false);

  useEffect(() => {
    if (isLoading || !pendingEntries) return;

    const currentCount = pendingEntries.length;

    // Don't show toast on initial load, only when count increases
    if (hasShownInitialToast && currentCount > previousCount) {
      const newEntries = currentCount - previousCount;
      toast.info(
        'New Time Entries',
        `You have ${newEntries} new time ${newEntries === 1 ? 'entry' : 'entries'} to review`
      );
    }

    if (!hasShownInitialToast && currentCount > 0) {
      setHasShownInitialToast(true);
    }

    setPreviousCount(currentCount);
  }, [pendingEntries, isLoading, previousCount, hasShownInitialToast]);

  return {
    pendingCount: pendingEntries?.length || 0,
    isLoading,
  };
};
