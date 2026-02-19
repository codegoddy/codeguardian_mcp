/**
 * React Hook for Contract Signed Events
 *
 * Subscribe to contract signed events from NATS JetStream.
 */

import { useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getNATSClient, initNATS, type ContractSignedEvent, type ContractGeneratedEvent } from '@/services/nats';
import { contractKeys } from '@/hooks/useContracts';

export interface UseContractSignedOptions {
  /**
   * Callback to handle contract signed events
   */
  onEvent?: (event: ContractSignedEvent) => void;

  /**
   * Whether to auto-subscribe on mount (default: true)
   */
  autoSubscribe?: boolean;

  /**
   * NATS WebSocket URL (optional)
   */
  url?: string;
}

export interface UseContractSignedReturn {
  /**
   * Manually subscribe to contract signed events
   */
  subscribe: (callback?: (event: ContractSignedEvent) => void) => Promise<void>;

  /**
   * Check if subscribed
   */
  isSubscribed: boolean;
}

/**
 * Hook for subscribing to contract signed events
 *
 * @example
 * ```tsx
 * function ContractMonitor() {
 *   const { isSubscribed } = useContractSigned({
 *     onEvent: (event) => {
 *       console.log('Contract signed for project:', event.data.project_id);
 *       // Invalidate projects query to refresh UI
 *       queryClient.invalidateQueries({ queryKey: projectKeys.all });
 *     }
 *   });
 *
 *   return <div>Monitoring contracts: {isSubscribed ? 'Active' : 'Inactive'}</div>;
 * }
 * ```
 */
export function useContractSigned(
  options: UseContractSignedOptions = {}
): UseContractSignedReturn {
  const {
    onEvent,
    autoSubscribe = true,
    url,
  } = options;

  const queryClient = useQueryClient();
  const clientRef = useRef(getNATSClient());
  const isSubscribedRef = useRef(false);
  const callbackRef = useRef(onEvent);

  // Update callback ref when it changes
  useEffect(() => {
    callbackRef.current = onEvent;
  }, [onEvent]);

  // Subscribe to contract events (both signed and generated)
  const subscribe = useCallback(async (callback?: (event: ContractSignedEvent) => void) => {
    if (isSubscribedRef.current) {
      console.log('[useContractSigned] Already subscribed');
      return;
    }

    try {
      // Ensure connection
      if (!clientRef.current.isConnected()) {
        console.log('[useContractSigned] Connecting to NATS...');
        await initNATS(url);
      }

      // Subscribe to contract signed events
      const handleSignedEvent = callback || callbackRef.current;
      if (handleSignedEvent) {
        await clientRef.current.subscribeToContractSigned((event: ContractSignedEvent) => {
          // Invalidate contracts query when contract is signed
          queryClient.invalidateQueries({ queryKey: contractKeys.all });
          // Call the user's callback if provided
          handleSignedEvent(event);
        });
      } else {
        // Even if no callback provided, still invalidate queries for signed events
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        await clientRef.current.subscribeToContractSigned((_event: ContractSignedEvent) => {
          console.log('[useContractSigned] Contract signed, invalidating contracts query');
          queryClient.invalidateQueries({ queryKey: contractKeys.all });
        });
      }

      // Subscribe to contract generated events and invalidate contracts query
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      await clientRef.current.subscribeToContractGenerated((_event: ContractGeneratedEvent) => {
        console.log('[useContractSigned] Contract generated, invalidating contracts query');
        queryClient.invalidateQueries({ queryKey: contractKeys.all });
      });

      isSubscribedRef.current = true;
      console.log('[useContractSigned] Subscribed to contract events');
    } catch (error) {
      console.error('[useContractSigned] Failed to subscribe:', error);
    }
  }, [url, queryClient]);

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

export default useContractSigned;