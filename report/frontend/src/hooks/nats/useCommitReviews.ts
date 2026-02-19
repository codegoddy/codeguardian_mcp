/**
 * React Hook for Commit Review Events
 * 
 * Subscribe to commit review events from NATS JetStream.
 */

import { useEffect, useCallback, useRef } from 'react';
import { getNATSClient, initNATS, type CommitReviewEvent } from '@/services/nats';

export interface UseCommitReviewsOptions {
  /**
   * Callback to handle commit review events
   */
  onEvent?: (event: CommitReviewEvent) => void;
  
  /**
   * Whether to auto-subscribe on mount (default: true)
   */
  autoSubscribe?: boolean;
  
  /**
   * NATS WebSocket URL (optional)
   */
  url?: string;
}

export interface UseCommitReviewsReturn {
  /**
   * Manually subscribe to commit review events
   */
  subscribe: (callback?: (event: CommitReviewEvent) => void) => Promise<void>;
  
  /**
   * Check if subscribed
   */
  isSubscribed: boolean;
}

/**
 * Hook for subscribing to commit review events
 * 
 * @example
 * ```tsx
 * function CommitReviewPanel() {
 *   const { isSubscribed } = useCommitReviews({
 *     onEvent: (event) => {
 *       if (event.event_type === 'commit_review_pending') {
 *         showReviewModal(event.data);
 *       }
 *     }
 *   });
 *   
 *   return <div>Listening: {isSubscribed ? 'Yes' : 'No'}</div>;
 * }
 * ```
 */
export function useCommitReviews(
  options: UseCommitReviewsOptions = {}
): UseCommitReviewsReturn {
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

  // Subscribe to commit reviews
  const subscribe = useCallback(async (callback?: (event: CommitReviewEvent) => void) => {
    if (isSubscribedRef.current) {
      console.log('[useCommitReviews] Already subscribed');
      return;
    }

    try {
      // Ensure connection
      if (!clientRef.current.isConnected()) {
        console.log('[useCommitReviews] Connecting to NATS...');
        await initNATS(url);
      }

      // Subscribe with the provided callback or the one from options
      const handleEvent = callback || callbackRef.current;
      if (!handleEvent) {
        console.warn('[useCommitReviews] No callback provided');
        return;
      }

      await clientRef.current.subscribeToCommitReviews(handleEvent);
      isSubscribedRef.current = true;
      console.log('[useCommitReviews] Subscribed to commit reviews');
    } catch (error) {
      console.error('[useCommitReviews] Failed to subscribe:', error);
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

export default useCommitReviews;




