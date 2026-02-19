'use client';

import { useWebSocket } from '@/hooks/useWebSocket';

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  // Initialize WebSocket connection globally
  useWebSocket();
  
  return <>{children}</>;
}
