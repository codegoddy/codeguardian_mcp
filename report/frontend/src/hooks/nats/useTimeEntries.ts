/**
 * React Hook for Time Entry Events
 * 
 * Subscribe to time entry events from NATS JetStream.
 */

import { useEffect, useCallback, useRef } from 'react';
import { getNATSClient, initNATS, type TimeEntryEvent } from '@/services/nats';

export interface UseTimeEntriesOptions {
  /**
   * Callback to handle time entry events
   */
  onEvent?: (event: TimeEntryEvent) => void;
  
  /**
   * Whether to auto-subscribe on mount (default: true)
   */
  autoSubscribe?: boolean;
  
  /**
   * NATS WebSocket URL (optional)
   */
  url?: string;
}

export interface UseTimeEntriesReturn {
  /**
   * Manually subscribe to time entry events
   */
  subscribe: (callback?: (event: TimeEntryEvent) => void) => Promise<void>;
  
  /**
   * Check if subscribed
   */
  isSubscribed: boolean;
}

/**
 * Hook for subscribing to time entry events
 * 
 * @example
 * ```tsx
 * function TimeEntryPanel() {
 *   const { isSubscribed } = useTimeEntries({
 *     onEvent: (event) => {
 *       console.log('New time entry:', event.data);
 *       refreshTimeEntries();
 *     }
 *   });
 *   
 *   return <div>Listening: {isSubscribed ? 'Yes' : 'No'}</div>;
 * }
 * ```
 */
export function useTimeEntries(
  options: UseTimeEntriesOptions = {}
): UseTimeEntriesReturn {
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

  // Subscribe to time entries
  const subscribe = useCallback(async (callback?: (event: TimeEntryEvent) => void) => {
    if (isSubscribedRef.current) {
      console.log('[useTimeEntries] Already subscribed');
      return;
    }

    try {
      // Ensure connection
      if (!clientRef.current.isConnected()) {
        console.log('[useTimeEntries] Connecting to NATS...');
        await initNATS(url);
      }

      // Subscribe with the provided callback or the one from options
      const handleEvent = callback || callbackRef.current;
      if (!handleEvent) {
        console.warn('[useTimeEntries] No callback provided');
        return;
      }

      await clientRef.current.subscribeToTimeEntries(handleEvent);
      isSubscribedRef.current = true;
      console.log('[useTimeEntries] Subscribed to time entries');
    } catch (error) {
      console.error('[useTimeEntries] Failed to subscribe:', error);
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

export default useTimeEntries;




