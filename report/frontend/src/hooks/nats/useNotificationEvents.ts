/**
 * React Hook for Notification Created Events
 * 
 * Subscribe to notification events and auto-invalidate React Query cache.
 */

import { useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getNATSClient, initNATS, type NotificationCreatedEvent } from '@/services/nats';
import { notificationKeys } from '@/hooks/useNotifications';

export interface UseNotificationEventsOptions {
  /**
   * Custom callback to handle notification events (in addition to cache invalidation)
   */
  onEvent?: (event: NotificationCreatedEvent) => void;
  
  /**
   * Whether to auto-subscribe on mount (default: true)
   */
  autoSubscribe?: boolean;
  
  /**
   * Whether to auto-invalidate the React Query cache (default: true)
   */
  autoInvalidate?: boolean;
}

export interface UseNotificationEventsReturn {
  /**
   * Manually subscribe to notification events
   */
  subscribe: () => Promise<void>;
  
  /**
   * Check if subscribed
   */
  isSubscribed: boolean;
}

/**
 * Hook for subscribing to real-time notification events
 * 
 * Automatically invalidates the notifications React Query cache when new notifications are created.
 * 
 * @example
 * ```tsx
 * function NotificationPanel() {
 *   useNotificationEvents({
 *     onEvent: (event) => {
 *       toast.info(`New notification: ${event.notification.title}`);
 *     }
 *   });
 * }
 * ```
 */
export function useNotificationEvents(
  options: UseNotificationEventsOptions = {}
): UseNotificationEventsReturn {
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

  // Subscribe to notification events
  const subscribe = useCallback(async () => {
    if (isSubscribedRef.current) {
      console.log('[useNotificationEvents] Already subscribed');
      return;
    }

    try {
      // Ensure connection
      if (!clientRef.current.isConnected()) {
        console.log('[useNotificationEvents] Connecting to NATS...');
        await initNATS();
      }

      // Subscribe with handler
      await clientRef.current.subscribeToNotificationCreated((event: NotificationCreatedEvent) => {
        console.log('[useNotificationEvents] Received notification event:', event);
        
        // Auto-invalidate cache
        if (autoInvalidate) {
          queryClient.invalidateQueries({ queryKey: notificationKeys.all });
        }
        
        // Call custom handler
        if (callbackRef.current) {
          callbackRef.current(event);
        }
      });
      
      isSubscribedRef.current = true;
      console.log('[useNotificationEvents] Subscribed to notification events');
    } catch (error) {
      console.error('[useNotificationEvents] Failed to subscribe:', error);
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

export default useNotificationEvents;
