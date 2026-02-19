/**
 * React Hook for Activity Created Events
 * 
 * Subscribe to activity events and auto-invalidate React Query cache.
 */

import { useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getNATSClient, initNATS, type ActivityCreatedEvent } from '@/services/nats';
import { activityKeys } from '@/hooks/useActivities';

export interface UseActivityEventsOptions {
  /**
   * Custom callback to handle activity events (in addition to cache invalidation)
   */
  onEvent?: (event: ActivityCreatedEvent) => void;
  
  /**
   * Whether to auto-subscribe on mount (default: true)
   */
  autoSubscribe?: boolean;
  
  /**
   * Whether to auto-invalidate the React Query cache (default: true)
   */
  autoInvalidate?: boolean;
}

export interface UseActivityEventsReturn {
  /**
   * Manually subscribe to activity events
   */
  subscribe: () => Promise<void>;
  
  /**
   * Check if subscribed
   */
  isSubscribed: boolean;
}

/**
 * Hook for subscribing to real-time activity events
 * 
 * Automatically invalidates the activities React Query cache when new activities are created.
 * 
 * @example
 * ```tsx
 * function ActivityPanel() {
 *   useActivityEvents({
 *     onEvent: (event) => {
 *       toast.info(`New activity: ${event.activity.title}`);
 *     }
 *   });
 * }
 * ```
 */
export function useActivityEvents(
  options: UseActivityEventsOptions = {}
): UseActivityEventsReturn {
  const {
    onEvent,
    autoSubscribe = true,
    autoInvalidate = true,
  } = options;

  const queryClient = useQueryClient();
  const clientRef = useRef(getNATSClient());
  const isSubscribedRef = useRef(false);
  const callbackRef = useRef(onEvent);

  // Update callback ref when it changes
  useEffect(() => {
    callbackRef.current = onEvent;
  }, [onEvent]);

  // Subscribe to activity events
  const subscribe = useCallback(async () => {
    if (isSubscribedRef.current) {
      console.log('[useActivityEvents] Already subscribed');
      return;
    }

    try {
      // Ensure connection
      if (!clientRef.current.isConnected()) {
        console.log('[useActivityEvents] Connecting to NATS...');
        await initNATS();
      }

      // Subscribe with handler
      await clientRef.current.subscribeToActivityCreated((event: ActivityCreatedEvent) => {
        console.log('[useActivityEvents] Received activity event:', event);
        
        // Auto-invalidate cache
        if (autoInvalidate) {
          queryClient.invalidateQueries({ queryKey: activityKeys.all });
        }
        
        // Call custom handler
        if (callbackRef.current) {
          callbackRef.current(event);
        }
      });
      
      isSubscribedRef.current = true;
      console.log('[useActivityEvents] Subscribed to activity events');
    } catch (error) {
      console.error('[useActivityEvents] Failed to subscribe:', error);
    }
  }, [autoInvalidate, queryClient]);

  // Auto-subscribe on mount
  useEffect(() => {
    if (autoSubscribe) {
      subscribe();
    }
  }, [autoSubscribe, subscribe]);

  return {
    subscribe,
    isSubscribed: isSubscribedRef.current,
  };
}

export default useActivityEvents;
