import ApiService from './api';

export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  billing_period: string;
  features: string[];
  max_projects: number | null;
  max_clients: number | null;
  paystack_fee_waived: boolean;
  manual_payment_enabled: boolean;
}

export interface Subscription {
  id: number;
  user_id: number;
  plan: string;
  status: string;
  started_at: string;
  expires_at: string | null;
  cancelled_at: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  amount: number | null;
  currency: string;
  paystack_fee_waived: boolean;
  max_projects: number | null;
  max_clients: number | null;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionCreate {
  plan: string;
  payment_method: string;
  payment_reference?: string;
}

export interface SubscriptionCancel {
  reason?: string;
}

export const subscriptionsApi = {
  /**
   * Get all available subscription plans
   */
  async getPlans(): Promise<{ plans: SubscriptionPlan[] }> {
    return ApiService.get<{ plans: SubscriptionPlan[] }>('/api/subscriptions/plans');
  },

  /**
   * Get current user's subscription
   */
  async getCurrentSubscription(): Promise<Subscription> {
    return ApiService.get<Subscription>('/api/subscriptions/current');
  },

  /**
   * Subscribe to a plan
   */
  async subscribe(data: SubscriptionCreate): Promise<Subscription> {
    return ApiService.post<Subscription>('/api/subscriptions/subscribe', data);
  },

  /**
   * Cancel current subscription
   */
  async cancel(data: SubscriptionCancel): Promise<Subscription> {
    return ApiService.post<Subscription>('/api/subscriptions/cancel', data);
  },
};
