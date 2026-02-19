/**
 * Payment Methods API Service
 */

import ApiService from './api';

export interface PaymentMethod {
  id: string;
  method_type: 'paystack' | 'manual';
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
  // Paystack specific
  paystack_business_name?: string;
  paystack_settlement_bank?: string;
  paystack_account_number?: string;
  paystack_subaccount_code?: string;
  // Manual specific
  payment_gateway_name?: string;
  payment_instructions?: string;
  manual_payment_type?: string;
  // Bank Transfer
  bank_name?: string;
  account_name?: string;
  account_number?: string;
  swift_code?: string;
  branch_code?: string;
  // Mobile Money
  mobile_money_provider?: string;
  mobile_money_number?: string;
  mobile_money_name?: string;
  // PayPal
  paypal_email?: string;
  // Wise
  wise_email?: string;
  // Cryptocurrency
  crypto_wallet_address?: string;
  crypto_network?: string;
  // Other
  other_gateway_name?: string;
  additional_info?: string;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  status: string;
  subtotal: number;
  platform_fee: number;
  tax_amount: number;
  total_amount: number;
  payment_method?: string;
  payment_gateway_name?: string;
  invoice_pdf_url?: string;
  due_date?: string;
  sent_at?: string;
  payment_received_at?: string;
  client_marked_paid: boolean;
  client_marked_paid_at?: string;
  developer_verified: boolean;
  developer_verified_at?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export const paymentsApi = {
  /**
   * Get all configured payment methods (cached on backend with Redis)
   */
  getPaymentMethods: async (): Promise<PaymentMethod[]> => {
    return ApiService.get<PaymentMethod[]>('/api/payment-methods');
  },

  /**
   * Get active payment methods only
   */
  getActivePaymentMethods: async (): Promise<PaymentMethod[]> => {
    const methods = await ApiService.get<PaymentMethod[]>('/api/payment-methods');
    return methods.filter(m => m.is_active);
  },

  /**
   * Create Paystack payment method
   */
  createPaystackMethod: async (data: {
    businessName: string;
    settlementBank: string;
    accountNumber: string;
  }): Promise<{ message: string; id: number }> => {
    return ApiService.post<{ message: string; id: number }>('/api/payment-methods/paystack', {
      business_name: data.businessName,
      settlement_bank: data.settlementBank,
      account_number: data.accountNumber,
    });
  },

  /**
   * Create manual payment method
   */
  createManualMethod: async (data: {
    paymentMethod: string;
    paymentGatewayName: string;
    paymentInstructions: string;
    // Bank Transfer
    bankName?: string;
    accountName?: string;
    accountNumber?: string;
    swiftCode?: string;
    branchCode?: string;
    // Mobile Money
    mobileMoneyProvider?: string;
    mobileMoneyNumber?: string;
    mobileMoneyName?: string;
    // PayPal
    paypalEmail?: string;
    // Wise
    wiseEmail?: string;
    // Cryptocurrency
    cryptoWalletAddress?: string;
    cryptoNetwork?: string;
    // Other
    otherGatewayName?: string;
    additionalInfo?: string;
  }): Promise<{ message: string; id: number }> => {
    return ApiService.post<{ message: string; id: number }>('/api/payment-methods/manual', {
      payment_method: data.paymentMethod,
      payment_gateway_name: data.paymentGatewayName,
      payment_instructions: data.paymentInstructions,
      // Bank Transfer
      bank_name: data.bankName,
      account_name: data.accountName,
      account_number: data.accountNumber,
      swift_code: data.swiftCode,
      branch_code: data.branchCode,
      // Mobile Money
      mobile_money_provider: data.mobileMoneyProvider,
      mobile_money_number: data.mobileMoneyNumber,
      mobile_money_name: data.mobileMoneyName,
      // PayPal
      paypal_email: data.paypalEmail,
      // Wise
      wise_email: data.wiseEmail,
      // Cryptocurrency
      crypto_wallet_address: data.cryptoWalletAddress,
      crypto_network: data.cryptoNetwork,
      // Other
      other_gateway_name: data.otherGatewayName,
      additional_info: data.additionalInfo,
    });
  },

  /**
   * Update payment method
   */
  updatePaymentMethod: async (
    methodId: string,
    data: {
      paymentMethod: string;
      paymentGatewayName: string;
      paymentInstructions: string;
      bankName?: string;
      accountName?: string;
      accountNumber?: string;
      swiftCode?: string;
      branchCode?: string;
      mobileMoneyProvider?: string;
      mobileMoneyNumber?: string;
      mobileMoneyName?: string;
      paypalEmail?: string;
      wiseEmail?: string;
      cryptoWalletAddress?: string;
      cryptoNetwork?: string;
      otherGatewayName?: string;
      additionalInfo?: string;
    }
  ): Promise<{ message: string; id: string }> => {
    return ApiService.put<{ message: string; id: string }>(
      `/api/payment-methods/${methodId}`,
      {
        payment_method: data.paymentMethod,
        payment_gateway_name: data.paymentGatewayName,
        payment_instructions: data.paymentInstructions,
        bank_name: data.bankName,
        account_name: data.accountName,
        account_number: data.accountNumber,
        swift_code: data.swiftCode,
        branch_code: data.branchCode,
        mobile_money_provider: data.mobileMoneyProvider,
        mobile_money_number: data.mobileMoneyNumber,
        mobile_money_name: data.mobileMoneyName,
        paypal_email: data.paypalEmail,
        wise_email: data.wiseEmail,
        crypto_wallet_address: data.cryptoWalletAddress,
        crypto_network: data.cryptoNetwork,
        other_gateway_name: data.otherGatewayName,
        additional_info: data.additionalInfo,
      }
    );
  },

  /**
   * Delete payment method
   */
  deletePaymentMethod: async (methodId: string): Promise<{ message: string }> => {
    return ApiService.delete<{ message: string }>(`/api/payment-methods/${methodId}`);
  },

  /**
   * Get all invoices
   */
  getInvoices: async (): Promise<Invoice[]> => {
    return ApiService.get<Invoice[]>('/api/invoices');
  },

  /**
   * Get a single invoice by ID
   */
  getInvoice: async (invoiceId: string): Promise<Invoice> => {
    return ApiService.get<Invoice>(`/api/invoices/${invoiceId}`);
  },

  /**
   * Send an invoice to the client
   */
  sendInvoice: async (invoiceId: string): Promise<{ message: string }> => {
    return ApiService.post<{ message: string }>(`/api/invoices/${invoiceId}/send`, {});
  },

  /**
   * Resend an already-sent invoice to the client
   */
  resendInvoice: async (invoiceId: string): Promise<{ message: string }> => {
    return ApiService.post<{ message: string }>(`/api/invoices/${invoiceId}/resend`, {});
  },

  /**
   * Developer verifies manual payment
   */
  developerVerify: async (invoiceId: string): Promise<{ message: string }> => {
    return ApiService.post<{ message: string }>(`/api/invoices/${invoiceId}/developer-verify`, {});
  },
};

