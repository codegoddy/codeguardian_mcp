import { API_BASE_URL } from '@/lib/config';

export interface ChangeRequestCreate {
  project_id: string;
  title: string;
  description: string;
  estimated_hours: number;
}

export interface ChangeRequestUpdate {
  title?: string;
  description?: string;
  estimated_hours?: number;
  status?: string;
}

export interface ChangeRequest {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: string; // 'pending', 'approved', 'rejected', 'completed', 'billed'
  estimated_hours: number;
  hourly_rate: number;
  total_cost: number;
  payment_required: boolean;
  payment_received: boolean;
  payment_transaction_id: string | null;
  revision_count: number;
  max_revisions: number;
  approved_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

const getAuthHeaders = () => {
  // SECURITY: Tokens are in HTTP-only cookies, sent automatically by browser
  // No need to manually add Authorization header
  return {
    'Content-Type': 'application/json',
  };
};

export const changeRequestsApi = {
  async getChangeRequests(projectId?: string): Promise<ChangeRequest[]> {
    const url = projectId 
      ? `${API_BASE_URL}/api/change-requests?project_id=${projectId}`
      : `${API_BASE_URL}/api/change-requests`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: getAuthHeaders(),
      credentials: 'include', // Send cookies with request
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch change requests');
    }
    
    return response.json();
  },

  getChangeRequest: async (id: string): Promise<ChangeRequest> => {
    const response = await fetch(`${API_BASE_URL}/api/change-requests/${id}`, {
      method: 'GET',
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch change request');
    }
    
    return response.json();
  },

  createChangeRequest: async (data: ChangeRequestCreate): Promise<ChangeRequest> => {
    const response = await fetch(`${API_BASE_URL}/api/change-requests`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to create change request');
    }
    
    return response.json();
  },

  updateChangeRequest: async (id: string, data: ChangeRequestUpdate): Promise<ChangeRequest> => {
    const response = await fetch(`${API_BASE_URL}/api/change-requests/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to update change request');
    }
    
    return response.json();
  },

  approveChangeRequest: async (id: string): Promise<ChangeRequest> => {
    const response = await fetch(`${API_BASE_URL}/api/change-requests/${id}/approve`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to approve change request');
    }
    
    return response.json();
  },

  rejectChangeRequest: async (id: string): Promise<ChangeRequest> => {
    const response = await fetch(`${API_BASE_URL}/api/change-requests/${id}/reject`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to reject change request');
    }
    
    return response.json();
  },

  completeChangeRequest: async (id: string): Promise<ChangeRequest> => {
    const response = await fetch(`${API_BASE_URL}/api/change-requests/${id}/complete`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to complete change request');
    }
    
    return response.json();
  },
};
