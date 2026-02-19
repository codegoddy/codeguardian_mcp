/**
 * AI Estimation API Service
 * 
 * This service handles AI-powered time estimation for project deliverables.
 * 
 * HOW IT WORKS:
 * 1. Frontend sends template data (all deliverables) to backend
 * 2. Backend uses BATCH processing - sends ALL deliverables in ONE AI request
 * 3. AI returns estimates for ALL deliverables in a single response
 * 4. Backend parses and maps estimates back to deliverables
 * 5. Frontend receives structured response with each deliverable's estimate
 * 
 * RESPONSE STRUCTURE:
 * {
 *   total_original_hours: 134,
 *   total_estimated_hours: 204,
 *   confidence_score: 78,
 *   adjustment_percentage: 52,
 *   is_first_time_user: false,
 *   timeline_analysis: "⚠️ High Risk: Estimated 204h exceeds available time...",
 *   deliverables: [
 *     {
 *       title: "Project architecture design",
 *       description: "Design system architecture...",
 *       original_hours: 8,
 *       estimated_hours: 12,        // AI's estimate
 *       confidence: 90,              // How confident AI is (0-100)
 *       reasoning: "Key decisions on stack/schema need iteration...",
 *       risk_factors: ["Scope creep", "Unfamiliar tech stack"]
 *     },
 *     // ... more deliverables
 *   ]
 * }
 */


import { apiCall } from './auth';

interface TemplateData {
  milestones: Array<{
    name: string;
    deliverables: Array<{
      title: string;
      description?: string;
      estimated_hours: number;
    }>;
  }>;
}

export interface RiskFactor {
  factor: string;
  mitigation: string;
}

export interface DeliverableEstimate {
  title: string;
  description?: string;
  original_hours: number;
  estimated_hours: number;
  optimistic_hours?: number;
  pessimistic_hours?: number;
  confidence: number;
  reasoning: string;
  similar_count: number;
  risk_factors: RiskFactor[];
  manually_adjusted?: boolean;
}

export interface BudgetAnalysis {
  total_budget: number;
  hourly_rate: number;
  budget_hours: number;  // How many hours the budget allows
  estimated_cost: number;  // Cost based on AI estimated hours
  budget_variance: number;  // Positive = under budget, negative = over budget
  budget_utilization?: number;  // Percentage of budget hours being used
  budget_status: 'under' | 'on_track' | 'over' | 'critical';
  recommendation?: string;
}

export interface TemplateEstimateResponse {
  total_original_hours: number;
  total_estimated_hours: number;
  confidence_score: number;
  adjustment_percentage: number;
  is_first_time_user: boolean;
  timeline_analysis?: string;
  budget_analysis?: BudgetAnalysis;
  deliverables: DeliverableEstimate[];
}

export interface AIStatus {
  enabled: boolean;
  provider: string;
  model: string;
  cost: string;
  rate_limit: string;
}

/**
 * Make AI API call using centralized auth service
 * This ensures cookies/tokens are handled correctly and uses the configured 90s timeout for AI endpoints
 */
async function aiApiCall<T>(endpoint: string, data: unknown): Promise<T> {
  const response = await apiCall<T>(endpoint, {
    method: 'POST',
    body: JSON.stringify(data),
  });

  if (!response.success) {
    throw new Error(response.error || 'AI request failed');
  }

  return response.data as T;
}

export const aiEstimationApi = {
  /**
   * Estimate time for a template using BATCH processing
   * 
   * This sends ALL deliverables to the AI in ONE request for faster processing.
   * Expected response time: ~35 seconds for 10 deliverables (vs 170s sequential)
   * 
   * @param templateData - Template with milestones and deliverables
   * @param projectType - 'code' or 'no-code'
   * @param startDate - Project start date (YYYY-MM-DD)
   * @param endDate - Project end date (YYYY-MM-DD)
   * @param budget - Total project budget (optional)
   * @param hourlyRate - Client's hourly rate (optional)
   */
  estimateTemplate: async (
    templateData: TemplateData,
    projectType: 'code' | 'no-code',
    startDate?: string,
    endDate?: string,
    budget?: number,
    hourlyRate?: number
  ): Promise<TemplateEstimateResponse> => {
    return aiApiCall('/api/ai/estimate-template', {
      template_data: templateData,
      project_type: projectType,
      start_date: startDate,
      end_date: endDate,
      budget: budget,
      hourly_rate: hourlyRate
    });
  },

  /**
   * Estimate time for a single deliverable
   */
  estimateDeliverable: async (
    title: string,
    description?: string,
    originalHours?: number,
    projectType: 'code' | 'no-code' = 'code'
  ): Promise<DeliverableEstimate> => {
    return aiApiCall('/api/ai/estimate-deliverable', {
      title,
      description,
      original_hours: originalHours,
      project_type: projectType
    });
  },

  /**
   * Get AI service status
   */
  getStatus: async (): Promise<AIStatus> => {
    // Uses centralized apiCall which handles cookies and timeouts
    const response = await apiCall<AIStatus>('/api/ai/status', {
      method: 'GET'
    });
    
    if (!response.success) {
      throw new Error(response.error || 'Failed to get AI status');
    }
    
    return response.data as AIStatus;
  },

  /**
   * Generate a project template using AI
   * 
   * @param description - Description of the template user wants
   * @param projectType - 'code' or 'no-code'
   * @param category - Optional category hint
   */
  generateTemplate: async (
    description: string,
    projectType: 'code' | 'no-code',
    category?: string
  ): Promise<GeneratedTemplateResponse> => {
    return aiApiCall('/api/ai/generate-template', {
      description,
      project_type: projectType,
      category
    });
  }
};

// Types for template generation
export interface GeneratedTemplateResponse {
  name: string;
  description: string;
  category: string;
  template_type: string;
  template_data: {
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
  };
}

