/**
 * Project Templates API Service
 */

import { apiCall } from './auth';

interface TemplateData {
  default_hourly_rate: number;
  default_change_request_rate: number;
  max_revisions: number;
  milestones: Array<{
    name: string;
    order: number;
    deliverables: Array<{
      title: string;
      description: string;
      estimated_hours: number;
      acceptance_criteria: string;
    }>;
  }>;
}

export interface ProjectTemplate {
  id: string;
  user_id: string | null;
  name: string;
  description: string | null;
  category: string | null;
  template_type?: string; // 'code' or 'no-code'
  template_data: TemplateData;
  is_system_template: boolean;
  is_public: boolean;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export interface TemplateCreate {
  name: string;
  description?: string;
  category?: string;
  template_type?: string; // 'code' or 'no-code'
  template_data: TemplateData;
  is_public?: boolean;
}

export interface TemplateUpdate {
  name?: string;
  description?: string;
  category?: string;
  template_type?: string;
  template_data?: TemplateData;
  is_public?: boolean;
}

export interface TemplateUse {
  template_id: string;
  customizations?: Partial<TemplateData>;
}

export const templatesApi = {
  /**
   * Get all templates (system + user's custom)
   */
  getAllTemplates: async (): Promise<ProjectTemplate[]> => {
    const response = await apiCall<ProjectTemplate[]>('/api/templates', { method: 'GET' });
    if (!response.success) throw new Error(response.error);
    return response.data || [];
  },

  /**
   * Get only system templates
   */
  getSystemTemplates: async (): Promise<ProjectTemplate[]> => {
    const response = await apiCall<ProjectTemplate[]>('/api/templates/system', { method: 'GET' });
    if (!response.success) throw new Error(response.error);
    return response.data || [];
  },

  /**
   * Get only user's custom templates
   */
  getCustomTemplates: async (): Promise<ProjectTemplate[]> => {
    const response = await apiCall<ProjectTemplate[]>('/api/templates/custom', { method: 'GET' });
    if (!response.success) throw new Error(response.error);
    return response.data || [];
  },

  /**
   * Get a specific template by ID
   */
  getTemplate: async (id: string): Promise<ProjectTemplate> => {
    const response = await apiCall<ProjectTemplate>(`/api/templates/${id}`, { method: 'GET' });
    if (!response.success) throw new Error(response.error);
    // @ts-expect-error Response data type mismatch
    return response.data;
  },

  /**
   * Create a new custom template
   */
  createTemplate: async (data: TemplateCreate): Promise<ProjectTemplate> => {
    const response = await apiCall<ProjectTemplate>('/api/templates', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    if (!response.success) throw new Error(response.error);
    // @ts-expect-error Response data type mismatch
    return response.data;
  },

  /**
   * Update a custom template
   */
  updateTemplate: async (id: string, data: TemplateUpdate): Promise<ProjectTemplate> => {
    const response = await apiCall<ProjectTemplate>(`/api/templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    if (!response.success) throw new Error(response.error);
    // @ts-expect-error Response data type mismatch
    return response.data;
  },

  /**
   * Delete a custom template
   */
  deleteTemplate: async (id: string): Promise<void> => {
    const response = await apiCall<void>(`/api/templates/${id}`, { method: 'DELETE' });
    if (!response.success) throw new Error(response.error);
  },

  /**
   * Use a template to create a project
   */
  useTemplate: async (data: TemplateUse): Promise<{ template_id: string; template_data: TemplateData }> => {
    const response = await apiCall<{ template_id: string; template_data: TemplateData }>(
      `/api/templates/${data.template_id}/use`, 
      {
        method: 'POST',
        body: JSON.stringify(data)
      }
    );
    if (!response.success) throw new Error(response.error);
    // @ts-expect-error Response data type mismatch
    return response.data;
  },

  /**
   * Apply a template to an existing project
   */
  applyTemplateToProject: async (
    templateId: string, 
    projectId: string,
    customTemplateData?: TemplateData
  ): Promise<{
    success: boolean;
    message: string;
    milestones_created: number;
    deliverables_created: number;
    template_id: string;
    project_id: string;
  }> => {
    const response = await apiCall<{
      success: boolean;
      message: string;
      milestones_created: number;
      deliverables_created: number;
      template_id: string;
      project_id: string;
    }>(`/api/templates/${templateId}/apply/${projectId}`, {
      method: 'POST',
      body: JSON.stringify({
        custom_template_data: customTemplateData
      })
    });
    if (!response.success) throw new Error(response.error);
    // @ts-expect-error Response data type mismatch
    return response.data;
  },
};
