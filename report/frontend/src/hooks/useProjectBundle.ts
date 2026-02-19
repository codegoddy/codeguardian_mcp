import { useQuery } from '@tanstack/react-query';
import { authenticatedApiCall } from '../services/auth';

export interface ProjectBundle {
  project: {
    id: string;
    name: string;
    client_name: string;
    description: string | null;
    status: string;
    project_budget: number;
    current_budget_remaining: number;
    total_hours_tracked: number;
    total_revenue: number;
    start_date: string | null;
    due_date: string | null;
    contract_signed: boolean;
    is_active: boolean;
    created_at: string | null;
    updated_at: string | null;
    [key: string]: unknown;
  };
  metrics: {
    total_hours_tracked: number;
    total_revenue: number;
    budget_remaining: number;
    budget_used_percentage: number;
    scope_deviation_percentage: number | null;
    change_request_value_added: number | null;
    deliverables_completed: number;
    deliverables_total: number;
    change_requests_approved: number;
    change_requests_total: number;
  };
  deliverables: Array<{
    id: string;
    title: string;
    description: string | null;
    status: string;
    estimated_hours: number | null;
    actual_hours: number | null;
    hours_used_percentage: number | null;
    created_at: string | null;
    updated_at: string | null;
  }>;
  change_requests: Array<{
    id: string;
    title: string;
    description: string | null;
    status: string;
    amount: number;
    created_at: string | null;
  }>;
}

export function useProjectBundle(projectId: string | null) {
  return useQuery<ProjectBundle, Error>({
    queryKey: ['project-bundle', projectId],
    queryFn: async () => {
      if (!projectId) {
        throw new Error('Project ID is required');
      }

      const response = await authenticatedApiCall<ProjectBundle>(
        `/api/projects/${projectId}/bundle`,
        { method: 'GET' }
      );

      if (!response.success || !response.data) {
        throw new Error('Failed to fetch project bundle');
      }

      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!projectId,
  });
}
