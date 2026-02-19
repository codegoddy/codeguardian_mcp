import { authenticatedApiCall } from './auth';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// Centralized API service for all authenticated requests
export class ApiService {
  // Generic API call wrapper that handles the response format
  private static async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await authenticatedApiCall<T>(endpoint, options);

    if (!response.success) {
      throw new Error(response.error || 'API request failed');
    }

    // Handle 204 No Content responses
    if (response.data === null) {
      return null as T;
    }

    // Handle backend response format that wraps data in a 'data' field
    if (response.data && typeof response.data === 'object' && 'data' in response.data) {
      return (response.data as { data: T }).data;
    }

    return response.data as T;
  }

  // GET request
  static async get<T>(endpoint: string): Promise<T> {
    return this.makeRequest<T>(endpoint, { method: 'GET' });
  }

  // POST request
  static async post<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.makeRequest<T>(endpoint, {
      method: 'POST',
      body: data instanceof FormData ? data : (data ? JSON.stringify(data) : undefined),
    });
  }

  // PUT request
  static async put<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.makeRequest<T>(endpoint, {
      method: 'PUT',
      body: data instanceof FormData ? data : (data ? JSON.stringify(data) : undefined),
    });
  }

  // DELETE request
  static async delete<T>(endpoint: string): Promise<T> {
    return this.makeRequest<T>(endpoint, { method: 'DELETE' });
  }

  // PATCH request
  static async patch<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.makeRequest<T>(endpoint, {
      method: 'PATCH',
      body: data instanceof FormData ? data : (data ? JSON.stringify(data) : undefined),
    });
  }
}

// Export the API service as the default export
export default ApiService;
