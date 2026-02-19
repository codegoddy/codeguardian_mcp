/**
 * @deprecated This hook is maintained for backward compatibility.
 * Please use the modular hooks from '@/hooks/nats' instead:
 * - useNATSConnection() for connection management
 * - useCommitReviews() for commit review events
 * - useBudgetAlerts() for budget alert events
 * - useTimeEntries() for time entry events
 * - useReviewReminders() for review reminder events
 * 
 * Legacy React Hook for NATS JetStream Time Tracking Events
 * 
 * Provides easy integration with NATS JetStream for real-time time tracking events.
 */

import { useEffect, useRef, useCallback } from 'react';
import {
  getNATSClient,
  initNATS,
  type CommitReviewEvent,
  type BudgetAlertEvent,
  type TimeEntryEvent,
  type ReviewReminderEvent,
} from '@/services/nats';

export interface UseNATSOptions {
  /**
   * NATS WebSocket URL (optional, defaults to env variable or localhost)
   */
  url?: string;
  
  /**
   * Auto-connect on mount (default: true)
   */
  autoConnect?: boolean;
  
  /**
   * Auto-disconnect on unmount (default: true)
   */
  autoDisconnect?: boolean;
}

export interface UseNATSReturn {
  /**
   * Subscribe to commit review events
   */
  subscribeToCommitReviews: (callback: (event: CommitReviewEvent) => void) => Promise<void>;
  
  /**
   * Subscribe to budget alert events
   */
  subscribeToBudgetAlerts: (callback: (event: BudgetAlertEvent) => void) => Promise<void>;
  
  /**
   * Subscribe to time entry events
   */
  subscribeToTimeEntries: (callback: (event: TimeEntryEvent) => void) => Promise<void>;
  
  /**
   * Subscribe to review reminder events
   */
  subscribeToReviewReminders: (callback: (event: ReviewReminderEvent) => void) => Promise<void>;
  
  /**
   * Check if connected to NATS
   */
  isConnected: boolean;
  
  /**
   * Connection status
   */
  status: string;
  
  /**
   * Manually connect to NATS
   */
  connect: () => Promise<void>;
  
  /**
   * Manually disconnect from NATS
   */
  disconnect: () => Promise<void>;
}

/**
 * Hook for using NATS JetStream in React components
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { subscribeToCommitReviews, isConnected } = useNATS();
 *   
 *   useEffect(() => {
 *     if (isConnected) {
 *       subscribeToCommitReviews((event) => {
 *         console.log('New commit review:', event);
 *         // Show review modal
 *       });
 *     }
 *   }, [isConnected, subscribeToCommitReviews]);
 *   
 *   return <div>Connected: {isConnected ? 'Yes' : 'No'}</div>;
 * }
 * ```
 */
export function useNATS(options: UseNATSOptions = {}): UseNATSReturn {
  const {
    url,
    autoConnect = true,
    autoDisconnect = true,
  } = options;

  const clientRef = useRef(getNATSClient());
  const isConnectedRef = useRef(false);
  const statusRef = useRef('disconnected');

  // Connect to NATS
  const connect = useCallback(async () => {
    try {
      if (!clientRef.current.isConnected()) {
        await initNATS(url);
        isConnectedRef.current = true;
        statusRef.current = clientRef.current.getStatus();
        console.log('[useNATS] Connected to NATS');
      }
    } catch (error) {
      console.error('[useNATS] Failed to connect:', error);
      isConnectedRef.current = false;
      statusRef.current = 'error';
    }
  }, [url]);

  // Disconnect from NATS
  const disconnect = useCallback(async () => {
    try {
      if (clientRef.current.isConnected()) {
        await clientRef.current.disconnect();
        isConnectedRef.current = false;
        statusRef.current = 'disconnected';
        console.log('[useNATS] Disconnected from NATS');
      }
    } catch (error) {
      console.error('[useNATS] Failed to disconnect:', error);
    }
  }, []);

  // Subscribe to commit reviews
  const subscribeToCommitReviews = useCallback(async (callback: (event: CommitReviewEvent) => void) => {
    if (!clientRef.current.isConnected()) {
      console.warn('[useNATS] Not connected, attempting to connect...');
      await connect();
    }
    await clientRef.current.subscribeToCommitReviews(callback);
  }, [connect]);

  // Subscribe to budget alerts
  const subscribeToBudgetAlerts = useCallback(async (callback: (event: BudgetAlertEvent) => void) => {
    if (!clientRef.current.isConnected()) {
      console.warn('[useNATS] Not connected, attempting to connect...');
      await connect();
    }
    await clientRef.current.subscribeToBudgetAlerts(callback);
  }, [connect]);

  // Subscribe to time entries
  const subscribeToTimeEntries = useCallback(async (callback: (event: TimeEntryEvent) => void) => {
    if (!clientRef.current.isConnected()) {
      console.warn('[useNATS] Not connected, attempting to connect...');
      await connect();
    }
    await clientRef.current.subscribeToTimeEntries(callback);
  }, [connect]);

  // Subscribe to review reminders
  const subscribeToReviewReminders = useCallback(async (callback: (event: ReviewReminderEvent) => void) => {
    if (!clientRef.current.isConnected()) {
      console.warn('[useNATS] Not connected, attempting to connect...');
      await connect();
    }
    await clientRef.current.subscribeToReviewReminders(callback);
  }, [connect]);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    // Auto-disconnect on unmount
    return () => {
      if (autoDisconnect) {
        disconnect();
      }
    };
  }, [autoConnect, autoDisconnect, connect, disconnect]);

  return {
    subscribeToCommitReviews,
    subscribeToBudgetAlerts,
    subscribeToTimeEntries,
    subscribeToReviewReminders,
    isConnected: isConnectedRef.current,
    status: statusRef.current,
    connect,
    disconnect,
  };
}

export default useNATS;
