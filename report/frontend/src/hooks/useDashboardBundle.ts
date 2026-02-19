import { useQuery } from '@tanstack/react-query';
import { authenticatedApiCall } from '../services/auth';

export interface DashboardBundle {
  projects: Array<{
    id: string;
    name: string;
    client_name: string;
    status: string;
    project_budget: number;
    current_budget_remaining: number;
    budget_percentage: number;
    total_revenue: number;
    updated_at: string | null;
  }>;
  clients: Array<{
    id: string;
    name: string;
    email: string;
    company: string | null;
  }>;
  change_requests: Array<{
    id: string;
    project_id: string | null;
    title: string;
    status: string;
    amount: number | null;
    created_at: string | null;
  }>;
  invoices_summary: {
    total_invoiced: number;
    total_paid: number;
    total_unpaid: number;
    pending_count: number;
    paid_count: number;
    overdue_count: number;
  };
  time_summary: {
    total_hours: number;
    total_cost: number;
    entry_count: number;
    days_tracked: number;
  };
  recent_invoices: Array<{
    id: string;
    amount: number;
    status: string;
    client_name: string;
    created_at: string | null;
  }>;
  stats: {
    active_projects: number;
    total_clients: number;
    pending_change_requests: number;
    overdue_invoices: number;
  };
}

export function useDashboardBundle() {
  return useQuery<DashboardBundle, Error>({
    queryKey: ['dashboard-bundle'],
    queryFn: async () => {
      const response = await authenticatedApiCall<DashboardBundle>('/api/dashboard/bundle', {
        method: 'GET',
      });

      if (!response.success || !response.data) {
        throw new Error('Failed to fetch dashboard bundle');
      }

      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
