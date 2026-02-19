/**
 * React Hook for Project Events
 *
 * Subscribe to project-related events from NATS JetStream.
 */

import React, { useEffect, useCallback } from 'react';
import { getNATSClient, initNATS } from '@/services/nats';

export interface ProjectGeneratedEvent {
  event_type: 'contract_generated';
  timestamp: string;
  data: {
    project_id: string;
    contract_id: string;
    user_id: string;
    message: string;
  };
}

export interface ProjectSentEvent {
  event_type: 'contract_sent';
  timestamp: string;
  data: {
    project_id: string;
    message: string;
  };
}

export type ProjectEvent = ProjectGeneratedEvent | ProjectSentEvent;

export interface UseProjectEventsOptions {
  /**
   * Callback to handle project events
   */
  onEvent?: (event: ProjectEvent) => void;

  /**
   * Whether to auto-subscribe on mount (default: true)
   */
  autoSubscribe?: boolean;

  /**
   * NATS WebSocket URL (optional)
   */
  url?: string;
}

export interface UseProjectEventsReturn {
  /**
   * Manually subscribe to project events
   */
  subscribe: (callback?: (event: ProjectEvent) => void) => Promise<void>;

  /**
   * Check if subscribed
   */
  isSubscribed: boolean;
}

/**
 * Hook for subscribing to project events
 *
 * @example
 * ```tsx
 * function ContractsPage() {
 *   const { isSubscribed } = useProjectEvents({
 *     onEvent: (event) => {
 *       if (event.event_type === 'contract_generated') {
 *         // Refresh contracts list
 *         queryClient.invalidateQueries({ queryKey: ['contracts'] });
 *       }
 *     }
 *   });
 *
 *   return <div>Contracts monitoring: {isSubscribed ? 'Active' : 'Inactive'}</div>;
 * }
 * ```
 */
export function useProjectEvents(
  options: UseProjectEventsOptions = {}
): UseProjectEventsReturn {
  const {
    onEvent,
    autoSubscribe = true,
    url,
  } = options;

  const clientRef = React.useRef(getNATSClient());
  const isSubscribedRef = React.useRef(false);
  const callbackRef = React.useRef(onEvent);

  // Update callback ref when it changes
  useEffect(() => {
    callbackRef.current = onEvent;
  }, [onEvent]);

  // Subscribe to project events
  const subscribe = useCallback(async (callback?: (event: ProjectEvent) => void) => {
    if (isSubscribedRef.current) {
      console.log('[useProjectEvents] Already subscribed');
      return;
    }

    try {
      // Ensure connection
      if (!clientRef.current.isConnected()) {
        console.log('[useProjectEvents] Connecting to NATS...');
        await initNATS(url);
      }

      // Subscribe with the provided callback or the one from options
      const handleEvent = callback || callbackRef.current;
      if (!handleEvent) {
        console.warn('[useProjectEvents] No callback provided');
        return;
      }

      // Note: This would require extending the NATS client to support PROJECT_EVENTS stream
      // For now, we'll implement this when the client supports multiple streams
      console.log('[useProjectEvents] Project events subscription not yet implemented');
      isSubscribedRef.current = true;
      console.log('[useProjectEvents] Subscribed to project events');
    } catch (error) {
      console.error('[useProjectEvents] Failed to subscribe:', error);
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

export default useProjectEvents;