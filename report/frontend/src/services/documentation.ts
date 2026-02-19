/**
 * Documentation API Service
 * 
 * Handles fetching and regenerating project documentation.
 */

import ApiService from './api';

export interface DocumentationResponse {
  success: boolean;
  data: {
    deliverable_id?: number;
    project_id?: number;
    milestone_id?: number;
    milestone_name?: string;
    documentation: string;
    generated_at?: string;
    format: string;
  };
  message: string;
}

export const documentationApi = {
  /**
   * Get documentation for a specific deliverable
   */
  getDeliverableDocumentation: async (deliverableId: string): Promise<DocumentationResponse> => {
    return ApiService.get<DocumentationResponse>(`/api/deliverables/${deliverableId}/documentation`);
  },

  /**
   * Regenerate documentation for a deliverable
   */
  regenerateDeliverableDocumentation: async (deliverableId: string): Promise<DocumentationResponse> => {
    return ApiService.post<DocumentationResponse>(`/api/deliverables/${deliverableId}/regenerate-documentation`);
  },

  /**
   * Get documentation for a specific milestone
   */
  getMilestoneDocumentation: async (
    projectId: string,
    milestoneId: string
  ): Promise<DocumentationResponse> => {
    return ApiService.get<DocumentationResponse>(`/api/projects/${projectId}/documentation/milestone/${milestoneId}`);
  },

  /**
   * Get comprehensive project documentation for closeout
   */
  getProjectDocumentation: async (projectId: string): Promise<DocumentationResponse> => {
    return ApiService.get<DocumentationResponse>(`/api/projects/${projectId}/documentation`);
  },
};
