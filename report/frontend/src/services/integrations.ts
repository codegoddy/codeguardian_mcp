/**
 * Time Tracker Integrations API Service
 */

import ApiService from './api';

export interface TimeTrackerIntegration {
  id: string;
  user_id: string;
  provider: 'toggl' | 'harvest';
  provider_user_id: string | null;
  provider_username: string | null;
  account_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TimeTrackerIntegrationCreate {
  provider: 'toggl' | 'harvest';
  api_token: string;
  account_id?: string; // Required for Harvest
}

export interface TimeTrackerProject {
  id: string;
  name: string;
  client_name: string | null;
  is_active: boolean;
}

export const integrationsApi = {
  /**
   * Create or update a time tracker integration
   */
  createTimeTrackerIntegration: async (data: TimeTrackerIntegrationCreate): Promise<TimeTrackerIntegration> => {
    return ApiService.post<TimeTrackerIntegration>('/api/integrations/time-tracker', data);
  },

  /**
   * Get all time tracker integrations for the current user
   */
  getTimeTrackerIntegrations: async (): Promise<TimeTrackerIntegration[]> => {
    return ApiService.get<TimeTrackerIntegration[]>('/api/integrations/time-tracker');
  },

  /**
   * Get projects from a time tracker provider
   */
  getTimeTrackerProjects: async (provider: 'toggl' | 'harvest'): Promise<TimeTrackerProject[]> => {
    return ApiService.get<TimeTrackerProject[]>(`/api/integrations/time-tracker/${provider}/projects`);
  },

  /**
   * Disconnect a time tracker integration
   */
  deleteTimeTrackerIntegration: async (provider: 'toggl' | 'harvest'): Promise<{ status: string; message: string }> => {
    return ApiService.delete<{ status: string; message: string }>(`/api/integrations/time-tracker/${provider}`);
  },
};
