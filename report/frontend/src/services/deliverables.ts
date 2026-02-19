import { API_BASE_URL } from '@/lib/config';
import { createClient } from '@/utils/supabase/client';

export interface DeliverableCreate {
  project_id: string;
  task_reference?: string;
  title: string;
  description?: string;
  acceptance_criteria?: string;
  is_in_scope?: boolean;
  estimated_hours?: number;
  milestone_id?: string | null;
}

export interface DeliverableUpdate {
  task_reference?: string;
  title?: string;
  description?: string;
  acceptance_criteria?: string;
  status?: string;
  is_in_scope?: boolean;
  is_approved?: boolean;
  git_pr_url?: string;
  git_pr_number?: number;
  git_branch_name?: string;
  preview_url?: string;
  estimated_hours?: number;
  milestone_id?: string | null;
}

export interface DeliverableVerification {
  pr_url: string;
  manual_override?: boolean;
  justification?: string;
}

export interface Deliverable {
  id: string;
  project_id: string;
  task_reference: string | null;
  title: string;
  description: string | null;
  acceptance_criteria: string | null;
  status: string;
  is_in_scope: boolean;
  is_approved: boolean;
  git_pr_url: string | null;
  git_pr_number: number | null;
  git_commit_hash: string | null;
  git_merge_status: string | null;
  git_branch_name: string | null;
  preview_url: string | null;
  verified_at: string | null;
  auto_verified: boolean;
  manual_override: boolean;
  verification_justification: string | null;
  documentation_markdown: string | null;
  documentation_generated_at: string | null;
  estimated_hours: number | null;
  actual_hours: number;
  total_cost: number;
  created_at: string;
  updated_at: string;
  milestone_id: string | null;
  work_type: string | null;
  developer_notes: string | null;
  notes_visible_to_client: boolean;
}

async function authenticatedApiCall(endpoint: string, options: RequestInit = {}) {
  // SECURITY: Tokens are in HTTP-only cookies, sent automatically by browser
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers as Record<string, string>,
  };

  // Add Supabase auth token if available
  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
  } catch (e) {
    console.warn('Failed to get Supabase session:', e);
  }
  
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include', // Send cookies with request
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || 'API request failed');
  }

  return data.data;
}

export const deliverablesApi = {
  getDeliverables: async (projectId?: string, statusFilter?: string): Promise<Deliverable[]> => {
    const params = new URLSearchParams();
    if (projectId) params.append('project_id', projectId.toString());
    if (statusFilter) params.append('status_filter', statusFilter);
    const query = params.toString() ? `?${params.toString()}` : '';
    return authenticatedApiCall(`/api/deliverables${query}`);
  },

  getDeliverable: async (id: string): Promise<Deliverable> => {
    return authenticatedApiCall(`/api/deliverables/${id}`);
  },

  createDeliverable: async (data: DeliverableCreate): Promise<Deliverable> => {
    return authenticatedApiCall('/api/deliverables', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateDeliverable: async (id: string, data: DeliverableUpdate): Promise<Deliverable> => {
    return authenticatedApiCall(`/api/deliverables/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  verifyDeliverable: async (id: string, verification: DeliverableVerification): Promise<Deliverable> => {
    return authenticatedApiCall(`/api/deliverables/${id}/verify`, {
      method: 'POST',
      body: JSON.stringify(verification),
    });
  },

  markReadyToBill: async (id: string): Promise<Deliverable> => {
    return authenticatedApiCall(`/api/deliverables/${id}/mark-ready-to-bill`, {
      method: 'POST',
    });
  },

  deleteDeliverable: async (id: string): Promise<{ id: string }> => {
    return authenticatedApiCall(`/api/deliverables/${id}`, {
      method: 'DELETE',
    });
  },

  getDeliverableActivity: async (id: string): Promise<DeliverableActivity> => {
    return authenticatedApiCall(`/api/deliverables/${id}/activity`);
  },
};

export interface ActivityMetrics {
  total_commits: number;
  total_files_changed: number;
  total_insertions: number;
  total_deletions: number;
  commit_density: number;
  activity_score: number;
  fraud_risk: string;
}

export interface TimelineEvent {
  type: string;
  timestamp: string;
  description: string;
  duration_hours?: number;
  files_changed?: number;
  commit_sha?: string;
}

export interface TimelineValidationResponse {
  commits_outside: Record<string, unknown>[];
  commits_in_grace_period: Record<string, unknown>[];
  outside_percentage: number;
  is_suspicious: boolean;
  needs_review: boolean;
  summary: string;
}

export interface DeliverableActivity {
  deliverable: {
    id: string;
    title: string;
    status: string;
    work_type: string | null;
    actual_hours: number;
    total_cost: number;
  };
  time_entries: Array<{
    id: string;
    start_time: string;
    end_time: string | null;
    duration_hours: number;
    description: string | null;
    developer_notes: string | null;
    notes_visible_to_client: boolean;
    attachments?: Array<{
      url: string;
      filename: string;
      type: string;
      size: number;
    }>;
    preview_links?: Array<{
      url: string;
      title?: string;
      description?: string;
    }>;
  }>;
  commits: Array<{
    sha: string;
    message: string;
    author: string;
    committed_at: string;
    files_changed: number;
    insertions: number;
    deletions: number;
  }>;
  activity_metrics: ActivityMetrics;
  timeline: TimelineEvent[];
  timeline_validation: TimelineValidationResponse | null;
}
