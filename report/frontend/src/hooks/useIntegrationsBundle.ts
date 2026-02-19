import { useQuery } from '@tanstack/react-query';
import { authenticatedApiCall } from '../services/auth';

export interface IntegrationsBundle {
  time_tracker: Array<{
    id: string;
    provider: string;
    provider_username: string;
    is_active: boolean;
    created_at: string | null;
  }>;
  git: Array<{
    id: string;
    platform: string;
    username: string;
    connected_at: string | null;
  }>;
  google_calendar: {
    connected: boolean;
    google_email?: string;
    calendar_id?: string;
    sync_enabled?: boolean;
    last_sync_at?: string | null;
  };
}

export function useIntegrationsBundle() {
  return useQuery<IntegrationsBundle, Error>({
    queryKey: ['integrations-bundle'],
    queryFn: async () => {
      const response = await authenticatedApiCall<IntegrationsBundle>('/api/integrations/bundle', {
        method: 'GET',
      });

      if (!response.success || !response.data) {
        throw new Error('Failed to fetch integrations bundle');
      }

      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
