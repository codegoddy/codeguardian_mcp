import { useQuery } from '@tanstack/react-query';
import { authenticatedApiCall } from '../services/auth';

interface TimeSession {
  id: string;
  tracking_code: string;
  status: 'active' | 'paused' | 'completed';
  start_time: string;
  accumulated_minutes: number;
  project_id: string;
  deliverable_id: string;
}

export function useActiveSessions() {
  const { data: sessions = [], isLoading: loading, error, refetch } = useQuery<TimeSession[], Error>({
    queryKey: ['active-sessions'],
    queryFn: async () => {
      const response = await authenticatedApiCall('/api/v1/time-tracking/sessions/active', {
        method: 'GET',
      });
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch active sessions');
      }
      
      return response.data as TimeSession[];
    },
  });

  return {
    sessions,
    loading,
    error,
    refetch,
  };
}

// Helper hook to get session for a specific deliverable
export function useDeliverableSession(deliverableId: string) {
  const { sessions, loading, error } = useActiveSessions();
  
  const session = sessions.find(s => s.deliverable_id === deliverableId);
  
  return {
    session: session || null,
    loading,
    error,
  };
}
