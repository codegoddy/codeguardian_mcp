/**
 * React Query hooks for time tracker integrations operations
 *
 * Architecture:
 * - useQuery: For FETCHING data (GET) - caches and manages loading states
 * - useMutation: For MODIFYING data (POST/PUT/DELETE) - handles updates without refetching everything
 *
 * This ensures:
 * - Only the specific API endpoint is called for each action
 * - No unnecessary refetches
 * - Optimized cache updates
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  integrationsApi, 
  TimeTrackerIntegration, 
  TimeTrackerIntegrationCreate,
  TimeTrackerProject 
} from "../services/integrations";
import { useAuthContext } from "../contexts/AuthContext";

// Query keys for React Query cache management
export const integrationKeys = {
  all: ["integrations"] as const,
  timeTrackers: () => [...integrationKeys.all, "time-trackers"] as const,
  timeTracker: (provider: string) => [...integrationKeys.timeTrackers(), provider] as const,
  projects: (provider: string) => [...integrationKeys.all, "projects", provider] as const,
};

/**
 * FETCH time tracker integrations (GET request)
 * Uses useQuery for data fetching with automatic caching
 *
 * @returns Query result with integrations data and loading states
 */
export function useTimeTrackerIntegrations() {
  const { isAuthenticated, isInitialized } = useAuthContext();

  return useQuery({
    queryKey: integrationKeys.timeTrackers(),
    queryFn: integrationsApi.getTimeTrackerIntegrations,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
    enabled: isInitialized && isAuthenticated, // Only fetch when auth is ready
  });
}

/**
 * FETCH time tracker projects (GET request)
 * Uses useQuery for data fetching with automatic caching
 *
 * @param provider - The time tracker provider ('toggl' or 'harvest')
 * @param enabled - Whether to enable the query (default: true)
 * @returns Query result with projects data
 */
export function useTimeTrackerProjects(provider: 'toggl' | 'harvest', enabled: boolean = true) {
  const { isAuthenticated, isInitialized } = useAuthContext();

  return useQuery({
    queryKey: integrationKeys.projects(provider),
    queryFn: () => integrationsApi.getTimeTrackerProjects(provider),
    staleTime: 2 * 60 * 1000, // 2 minutes (projects change less frequently)
    retry: 2,
    enabled: isInitialized && isAuthenticated && enabled && !!provider,
  });
}

/**
 * CREATE/UPDATE time tracker integration (POST request)
 * Uses useMutation - only calls POST endpoint
 * Invalidates cache to trigger refetch
 *
 * @returns Mutation with mutate/mutateAsync functions
 *
 * @example
 * const connectTimeTracker = useConnectTimeTracker();
 * await connectTimeTracker.mutateAsync({
 *   provider: 'toggl',
 *   api_token: 'your_token',
 * });
 */
export function useConnectTimeTracker() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: TimeTrackerIntegrationCreate) => 
      integrationsApi.createTimeTrackerIntegration(data),
    onSuccess: (data) => {
      // Invalidate to trigger refetch with new data
      queryClient.invalidateQueries({ queryKey: integrationKeys.timeTrackers() });
      // Also invalidate projects for this provider
      queryClient.invalidateQueries({ queryKey: integrationKeys.projects(data.provider) });
    },
    onError: (error) => {
      console.error("Failed to connect time tracker:", error);
    },
  });
}

/**
 * DELETE time tracker integration (DELETE request)
 * Uses useMutation - only calls DELETE endpoint
 * Invalidates cache to trigger refetch
 *
 * @returns Mutation with mutate/mutateAsync functions
 *
 * @example
 * const disconnectTimeTracker = useDisconnectTimeTracker();
 * await disconnectTimeTracker.mutateAsync('toggl');
 */
export function useDisconnectTimeTracker() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (provider: 'toggl' | 'harvest') => 
      integrationsApi.deleteTimeTrackerIntegration(provider),
    onSuccess: (_, provider) => {
      // Invalidate to trigger refetch
      queryClient.invalidateQueries({ queryKey: integrationKeys.timeTrackers() });
      // Remove projects cache for this provider
      queryClient.removeQueries({ queryKey: integrationKeys.projects(provider) });
    },
    onError: (error) => {
      console.error("Failed to disconnect time tracker:", error);
    },
  });
}

/**
 * Complete integrations bundle hook
 * Combines all integration operations with loading states
 *
 * @example
 * ```tsx
 * const {
 *   integrations,
 *   isLoading,
 *   connectTimeTracker,
 *   disconnectTimeTracker,
 *   isConnecting,
 *   isDisconnecting,
 * } = useIntegrationsBundle();
 *
 * // Use in component
 * await connectTimeTracker({ provider: 'toggl', api_token: '...' });
 * await disconnectTimeTracker('toggl');
 * ```
 */
export function useIntegrationsBundle() {
  const integrationsQuery = useTimeTrackerIntegrations();
  const connectMutation = useConnectTimeTracker();
  const disconnectMutation = useDisconnectTimeTracker();

  return {
    // Integrations data
    integrations: integrationsQuery.data,
    isLoading: integrationsQuery.isLoading,
    isError: integrationsQuery.isError,
    error: integrationsQuery.error,

    // Refetch function
    refetch: integrationsQuery.refetch,

    // Connect time tracker
    connectTimeTracker: connectMutation.mutateAsync,
    isConnecting: connectMutation.isPending,
    connectError: connectMutation.error,

    // Disconnect time tracker
    disconnectTimeTracker: disconnectMutation.mutateAsync,
    isDisconnecting: disconnectMutation.isPending,
    disconnectError: disconnectMutation.error,

    // Combined loading state
    isAnyLoading:
      integrationsQuery.isLoading ||
      connectMutation.isPending ||
      disconnectMutation.isPending,
  };
}

/**
 * Hook to check if a specific time tracker is connected
 * 
 * @param provider - The time tracker provider to check
 * @returns Boolean indicating if the provider is connected
 */
export function useIsTimeTrackerConnected(provider: 'toggl' | 'harvest') {
  const { data: integrations } = useTimeTrackerIntegrations();
  
  return integrations?.some(
    (integration) => integration.provider === provider && integration.is_active
  ) ?? false;
}

/**
 * Hook to get a specific time tracker integration
 * 
 * @param provider - The time tracker provider to get
 * @returns The integration object or undefined
 */
export function useTimeTrackerIntegration(provider: 'toggl' | 'harvest') {
  const { data: integrations } = useTimeTrackerIntegrations();
  
  return integrations?.find(
    (integration) => integration.provider === provider && integration.is_active
  );
}

/**
 * Prefetch time tracker integrations
 * Useful for preloading before navigating to integrations page
 */
export function usePrefetchIntegrations() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.prefetchQuery({
      queryKey: integrationKeys.timeTrackers(),
      queryFn: integrationsApi.getTimeTrackerIntegrations,
    });
  };
}

// Export types for convenience
export type { 
  TimeTrackerIntegration, 
  TimeTrackerIntegrationCreate,
  TimeTrackerProject 
};
