import ApiService from './api';

// All IDs are UUIDs represented as strings

export interface Milestone {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  order: number;
  status: 'pending' | 'in_progress' | 'completed' | 'billed';
  total_deliverables: number;
  completed_deliverables: number;
  ready_to_bill_deliverables: number;
  target_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MilestoneCreate {
  name: string;
  description?: string;
  order?: number;
  target_date?: string;
}

export interface MilestoneUpdate {
  name?: string;
  description?: string;
  order?: number;
  status?: string;
  target_date?: string;
}

export const milestonesApi = {
  async createMilestone(projectId: string, data: MilestoneCreate): Promise<Milestone> {
    return ApiService.post<Milestone>(`/api/projects/${projectId}/milestones`, data);
  },

  async listMilestones(projectId: string): Promise<Milestone[]> {
    return ApiService.get<Milestone[]>(`/api/projects/${projectId}/milestones`);
  },

  async getMilestone(projectId: string, milestoneId: string): Promise<Milestone> {
    return ApiService.get<Milestone>(`/api/projects/${projectId}/milestones/${milestoneId}`);
  },

  async updateMilestone(projectId: string, milestoneId: string, data: MilestoneUpdate): Promise<Milestone> {
    return ApiService.put<Milestone>(`/api/projects/${projectId}/milestones/${milestoneId}`, data);
  },

  async deleteMilestone(projectId: string, milestoneId: string): Promise<void> {
    await ApiService.delete(`/api/projects/${projectId}/milestones/${milestoneId}`);
  },
};
