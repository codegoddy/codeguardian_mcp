import ApiService from './api';

export interface Client {
  id: string;
  user_id: string;
  name: string;
  email: string;
  company?: string;
  default_hourly_rate: number;
  change_request_rate: number;
  payment_method: 'paystack' | 'manual';
  payment_gateway_name?: string;
  payment_instructions?: string;
  paystack_subaccount_code?: string;
  paystack_customer_code?: string;
  portal_access_token?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClientCreate {
  name: string;
  email: string;
  company?: string;
  default_hourly_rate: number;
  change_request_rate: number;
  payment_method: 'paystack' | 'manual';
  payment_gateway_name?: string;
  payment_instructions?: string;
  paystack_subaccount_code?: string;
  paystack_customer_code?: string;
}

export interface ClientUpdate {
  name?: string;
  email?: string;
  company?: string;
  default_hourly_rate?: number;
  change_request_rate?: number;
  payment_method?: 'paystack' | 'manual';
  payment_gateway_name?: string;
  payment_instructions?: string;
  paystack_subaccount_code?: string;
  paystack_customer_code?: string;
  is_active?: boolean;
}

export const clientsApi = {
  getClients: (): Promise<Client[]> =>
    ApiService.get<Client[]>('/api/clients'),

  getClient: (id: string): Promise<Client> =>
    ApiService.get<Client>(`/api/clients/${id}`),

  createClient: (data: ClientCreate): Promise<Client> =>
    ApiService.post<Client>('/api/clients', data),

  updateClient: (id: string, data: ClientUpdate): Promise<Client> =>
    ApiService.put<Client>(`/api/clients/${id}`, data),

  deleteClient: (id: string): Promise<null> =>
    ApiService.delete<null>(`/api/clients/${id}`),
};
