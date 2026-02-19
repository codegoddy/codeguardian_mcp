/**
 * React Hook for Budget Alert Events
 * 
 * Subscribe to budget alert events from NATS JetStream.
 */

import { useEffect, useCallback, useRef } from 'react';
import { getNATSClient, initNATS, type BudgetAlertEvent } from '@/services/nats';

export interface UseBudgetAlertsOptions {
  /**
   * Callback to handle budget alert events
   */
  onEvent?: (event: BudgetAlertEvent) => void;
  
  /**
   * Whether to auto-subscribe on mount (default: true)
   */
  autoSubscribe?: boolean;
  
  /**
   * NATS WebSocket URL (optional)
   */
  url?: string;
}

export interface UseBudgetAlertsReturn {
  /**
   * Manually subscribe to budget alert events
   */
  subscribe: (callback?: (event: BudgetAlertEvent) => void) => Promise<void>;
  
  /**
   * Check if subscribed
   */
  isSubscribed: boolean;
}

/**
 * Hook for subscribing to budget alert events
 * 
 * @example
 * ```tsx
 * function BudgetAlertPanel() {
 *   const { isSubscribed } = useBudgetAlerts({
 *     onEvent: (event) => {
 *       toast.warning(`Budget Alert: ${event.data.message}`);
 *     }
 *   });
 *   
 *   return <div>Monitoring: {isSubscribed ? 'Active' : 'Inactive'}</div>;
 * }
 * ```
 */
export function useBudgetAlerts(
  options: UseBudgetAlertsOptions = {}
): UseBudgetAlertsReturn {
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

  // Subscribe to budget alerts
  const subscribe = useCallback(async (callback?: (event: BudgetAlertEvent) => void) => {
    if (isSubscribedRef.current) {
      console.log('[useBudgetAlerts] Already subscribed');
      return;
    }

    try {
      // Ensure connection
      if (!clientRef.current.isConnected()) {
        console.log('[useBudgetAlerts] Connecting to NATS...');
        await initNATS(url);
      }

      // Subscribe with the provided callback or the one from options
      const handleEvent = callback || callbackRef.current;
      if (!handleEvent) {
        console.warn('[useBudgetAlerts] No callback provided');
        return;
      }

      await clientRef.current.subscribeToBudgetAlerts(handleEvent);
      isSubscribedRef.current = true;
      console.log('[useBudgetAlerts] Subscribed to budget alerts');
    } catch (error) {
      console.error('[useBudgetAlerts] Failed to subscribe:', error);
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

export default useBudgetAlerts;




