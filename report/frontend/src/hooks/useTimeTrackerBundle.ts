import { useQuery } from '@tanstack/react-query';
import { authenticatedApiCall } from '../services/auth';

export interface PlannedBlockResponse {
  id: string;
  deliverable_id: string;
  planned_date: string;
  start_time: string | null;
  end_time: string | null;
  planned_hours: number;
  description: string | null;
  status: string;
  deliverable_title: string | null;
  project_name: string | null;
}

export interface TimeTrackerBundle {
  time_entries: Record<string, Array<{
    id: string;
    project_id: string;
    deliverable_id: string;
    user_id: string;
    description: string | null;
    start_time: string | null;
    end_time: string | null;
    duration_minutes: number | null;
    hourly_rate: number | null;
    cost: number | null;
    currency: string | null;
    source: string | null;
    git_commit_sha: string | null;
    git_commit_message: string | null;
    auto_generated: boolean;
    is_billable: boolean;
    is_billed: boolean;
    created_at: string;
  }>>;
  planned_blocks: PlannedBlockResponse[];
  total_hours: number;
  total_cost: number;
  total_planned_hours: number;
  default_currency: string;
  total_entries: number;
  total_blocks: number;
}

export function useTimeTrackerBundle(startDate?: string, endDate?: string) {
  return useQuery<TimeTrackerBundle, Error>({
    queryKey: ['time-tracker-bundle', startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);

      const response = await authenticatedApiCall<TimeTrackerBundle>(
        `/api/time-entries/tracker/bundle?${params.toString()}`,
        { method: 'GET' }
      );

      if (!response.success || !response.data) {
        throw new Error('Failed to fetch time tracker bundle');
      }

      return response.data;
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}
