/**
 * React Hook for Review Reminder Events
 * 
 * Subscribe to review reminder events from NATS JetStream.
 */

import { useEffect, useCallback, useRef } from 'react';
import { getNATSClient, initNATS, type ReviewReminderEvent } from '@/services/nats';

export interface UseReviewRemindersOptions {
  /**
   * Callback to handle review reminder events
   */
  onEvent?: (event: ReviewReminderEvent) => void;
  
  /**
   * Whether to auto-subscribe on mount (default: true)
   */
  autoSubscribe?: boolean;
  
  /**
   * NATS WebSocket URL (optional)
   */
  url?: string;
}

export interface UseReviewRemindersReturn {
  /**
   * Manually subscribe to review reminder events
   */
  subscribe: (callback?: (event: ReviewReminderEvent) => void) => Promise<void>;
  
  /**
   * Check if subscribed
   */
  isSubscribed: boolean;
}

/**
 * Hook for subscribing to review reminder events
 * 
 * @example
 * ```tsx
 * function ReviewReminderPanel() {
 *   const { isSubscribed } = useReviewReminders({
 *     onEvent: (event) => {
 *       if (event.data.pending_count > 0) {
 *         showReminder(`You have ${event.data.pending_count} pending reviews`);
 *       }
 *     }
 *   });
 *   
 *   return <div>Reminders: {isSubscribed ? 'Enabled' : 'Disabled'}</div>;
 * }
 * ```
 */
export function useReviewReminders(
  options: UseReviewRemindersOptions = {}
): UseReviewRemindersReturn {
  const {
    onEvent,
    autoSubscribe = true,
    url,
  } = options;

  const clientRef = useRef(getNATSClient());
  const isSubscribedRef = useRef(false);
  const callbackRef = useRef(onEvent);

  // Update callback ref when it changes
  useEffect(() => {
    callbackRef.current = onEvent;
  }, [onEvent]);

  // Subscribe to review reminders
  const subscribe = useCallback(async (callback?: (event: ReviewReminderEvent) => void) => {
    if (isSubscribedRef.current) {
      console.log('[useReviewReminders] Already subscribed');
      return;
    }

    try {
      // Ensure connection
      if (!clientRef.current.isConnected()) {
        console.log('[useReviewReminders] Connecting to NATS...');
        await initNATS(url);
      }

      // Subscribe with the provided callback or the one from options
      const handleEvent = callback || callbackRef.current;
      if (!handleEvent) {
        console.warn('[useReviewReminders] No callback provided');
        return;
      }

      await clientRef.current.subscribeToReviewReminders(handleEvent);
      isSubscribedRef.current = true;
      console.log('[useReviewReminders] Subscribed to review reminders');
    } catch (error) {
      console.error('[useReviewReminders] Failed to subscribe:', error);
    }
  }, [url]);

  // Auto-subscribe on mount
  useEffect(() => {
    if (autoSubscribe && onEvent) {
      subscribe();
    }

    // Note: We don't auto-unsubscribe on unmount because other components
    // might be using the same subscription. The connection manager handles cleanup.
  }, [autoSubscribe, onEvent, subscribe]);

  return {
    subscribe,
    isSubscribed: isSubscribedRef.current,
  };
}

export default useReviewReminders;




