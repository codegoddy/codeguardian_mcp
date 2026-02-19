/**
 * React Query hooks for Client Portal operations
 * 
 * Architecture:
 * - useQuery: For FETCHING data (GET) - caches and manages loading states
 * - useMutation: For MODIFYING data (POST/PUT/DELETE) - handles updates without refetching
 * 
 * This ensures:
 * - Automatic caching with React Query
 * - Optimistic updates
 * - Background refetching
 * - Better loading and error state management
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { clientPortalService, ClientPortalDashboard } from '../services/clientPortal';

// Query keys for React Query cache management
export const clientPortalKeys = {
  all: ["client-portal"] as const,
  token: (token: string) => [...clientPortalKeys.all, "token", token] as const,
  dashboard: (token: string) => [...clientPortalKeys.all, "dashboard", token] as const,
  projects: () => [...clientPortalKeys.all, "projects"] as const,
  project: (token: string, projectId: string) => [...clientPortalKeys.projects(), token, projectId] as const,
};

/**
 * VALIDATE client portal token (GET request)
 * Uses useQuery for data fetching with automatic caching
 * 
 * @param token - The magic token to validate
 * @param enabled - Whether to run the query (default: true when token exists)
 * @returns Query result with validation data
 * 
 * @example
 * ```tsx
 * const { data, isLoading, error } = useValidateToken(token);
 * ```
 */
export function useValidateToken(token: string, enabled: boolean = true) {
  return useQuery({
    queryKey: clientPortalKeys.token(token),
    queryFn: async () => {
      console.log('[useValidateToken] Validating token:', token);
      
      // Check sessionStorage cache first
      const storedToken = sessionStorage.getItem('client_portal_token');
      const storedName = sessionStorage.getItem('client_portal_name');
      const storedEmail = sessionStorage.getItem('client_portal_email');
      const storedExpires = sessionStorage.getItem('client_portal_expires');

      if (storedToken === token && storedName && storedEmail && storedExpires) {
        const expiresDate = new Date(storedExpires);
        if (expiresDate > new Date()) {
          console.log('[useValidateToken] Using cached session data');
          return {
            valid: true,
            client_name: storedName,
            client_email: storedEmail,
            expires_at: storedExpires,
          };
        }
      }

      // Fetch fresh validation
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/client-portal/validate-token/${token}`
      );

      if (!response.ok) {
        throw new Error('Failed to validate access token');
      }

      const data = await response.json();
      
      if (!data.valid) {
        throw new Error('This portal access link is invalid or has expired');
      }

      // Cache in sessionStorage
      sessionStorage.setItem('client_portal_token', token);
      if (data.expires_at) {
        sessionStorage.setItem('client_portal_expires', data.expires_at);
      }
      if (data.client_name) {
        sessionStorage.setItem('client_portal_name', data.client_name);
      }
      if (data.client_email) {
        sessionStorage.setItem('client_portal_email', data.client_email);
      }

      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
    retry: 2,
    enabled: enabled && !!token,
  });
}

/**
 * FETCH client portal dashboard (GET request)
 * Uses useQuery for data fetching with automatic caching
 * 
 * @param token - The magic token for authentication
 * @param enabled - Whether to run the query (default: true when token exists)
 * @returns Query result with dashboard data
 * 
 * @example
 * ```tsx
 * const { data: dashboard, isLoading } = useClientPortalDashboard(token);
 * ```
 */
export function useClientPortalDashboard(token: string, enabled: boolean = true) {
  return useQuery({
    queryKey: clientPortalKeys.dashboard(token),
    queryFn: async () => {
      console.log('[useClientPortalDashboard] Loading dashboard');
      
      // Check cache first
      const cachedDashboard = sessionStorage.getItem('client_portal_dashboard');
      if (cachedDashboard) {
        try {
          const dashboardData = JSON.parse(cachedDashboard);
          console.log('[useClientPortalDashboard] Using cached dashboard');
          return dashboardData as ClientPortalDashboard;
        } catch (err) {
          console.error('[useClientPortalDashboard] Cache parse error:', err);
        }
      }

      // Fetch fresh data
      const response = await clientPortalService.getDashboard(token);
      
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to load dashboard');
      }

      // Cache the data
      if (response.data.currency) {
        sessionStorage.setItem('client_portal_currency', response.data.currency);
      }
      if (response.data.client_name) {
        sessionStorage.setItem('client_portal_name', response.data.client_name);
      }
      if (response.data.client_email) {
        sessionStorage.setItem('client_portal_email', response.data.client_email);
      }
      sessionStorage.setItem('client_portal_dashboard', JSON.stringify(response.data));

      return response.data;
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 2,
    enabled: enabled && !!token,
  });
}

/**
 * FETCH client portal project details (GET request)
 * Uses useQuery for data fetching with automatic caching
 * 
 * @param token - The magic token for authentication
 * @param projectId - The project ID to fetch
 * @param enabled - Whether to run the query
 * @returns Query result with project data
 * 
 * @example
 * ```tsx
 * const { data: project, isLoading } = useClientPortalProject(token, projectId);
 * ```
 */
export function useClientPortalProject(
  token: string, 
  projectId: string,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: clientPortalKeys.project(token, projectId),
    queryFn: async () => {
      console.log('[useClientPortalProject] Loading project:', projectId);
      
      const response = await clientPortalService.getProject(token, projectId);
      
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to load project');
      }

      return response.data;
    },
    staleTime: 3 * 60 * 1000, // 3 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 2,
    enabled: enabled && !!token && !!projectId,
  });
}

/**
 * LOGOUT from client portal (POST request)
 * Uses useMutation for API call
 * Clears React Query cache and sessionStorage on success
 * 
 * @returns Mutation with mutate/mutateAsync functions
 * 
 * @example
 * ```tsx
 * const logout = useClientPortalLogout();
 * await logout.mutateAsync(token);
 * ```
 */
export function useClientPortalLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (token: string) => {
      const response = await clientPortalService.logout(token);
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to logout');
      }

      return response.data;
    },
    onSuccess: () => {
      // Clear all client portal cache
      queryClient.invalidateQueries({ queryKey: clientPortalKeys.all });
      
      // Clear sessionStorage
      sessionStorage.removeItem('client_portal_token');
      sessionStorage.removeItem('client_portal_name');
      sessionStorage.removeItem('client_portal_email');
      sessionStorage.removeItem('client_portal_expires');
      sessionStorage.removeItem('client_portal_dashboard');
      sessionStorage.removeItem('client_portal_currency');
      
      console.log('[useClientPortalLogout] Logged out and cleared cache');
    },
    onError: (error) => {
      console.error('[useClientPortalLogout] Logout failed:', error);
    },
  });
}

/**
 * Complete client portal bundle hook for dashboard page
 * Combines validation and dashboard loading with loading states
 * 
 * @param token - The magic token
 * @returns Combined state and functions
 * 
 * @example
 * ```tsx
 * const {
 *   isValid,
 *   dashboard,
 *   isLoading,
 *   error,
 *   logout,
 * } = useClientPortalBundle(token);
 * ```
 */
export function useClientPortalBundle(token: string) {
  const validationQuery = useValidateToken(token);
  const dashboardQuery = useClientPortalDashboard(
    token,
    validationQuery.isSuccess && validationQuery.data?.valid
  );
  const logoutMutation = useClientPortalLogout();

  return {
    // Validation data
    isValid: validationQuery.data?.valid || false,
    clientData: validationQuery.data,
    isValidating: validationQuery.isLoading,
    validationError: validationQuery.error,

    // Dashboard data
    dashboard: dashboardQuery.data,
    isLoadingDashboard: dashboardQuery.isLoading,
    dashboardError: dashboardQuery.error,

    // Combined loading state
    isLoading: validationQuery.isLoading || dashboardQuery.isLoading,
    
    // Combined error
    error: validationQuery.error || dashboardQuery.error,

    // Refetch functions
    refetchValidation: validationQuery.refetch,
    refetchDashboard: dashboardQuery.refetch,

    // Logout
    logout: logoutMutation.mutateAsync,
    isLoggingOut: logoutMutation.isPending,
  };
}

/**
 * Client portal project page bundle
 * Gets session data from sessionStorage and loads project
 * 
 * @param token - The magic token
 * @param projectId - The project ID
 * @returns Project data and session info
 * 
 * @example
 * ```tsx
 * const {
 *   project,
 *   isLoading,
 *   clientName,
 *   currency,
 * } = useClientPortalProjectBundle(token, projectId);
 * ```
 */
export function useClientPortalProjectBundle(token: string, projectId: string) {
  const projectQuery = useClientPortalProject(token, projectId);

  // Get session data from storage
  const currency = sessionStorage.getItem('client_portal_currency') || 'USD';
  const clientName = sessionStorage.getItem('client_portal_name') || 'Client';
  const clientEmail = sessionStorage.getItem('client_portal_email') || '';
  const sessionExpires = sessionStorage.getItem('client_portal_expires');

  return {
    // Project data
    project: projectQuery.data,
    isLoading: projectQuery.isLoading,
    error: projectQuery.error,

    // Session data
    clientName,
    clientEmail,
    currency,
    sessionExpires,

    // Refetch function
    refetch: projectQuery.refetch,
  };
}

/**
 * Prefetch client portal dashboard
 * Useful for preloading before navigating
 * 
 * @example
 * ```tsx
 * const prefetch = usePrefetchClientPortalDashboard();
 * await prefetch(token);
 * ```
 */
export function usePrefetchClientPortalDashboard() {
  const queryClient = useQueryClient();

  return async (token: string) => {
    await queryClient.prefetchQuery({
      queryKey: clientPortalKeys.dashboard(token),
      queryFn: async () => {
        const response = await clientPortalService.getDashboard(token);
        if (!response.success || !response.data) {
          throw new Error(response.error || 'Failed to prefetch dashboard');
        }
        return response.data;
      },
    });
  };
}
