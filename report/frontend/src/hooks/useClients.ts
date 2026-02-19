/**
 * React Query hooks for clients operations
 *
 * Architecture:
 * - useQuery: For FETCHING data (GET) - caches and manages loading states
 * - useMutation: For MODIFYING data (POST/PUT/DELETE) - handles updates without refetching everything
 *
 * This ensures:
 * - Only the specific API endpoint is called for each action
 * - No unnecessary refetches
 * - Optimized cache updates with Redis backend caching for better performance
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { clientsApi, Client, ClientCreate, ClientUpdate } from "../services/clients";
import { useAuthContext } from "../contexts/AuthContext";

// Query keys for React Query cache management
export const clientKeys = {
  all: ["clients"] as const,
  lists: () => [...clientKeys.all, "list"] as const,
  list: (filters: string) => [...clientKeys.lists(), { filters }] as const,
  details: () => [...clientKeys.all, "detail"] as const,
  detail: (id: string) => [...clientKeys.details(), id] as const,
};

/**
 * FETCH clients (GET request)
 * Uses useQuery for data fetching with automatic caching
 * Backend uses Redis cache for instant loading
 *
 * @returns Query result with clients data and loading states
 */
export function useClients() {
  const { isAuthenticated, isInitialized } = useAuthContext();

  return useQuery({
    queryKey: clientKeys.lists(),
    queryFn: clientsApi.getClients,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
    enabled: isInitialized && isAuthenticated, // Only fetch when auth is ready
  });
}

/**
 * FETCH single client (GET request)
 * Uses useQuery for data fetching with automatic caching
 *
 * @param clientId - The ID of the client to fetch
 * @returns Query result with client data
 */
export function useClient(clientId: string, enabled: boolean = true) {
  const { isAuthenticated, isInitialized } = useAuthContext();

  return useQuery({
    queryKey: clientKeys.detail(clientId),
    queryFn: () => clientsApi.getClient(clientId),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
    enabled: isInitialized && isAuthenticated && !!clientId && enabled,
  });
}

/**
 * CREATE client (POST request)
 * Uses useMutation - only calls POST endpoint
 * Invalidates cache to trigger refetch
 *
 * @returns Mutation with mutate/mutateAsync functions
 *
 * @example
 * const createClient = useCreateClient();
 * await createClient.mutateAsync({
 *   name: 'John Doe',
 *   email: 'john@example.com',
 *   ...
 * });
 */
export function useCreateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ClientCreate) => clientsApi.createClient(data),
    onSuccess: () => {
      // Invalidate to trigger refetch with new data
      queryClient.invalidateQueries({ queryKey: clientKeys.all });
    },
    onError: (error) => {
      console.error("Failed to create client:", error);
    },
  });
}

/**
 * UPDATE client (PUT request)
 * Uses useMutation - only calls PUT endpoint
 * Invalidates cache to trigger refetch
 *
 * @returns Mutation with mutate/mutateAsync functions
 *
 * @example
 * const updateClient = useUpdateClient();
 * await updateClient.mutateAsync({
 *   id: 1,
 *   data: { name: 'Jane Doe' }
 * });
 */
export function useUpdateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ClientUpdate }) =>
      clientsApi.updateClient(id, data),
    onSuccess: (_, variables) => {
      // Invalidate specific client and list
      queryClient.invalidateQueries({ queryKey: clientKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: clientKeys.lists() });
    },
    onError: (error) => {
      console.error("Failed to update client:", error);
    },
  });
}

/**
 * DELETE client (DELETE request)
 * Uses useMutation - only calls DELETE endpoint
 * Invalidates cache to trigger refetch
 *
 * @returns Mutation with mutate/mutateAsync functions
 *
 * @example
 * const deleteClient = useDeleteClient();
 * await deleteClient.mutateAsync(clientId);
 */
export function useDeleteClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (clientId: string) => clientsApi.deleteClient(clientId),
    onSuccess: () => {
      // Invalidate to trigger refetch
      queryClient.invalidateQueries({ queryKey: clientKeys.all });
    },
    onError: (error) => {
      console.error("Failed to delete client:", error);
    },
  });
}

/**
 * Complete clients bundle hook
 * Combines all client operations with loading states
 *
 * @example
 * ```tsx
 * const {
 *   clients,
 *   isLoading,
 *   createClient,
 *   updateClient,
 *   deleteClient,
 *   isCreating,
 *   isUpdating,
 *   isDeleting,
 * } = useClientsBundle();
 *
 * // Use in component
 * await createClient({ name: '...', ... });
 * await deleteClient(clientId);
 * ```
 */
export function useClientsBundle() {
  const clientsQuery = useClients();
  const createMutation = useCreateClient();
  const updateMutation = useUpdateClient();
  const deleteMutation = useDeleteClient();

  return {
    // Clients data
    clients: clientsQuery.data,
    isLoading: clientsQuery.isLoading,
    isError: clientsQuery.isError,
    error: clientsQuery.error,

    // Refetch function
    refetch: clientsQuery.refetch,

    // Create client
    createClient: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    createError: createMutation.error,

    // Update client
    updateClient: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error,

    // Delete client
    deleteClient: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
    deleteError: deleteMutation.error,

    // Combined loading state
    isAnyLoading:
      clientsQuery.isLoading ||
      createMutation.isPending ||
      updateMutation.isPending ||
      deleteMutation.isPending,
  };
}

/**
 * Prefetch clients
 * Useful for preloading before navigating to clients page
 */
export function usePrefetchClients() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.prefetchQuery({
      queryKey: clientKeys.lists(),
      queryFn: clientsApi.getClients,
    });
  };
}

// Export types for convenience
export type { Client, ClientCreate, ClientUpdate };
