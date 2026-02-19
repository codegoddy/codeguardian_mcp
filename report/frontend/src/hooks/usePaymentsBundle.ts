import { useQuery } from '@tanstack/react-query';
import { authenticatedApiCall } from '../services/auth';

export interface PaymentMethodResponse {
  id: string;
  method_type: string;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
  paystack_business_name?: string;
  paystack_settlement_bank?: string;
  paystack_account_number?: string;
  payment_gateway_name?: string;
  payment_instructions?: string;
  [key: string]: unknown;
}

export interface PaymentsBundle {
  payment_methods: PaymentMethodResponse[];
  active_methods: PaymentMethodResponse[];
  recent_invoices: Array<{
    id: string;
    invoice_number: string;
    client_name: string;
    total_amount: number;
    status: string;
    due_date: string | null;
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
}

export function usePaymentsBundle() {
  return useQuery<PaymentsBundle, Error>({
    queryKey: ['payments-bundle'],
    queryFn: async () => {
      const response = await authenticatedApiCall<PaymentsBundle>('/api/payments/bundle', {
        method: 'GET',
      });

      if (!response.success || !response.data) {
        throw new Error('Failed to fetch payments bundle');
      }

      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
