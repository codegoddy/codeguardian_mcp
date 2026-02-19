/**
 * React Hook for NATS Connection Management
 * 
 * Handles the core connection lifecycle to NATS JetStream.
 * Use this hook when you need direct control over the connection,
 * or use individual listener hooks which will auto-manage the connection.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { getNATSClient, initNATS } from '@/services/nats';

export interface UseNATSConnectionOptions {
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

export interface UseNATSConnectionReturn {
  /**
   * Whether the client is connected to NATS
   */
  isConnected: boolean;
  
  /**
   * Current connection status
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
  
  /**
   * Get the NATS client instance
   */
  getClient: () => ReturnType<typeof getNATSClient>;
}

/**
 * Hook for managing NATS JetStream connection
 * 
 * @example
 * ```tsx
 * function App() {
 *   const { isConnected, status } = useNATSConnection();
 *   
 *   return <div>NATS Status: {status}</div>;
 * }
 * ```
 */
export function useNATSConnection(
  options: UseNATSConnectionOptions = {}
): UseNATSConnectionReturn {
  const {
    url,
    autoConnect = true,
    autoDisconnect = true,
  } = options;

  const clientRef = useRef(getNATSClient());
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState('disconnected');

  // Connect to NATS
  const connect = useCallback(async () => {
    try {
      if (!clientRef.current.isConnected()) {
        await initNATS(url);
        setIsConnected(true);
        setStatus(clientRef.current.getStatus());
        console.log('[useNATSConnection] Connected to NATS');
      }
    } catch (error) {
      console.error('[useNATSConnection] Failed to connect:', error);
      setIsConnected(false);
      setStatus('error');
    }
  }, [url]);

  // Disconnect from NATS
  const disconnect = useCallback(async () => {
    try {
      if (clientRef.current.isConnected()) {
        await clientRef.current.disconnect();
        setIsConnected(false);
        setStatus('disconnected');
        console.log('[useNATSConnection] Disconnected from NATS');
      }
    } catch (error) {
      console.error('[useNATSConnection] Failed to disconnect:', error);
    }
  }, []);

  // Get client instance
  const getClient = useCallback(() => {
    return clientRef.current;
  }, []);

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

  // Poll connection status periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const connected = clientRef.current.isConnected();
      const currentStatus = clientRef.current.getStatus();
      
      if (connected !== isConnected) {
        setIsConnected(connected);
      }
      
      if (currentStatus !== status) {
        setStatus(currentStatus);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isConnected, status]);

  return {
    isConnected,
    status,
    connect,
    disconnect,
    getClient,
  };
}

export default useNATSConnection;




