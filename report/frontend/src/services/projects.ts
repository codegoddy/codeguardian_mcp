import ApiService from './api';

// All IDs are UUIDs represented as strings

export interface ProjectCreate {
  client_id: string;
  name: string;
  description?: string;
  start_date?: string;
  due_date?: string;
}

export interface ProjectUpdate {
  name?: string;
  description?: string;
  start_date?: string;
  due_date?: string;
  status?: string;
}

export interface ProjectCreateWithScopeGuardrail {
  client_id: string;
  name: string;
  description?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  project_id: string;
  project_budget: number;
  auto_replenish?: boolean;
  auto_pause_threshold: number;
  max_revisions: number;
  allowed_repositories: string[];
  contract_template_id?: string | null;
}

export interface Project {
  id: string;
  user_id: string;
  client_id: string;
  client_name?: string;
  name: string;
  description: string | null;
  start_date: string | null;
  due_date: string | null;
  status: string;
  project_id: string;
  project_budget: number;
  current_budget_remaining: number;
  auto_replenish: boolean;
  auto_pause_threshold: number;
  max_revisions: number;
  current_revision_count: number;
  allowed_repositories: string[] | null;
  time_tracker_provider: string | null;
  time_tracker_project_name: string | null;
  contract_type: string | null;
  contract_file_url: string | null;
  contract_pdf_url: string | null;
  contract_signed: boolean;
  contract_signed_at: string | null;
  total_hours_tracked: number;
  total_revenue: number;
  scope_deviation_percentage: number;
  change_request_value_added: number;
  applied_template_id?: string | null;
  applied_template_name?: string | null;
  applied_template_type?: string | null;
  created_at: string;
  updated_at: string;
  
  // Optimization fields
  total_entries?: number;
  has_active_portal?: boolean;
  portal_magic_link?: string | null;
  portal_expires_at?: string | null;
}

export interface ScopeGuardrailConfig {
  project_id: string;
  project_budget: number;
  auto_replenish: boolean;
  auto_pause_threshold: number;
  max_revisions: number;
  allowed_repositories: string[];
}

export interface ProjectMetrics {
  total_hours_tracked: number;
  total_revenue: number;
  budget_remaining: number;
  budget_used_percentage: number;
  scope_deviation_percentage: number;
  change_request_value_added: number;
  deliverables_completed: number;
  deliverables_total: number;
  change_requests_approved: number;
  change_requests_total: number;
}

export const projectsApi = {
  getProjects: async (statusFilter?: string): Promise<Project[]> => {
    const query = statusFilter ? `?status_filter=${statusFilter}` : '';
    return ApiService.get<Project[]>(`/api/projects${query}`);
  },

  getProject: async (id: string): Promise<Project> => {
    return ApiService.get<Project>(`/api/projects/${id}`);
  },

  createProjectWithScopeGuardrail: async (data: ProjectCreateWithScopeGuardrail): Promise<Project> => {
    return ApiService.post<Project>('/api/projects/with-scope-guardrail', data);
  },

  updateProject: async (id: string, data: ProjectUpdate): Promise<Project> => {
    return ApiService.put<Project>(`/api/projects/${id}`, data);
  },

  configureScopeGuardrail: async (id: string, config: ScopeGuardrailConfig): Promise<Project> => {
    return ApiService.post<Project>(`/api/projects/${id}/scope-guardrail`, config);
  },

  getMetrics: async (id: string): Promise<ProjectMetrics> => {
    return ApiService.get<ProjectMetrics>(`/api/projects/${id}/metrics`);
  },

  deleteProject: async (id: string): Promise<void> => {
    return ApiService.delete(`/api/projects/${id}`);
  },
};
