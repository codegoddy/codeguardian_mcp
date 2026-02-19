/**
 * Payment Milestones Service
 * Handles payment schedule and budget health API calls
 */

import ApiService from './api';

export interface PaymentMilestone {
  id: string;
  project_id: string;
  name: string;
  percentage: number;
  amount: number;
  trigger_type: 'contract_signed' | 'percentage_complete' | 'milestone_complete' | 'date' | 'manual';
  trigger_value: string | null;
  status: 'pending' | 'triggered' | 'invoiced' | 'awaiting_confirmation' | 'paid';
  invoice_id: string | null;
  triggered_at: string | null;
  invoiced_at: string | null;
  paid_at: string | null;
  order: number;
  created_at: string;
  updated_at: string;
}

export interface PaymentSchedule {
  project_id: string;
  status: 'not_configured' | 'configured' | 'active';
  total_budget: number;
  milestones: PaymentMilestone[];
  total_paid: number;
  total_pending: number;
  next_payment: PaymentMilestone | null;
}

export interface PaymentMilestoneCreate {
  name: string;
  percentage: number;
  trigger_type: 'contract_signed' | 'percentage_complete' | 'milestone_complete' | 'date' | 'manual';
  trigger_value?: string;
  order?: number;
}

export interface BudgetHealth {
  status: 'healthy' | 'at_risk' | 'over_budget' | 'unknown';
  actual_hours: number;
  remaining_estimated: number;
  projected_total: number;
  budget_hours: number;
  progress_percent: number;
  budget_used_percent: number;
  overage_hours: number | null;
  overage_cost: number | null;
  message?: string;
}

// Get payment schedule for a project
export const getPaymentSchedule = async (projectId: string): Promise<PaymentSchedule> => {
  return await ApiService.get(`/api/projects/${projectId}/payment-schedule`);
};

// Setup payment schedule (manual or from parsed terms)
export const setupPaymentSchedule = async (
  projectId: string,
  milestones: PaymentMilestoneCreate[]
): Promise<{ message: string; milestones_count: number; total_budget: number }> => {
  return await ApiService.post(`/api/projects/${projectId}/payment-schedule/setup`, {
    milestones
  });
};

// Trigger a payment milestone
export const triggerMilestone = async (
  projectId: string,
  milestoneId: string
): Promise<{ message: string; milestone_id: string }> => {
  return await ApiService.post(
    `/api/projects/${projectId}/payment-milestones/${milestoneId}/trigger`
  );
};

// Mark milestone as paid (developer confirmation)
export const markMilestonePaid = async (
  projectId: string,
  milestoneId: string
): Promise<{ message: string; milestone_id: string }> => {
  return await ApiService.post(
    `/api/projects/${projectId}/payment-milestones/${milestoneId}/mark-paid`
  );
};

// Delete payment schedule
export const deletePaymentSchedule = async (
  projectId: string
): Promise<{ message: string }> => {
  return await ApiService.delete(`/api/projects/${projectId}/payment-schedule`);
};

// Get budget health for a project
export const getBudgetHealth = async (projectId: string): Promise<BudgetHealth> => {
  return await ApiService.get(`/api/projects/${projectId}/budget-health`);
};

// Parse contract for payment terms (future feature)
export const parsePaymentTerms = async (
  projectId: string
): Promise<{ found: boolean; terms: PaymentMilestoneCreate[]; raw_text?: string }> => {
  return await ApiService.post(`/api/projects/${projectId}/payment-schedule/parse`);
};

// Common payment schedule presets
export const PAYMENT_PRESETS = {
  '30-40-30': [
    { name: 'Upfront Deposit', percentage: 30, trigger_type: 'contract_signed' as const, order: 0 },
    { name: 'Midpoint Payment', percentage: 40, trigger_type: 'percentage_complete' as const, trigger_value: '50', order: 1 },
    { name: 'Final Payment', percentage: 30, trigger_type: 'percentage_complete' as const, trigger_value: '100', order: 2 }
  ],
  '50-50': [
    { name: 'Upfront Deposit', percentage: 50, trigger_type: 'contract_signed' as const, order: 0 },
    { name: 'Completion Payment', percentage: 50, trigger_type: 'percentage_complete' as const, trigger_value: '100', order: 1 }
  ],
  '100-upfront': [
    { name: 'Full Payment', percentage: 100, trigger_type: 'contract_signed' as const, order: 0 }
  ],
  '100-completion': [
    { name: 'Payment on Completion', percentage: 100, trigger_type: 'percentage_complete' as const, trigger_value: '100', order: 0 }
  ]
};
