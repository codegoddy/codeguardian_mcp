/**
 * React Query hooks for invoices operations
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
import { paymentsApi, Invoice } from "../services/payments";
import { useAuthContext } from "../contexts/AuthContext";

// Query keys for React Query cache management
export const invoiceKeys = {
  all: ["invoices"] as const,
  lists: () => [...invoiceKeys.all, "list"] as const,
  list: (filters?: string) => [...invoiceKeys.lists(), { filters }] as const,
  details: () => [...invoiceKeys.all, "detail"] as const,
  detail: (id: string) => [...invoiceKeys.details(), id] as const,
};

/**
 * FETCH invoices (GET request)
 * Uses useQuery for data fetching with automatic caching
 *
 * @returns Query result with invoices data and loading states
 */
export function useInvoices() {
  const { isAuthenticated, isInitialized } = useAuthContext();

  return useQuery({
    queryKey: invoiceKeys.lists(),
    queryFn: paymentsApi.getInvoices,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
    enabled: isInitialized && isAuthenticated, // Only fetch when auth is ready
  });
}

/**
 * FETCH single invoice (GET request)
 * Uses useQuery for data fetching with automatic caching
 *
 * @param invoiceId - The ID of the invoice to fetch
 * @returns Query result with invoice data
 */
export function useInvoice(invoiceId: string) {
  const { isAuthenticated, isInitialized } = useAuthContext();

  return useQuery({
    queryKey: invoiceKeys.detail(invoiceId),
    queryFn: () => paymentsApi.getInvoice(invoiceId),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
    enabled: isInitialized && isAuthenticated && !!invoiceId,
  });
}

/**
 * SEND invoice (POST request)
 * Uses useMutation - only calls POST endpoint
 * Invalidates cache to trigger refetch
 *
 * @returns Mutation with mutate/mutateAsync functions
 *
 * @example
 * const sendInvoice = useSendInvoice();
 * await sendInvoice.mutateAsync(invoiceId);
 */
export function useSendInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (invoiceId: string) => paymentsApi.sendInvoice(invoiceId),
    onSuccess: () => {
      // Invalidate to trigger refetch with updated data
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
    },
    onError: (error) => {
      console.error("Failed to send invoice:", error);
    },
  });
}

/**
 * RESEND invoice (POST request)
 * Uses useMutation - only calls POST endpoint
 * Invalidates cache to trigger refetch
 *
 * @returns Mutation with mutate/mutateAsync functions
 *
 * @example
 * const resendInvoice = useResendInvoice();
 * await resendInvoice.mutateAsync(invoiceId);
 */
export function useResendInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (invoiceId: string) => paymentsApi.resendInvoice(invoiceId),
    onSuccess: () => {
      // Invalidate to trigger refetch with updated data
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
    },
    onError: (error) => {
      console.error("Failed to resend invoice:", error);
    },
  });
}

/**
 * VERIFY invoice payment (POST request)
 * Uses useMutation - only calls POST endpoint
 * Invalidates cache to trigger refetch
 *
 * @returns Mutation with mutate/mutateAsync functions
 *
 * @example
 * const verifyInvoice = useVerifyInvoice();
 * await verifyInvoice.mutateAsync(invoiceId);
 */
export function useVerifyInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (invoiceId: string) => paymentsApi.developerVerify(invoiceId),
    onSuccess: () => {
      // Invalidate to trigger refetch with updated data
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
    },
    onError: (error) => {
      console.error("Failed to verify invoice:", error);
    },
  });
}

/**
 * Complete invoices bundle hook
 * Combines all invoice operations with loading states
 *
 * @example
 * ```tsx
 * const {
 *   invoices,
 *   isLoading,
 *   sendInvoice,
 *   verifyInvoice,
 *   isSending,
 *   isVerifying,
 * } = useInvoicesBundle();
 *
 * // Use in component
 * await sendInvoice(invoiceId);
 * await verifyInvoice(invoiceId);
 * ```
 */
export function useInvoicesBundle() {
  const invoicesQuery = useInvoices();
  const sendMutation = useSendInvoice();
  const verifyMutation = useVerifyInvoice();

  return {
    // Invoices data
    invoices: invoicesQuery.data,
    isLoading: invoicesQuery.isLoading,
    isError: invoicesQuery.isError,
    error: invoicesQuery.error,

    // Refetch function
    refetch: invoicesQuery.refetch,

    // Send invoice
    sendInvoice: sendMutation.mutateAsync,
    isSending: sendMutation.isPending,
    sendError: sendMutation.error,

    // Verify invoice
    verifyInvoice: verifyMutation.mutateAsync,
    isVerifying: verifyMutation.isPending,
    verifyError: verifyMutation.error,

    // Combined loading state
    isAnyLoading:
      invoicesQuery.isLoading ||
      sendMutation.isPending ||
      verifyMutation.isPending,
  };
}

/**
 * Prefetch invoices
 * Useful for preloading before navigating to invoices page
 */
export function usePrefetchInvoices() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.prefetchQuery({
      queryKey: invoiceKeys.lists(),
      queryFn: paymentsApi.getInvoices,
    });
  };
}

// Export types for convenience
export type { Invoice };
