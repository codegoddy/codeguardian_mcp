import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '@/contexts/AuthContext';

interface WebSocketMessage {
  event_type: string;
  project_id?: string;
  contract_id?: string;
  deliverable_id?: string;
  user_id?: string;
  [key: string]: string | number | boolean | null | undefined;
}

export const useWebSocket = () => {
  const queryClient = useQueryClient();
  const { token, isAuthenticated } = useAuthContext();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const reconnectAttemptsRef = useRef(0);

  useEffect(() => {
    if (!isAuthenticated || !token) return;

    // PERFORMANCE: Delay WebSocket connection to avoid competing with initial page load
    // This allows critical resources (API data, styles) to load first
    const WEBSOCKET_DELAY_MS = 2000;


    const connect = () => {
      // Use environment variable for WebSocket URL
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = process.env.NEXT_PUBLIC_API_URL?.replace(/^https?:\/\//, '') || 
                     (process.env.NODE_ENV === 'production' 
                       ? 'api.devhq.site' 
                       : 'localhost:8000');
      
      const wsUrl = `${wsProtocol}//${wsHost}/api/ws/events`;
      console.log('[WebSocket] Connecting to:', wsUrl);
      
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[WebSocket] ✅ Connected');
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          handleWebSocketMessage(message);
        } catch (error) {
          console.error('[WebSocket] Failed to parse message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
      };

      ws.onclose = () => {
        console.log('[WebSocket] Disconnected');
        wsRef.current = null;

        // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        reconnectAttemptsRef.current++;

        console.log(`[WebSocket] Reconnecting in ${delay}ms...`);
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      };

      wsRef.current = ws;
    };

    const handleWebSocketMessage = (message: WebSocketMessage) => {
      console.log('[WebSocket] 📨 Received:', message.event_type);

      switch (message.event_type) {
        case 'project_status_changed':
          // Invalidate projects list and specific project
          console.log('[WebSocket] 🔄 Invalidating project queries');
          queryClient.invalidateQueries({ queryKey: ['projects'] });
          if (message.project_id) {
            queryClient.invalidateQueries({ 
              queryKey: ['project', message.project_id] 
            });
          }
          break;

        case 'contract_status_changed':
          // Invalidate contracts and related project
          console.log('[WebSocket] 🔄 Invalidating contract queries');
          queryClient.invalidateQueries({ queryKey: ['contracts'] });
          if (message.project_id) {
            queryClient.invalidateQueries({ 
              queryKey: ['project', message.project_id] 
            });
          }
          break;

        case 'contract_signed':
          // Invalidate everything related to the project
          console.log('[WebSocket] 🔄 Invalidating all project-related queries');
          queryClient.invalidateQueries({ queryKey: ['contracts'] });
          queryClient.invalidateQueries({ queryKey: ['projects'] });
          if (message.project_id) {
            queryClient.invalidateQueries({ 
              queryKey: ['project', message.project_id] 
            });
          }
          break;

        case 'time_entry_created':
          // Invalidate time entries and deliverable stats
          console.log('[WebSocket] 🔄 Invalidating time entry queries');
          queryClient.invalidateQueries({ queryKey: ['pending-time-entries'] });
          if (message.deliverable_id) {
            queryClient.invalidateQueries({ 
              queryKey: ['deliverable-time-stats', message.deliverable_id] 
            });
          }
          if (message.project_id) {
            queryClient.invalidateQueries({ 
              queryKey: ['project-time-entries', message.project_id] 
            });
          }
          break;

        case 'deliverable_stats_updated':
          // Invalidate deliverable stats and project data
          console.log('[WebSocket] 🔄 Invalidating deliverable stats');
          if (message.deliverable_id) {
            queryClient.invalidateQueries({ 
              queryKey: ['deliverable-time-stats', message.deliverable_id] 
            });
          }
          if (message.project_id) {
            queryClient.invalidateQueries({ 
              queryKey: ['project', message.project_id] 
            });
            queryClient.invalidateQueries({ 
              queryKey: ['deliverables', message.project_id] 
            });
          }
          break;

        case 'budget_alert':
          // Invalidate budget-related queries
          console.log('[WebSocket] 🔄 Invalidating budget queries');
          if (message.deliverable_id) {
            queryClient.invalidateQueries({ 
              queryKey: ['deliverable-time-stats', message.deliverable_id] 
            });
          }
          if (message.project_id) {
            queryClient.invalidateQueries({ 
              queryKey: ['project', message.project_id] 
            });
          }
          break;

        case 'session.started':
        case 'session.stopped':
        case 'session.paused':
        case 'session.resumed':
          // Invalidate active sessions
          console.log('[WebSocket] 🔄 Invalidating active sessions');
          queryClient.invalidateQueries({ queryKey: ['active-sessions'] });
          break;

        case 'session_stopped':
          // Session stopped event (with underscore) - trigger review modal
          console.log('[WebSocket] 🎯 Session stopped - triggering review modal');
          queryClient.invalidateQueries({ queryKey: ['active-sessions'] });
          
          // Dispatch custom event for dashboard to listen to
          window.dispatchEvent(new CustomEvent('session-stopped', { 
            detail: {
              session_id: message.session_id,
              deliverable_id: message.deliverable_id,
              project_id: message.project_id,
              duration_minutes: message.duration_minutes,
              tracking_code: message.tracking_code
            }
          }));
          break;

        default:
          // Log unhandled events for debugging
          console.log('[WebSocket] ℹ️  Unhandled event type:', message.event_type);
      }
    };

    // PERFORMANCE: Defer connection to let page load first
    const connectionTimeoutId = setTimeout(connect, WEBSOCKET_DELAY_MS);

    return () => {
      if (connectionTimeoutId) {
        clearTimeout(connectionTimeoutId);
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [token, isAuthenticated, queryClient]);

  return wsRef.current;
};
