/** @format */

// API service for client portal operations

import { API_BASE_URL } from '../lib/config';
import { DeliverableActivity } from './deliverables';

export interface ClientPortalAccessRequest {
  email: string;
}

export interface ClientPortalAccessResponse {
  message: string;
  success: boolean;
}

export interface ClientPortalTokenValidation {
  valid: boolean;
  client_id?: string;
  client_name?: string;
  client_email?: string;
  session_id?: string;
  expires_at?: string;
}

export interface ClientPortalLogoutResponse {
  message: string;
  success: boolean;
}

export interface ClientPortalApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  description?: string;
  status: string;
  project_budget: number;
  current_budget_remaining: number;
  budget_percentage_remaining: number;
  total_deliverables: number;
  completed_deliverables: number;
  pending_change_requests: number;
  pending_invoices: number;
  created_at?: string;
}

export interface ClientPortalDashboard {
  client_name: string;
  client_email: string;
  currency: string;
  projects: ProjectSummary[];
}

export interface Milestone {
  id: string;
  name: string;
  description?: string;
  order: number;
}

export interface Deliverable {
  id: string;
  title: string;
  description?: string;
  status: string;
  task_reference?: string;
  preview_url?: string;
  estimated_hours?: number;
  actual_hours: number;
  total_cost: number;
  milestone_id?: string;
  created_at?: string;
  verified_at?: string;
}

export interface ChangeRequest {
  id: string;
  title: string;
  description: string;
  status: string;
  estimated_hours: number;
  hourly_rate: number;
  total_cost: number;
  payment_required: boolean;
  payment_received: boolean;
  created_at?: string;
  approved_at?: string;
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
  developer_verified: boolean;
  created_at?: string;
}

export interface ClientPortalProject {
  id: string;
  name: string;
  description?: string;
  status: string;
  project_budget: number;
  current_budget_remaining: number;
  budget_percentage_remaining: number;
  total_hours_tracked: number;
  contract_signed: boolean;
  contract_pdf_url?: string;
  created_at?: string;
  milestones: Milestone[];
  deliverables: Deliverable[];
  change_requests: ChangeRequest[];
  invoices: Invoice[];
}

// Helper function to make API calls with timeout and retry logic
async function apiCall<T>(
  endpoint: string,
  options: RequestInit = {},
  retries: number = 1
): Promise<ClientPortalApiResponse<T>> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      signal: controller.signal,
      ...options,
    });

    clearTimeout(timeoutId);

    let data;
    try {
      data = await response.json();
    } catch {
      // Handle cases where response isn't JSON
      data = { detail: "Invalid response format" };
    }

    if (!response.ok) {
      const errorMessage =
        data.detail || data.message || `HTTP ${response.status}`;

      // Retry on network/server errors (not on client errors like 400)
      if (retries > 0 && response.status >= 500) {
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second before retry
        return apiCall(endpoint, options, retries - 1);
      }

      return {
        success: false,
        error: errorMessage,
      };
    }

    return {
      success: true,
      data,
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        return {
          success: false,
          error: "Request timeout",
        };
      }

      // Retry on network errors
      if (
        retries > 0 &&
        (error.message.includes("fetch") || error.message.includes("network"))
      ) {
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second before retry
        return apiCall(endpoint, options, retries - 1);
      }

      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: false,
      error: "Unknown error occurred",
    };
  }
}

// Client Portal API functions
export const clientPortalService = {
  // Request magic link for client portal access
  requestAccess: async (
    email: string
  ): Promise<ClientPortalApiResponse<ClientPortalAccessResponse>> => {
    return apiCall<ClientPortalAccessResponse>(
      "/api/client-portal/request-access",
      {
        method: "POST",
        body: JSON.stringify({ email }),
      }
    );
  },

  // Validate magic token
  validateToken: async (
    magicToken: string
  ): Promise<ClientPortalApiResponse<ClientPortalTokenValidation>> => {
    return apiCall<ClientPortalTokenValidation>(
      `/api/client-portal/validate-token/${magicToken}`
    );
  },

  // Get dashboard data
  getDashboard: async (
    magicToken: string
  ): Promise<ClientPortalApiResponse<ClientPortalDashboard>> => {
    return apiCall<ClientPortalDashboard>("/api/client-portal/dashboard", {
      method: "GET",
      headers: {
        "X-Client-Token": magicToken,
      },
    });
  },

  // Get project details
  getProject: async (
    magicToken: string,
    projectId: string
  ): Promise<ClientPortalApiResponse<ClientPortalProject>> => {
    return apiCall<ClientPortalProject>(
      `/api/client-portal/projects/${projectId}`,
      {
        method: "GET",
        headers: {
          "X-Client-Token": magicToken,
        },
      }
    );
  },

  // Logout from client portal
  logout: async (
    magicToken: string
  ): Promise<ClientPortalApiResponse<ClientPortalLogoutResponse>> => {
    return apiCall<ClientPortalLogoutResponse>("/api/client-portal/logout", {
      method: "POST",
      headers: {
        "X-Client-Token": magicToken,
      },
    });
  },

  // Get deliverable activity
  getDeliverableActivity: async (
    magicToken: string,
    deliverableId: string
  ): Promise<ClientPortalApiResponse<DeliverableActivity>> => {
    return apiCall<DeliverableActivity>(
      `/api/client-portal/deliverables/${deliverableId}/activity`,
      {
        method: "GET",
        headers: {
          "X-Client-Token": magicToken,
        },
      }
    );
  },

  // Get all invoices for client
  getInvoices: async (
    magicToken: string
  ): Promise<ClientPortalApiResponse<{ invoices: ClientPortalInvoice[]; currency: string }>> => {
    return apiCall<{ invoices: ClientPortalInvoice[]; currency: string }>(
      "/api/client-portal/invoices",
      {
        method: "GET",
        headers: {
          "X-Client-Token": magicToken,
        },
      }
    );
  },

  // Get single invoice with payment details
  getInvoiceDetail: async (
    magicToken: string,
    invoiceId: string
  ): Promise<ClientPortalApiResponse<ClientPortalInvoiceDetail>> => {
    return apiCall<ClientPortalInvoiceDetail>(
      `/api/client-portal/invoices/${invoiceId}`,
      {
        method: "GET",
        headers: {
          "X-Client-Token": magicToken,
        },
      }
    );
  },

  // Mark invoice as paid (for manual payments)
  markInvoicePaid: async (
    magicToken: string,
    invoiceId: string
  ): Promise<ClientPortalApiResponse<{ success: boolean; message: string }>> => {
    return apiCall<{ success: boolean; message: string }>(
      `/api/client-portal/invoices/${invoiceId}/mark-paid`,
      {
        method: "POST",
        headers: {
          "X-Client-Token": magicToken,
        },
      }
    );
  },
};

// Types for invoices
export interface ClientPortalInvoice {
  id: string;
  invoice_number: string;
  project_id: string;
  project_name: string;
  status: string;
  subtotal: number;
  platform_fee: number;
  tax_amount: number;
  total_amount: number;
  payment_method?: string;
  invoice_pdf_url?: string;
  due_date?: string;
  sent_at?: string;
  client_marked_paid: boolean;
  developer_verified: boolean;
  created_at?: string;
}

export interface PaymentDetails {
  manual_payment_type?: string;
  // Mobile Money
  mobile_money_provider?: string;
  mobile_money_number?: string;
  mobile_money_name?: string;
  // Bank Transfer
  bank_name?: string;
  account_name?: string;
  account_number?: string;
  swift_code?: string;
  branch_code?: string;
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

export interface ClientPortalInvoiceDetail extends ClientPortalInvoice {
  payment_gateway_name?: string;
  payment_instructions?: string;
  payment_details?: PaymentDetails;
  notes?: string;
  currency: string;
}
