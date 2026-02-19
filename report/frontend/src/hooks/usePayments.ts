/**
 * React Query hooks for payment methods operations
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
import { paymentsApi, PaymentMethod } from "../services/payments";
import { useAuthContext } from "../contexts/AuthContext";
import { usePaymentsBundle } from "./usePaymentsBundle";

// Query keys for React Query cache management
export const paymentKeys = {
  all: ["payments"] as const,
  methods: () => [...paymentKeys.all, "methods"] as const,
  activeMethod: () => [...paymentKeys.all, "active"] as const,
  bundle: () => [...paymentKeys.all, "bundle"] as const,
};

/**
 * FETCH payment methods (GET request)
 * Uses useQuery for data fetching with automatic caching
 * Backend uses Redis cache for instant loading
 *
 * @returns Query result with payment methods data and loading states
 */
export function usePaymentMethods() {
  const { isAuthenticated, isInitialized } = useAuthContext();

  return useQuery({
    queryKey: paymentKeys.methods(),
    queryFn: paymentsApi.getPaymentMethods,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
    enabled: isInitialized && isAuthenticated, // Only fetch when auth is ready
  });
}

/**
 * FETCH active payment methods only (GET request)
 * Filtered version of payment methods
 *
 * @returns Query result with active payment methods
 */
export function useActivePaymentMethods() {
  const { isAuthenticated, isInitialized } = useAuthContext();

  return useQuery({
    queryKey: paymentKeys.activeMethod(),
    queryFn: paymentsApi.getActivePaymentMethods,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
    enabled: isInitialized && isAuthenticated,
  });
}

/**
 * CREATE Paystack payment method (POST request)
 * Uses useMutation - only calls POST endpoint
 * Invalidates cache to trigger refetch
 */
export function useCreatePaystackMethod() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      businessName: string;
      settlementBank: string;
      accountNumber: string;
    }) => paymentsApi.createPaystackMethod(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: paymentKeys.all });
    },
    onError: (error) => {
      console.error("Failed to create Paystack method:", error);
    },
  });
}

/**
 * CREATE manual payment method (POST request)
 */
export function useCreateManualMethod() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
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
    }) => paymentsApi.createManualMethod(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: paymentKeys.all });
    },
    onError: (error) => {
      console.error("Failed to create manual payment method:", error);
    },
  });
}

/**
 * UPDATE payment method (PUT request)
 */
export function useUpdatePaymentMethod() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      methodId: string;
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
      };
    }) => paymentsApi.updatePaymentMethod(params.methodId, params.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: paymentKeys.all });
    },
    onError: (error) => {
      console.error("Failed to update payment method:", error);
    },
  });
}

/**
 * DELETE payment method (DELETE request)
 */
export function useDeletePaymentMethod() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (methodId: string) => paymentsApi.deletePaymentMethod(methodId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: paymentKeys.all });
    },
    onError: (error) => {
      console.error("Failed to delete payment method:", error);
    },
  });
}

/**
 * Complete payments bundle hook with mutations
 * Combines bundle data fetching with mutation actions
 */
export function usePaymentsBundleWithActions() {
  const bundleQuery = usePaymentsBundle();
  const createPaystackMutation = useCreatePaystackMethod();
  const createManualMutation = useCreateManualMethod();
  const deleteMutation = useDeletePaymentMethod();

  return {
    payment_methods: bundleQuery.data?.payment_methods || [],
    active_methods: bundleQuery.data?.active_methods || [],
    recent_invoices: bundleQuery.data?.recent_invoices || [],
    invoices_summary: bundleQuery.data?.invoices_summary || {
      total_invoiced: 0,
      total_paid: 0,
      total_unpaid: 0,
      pending_count: 0,
      paid_count: 0,
      overdue_count: 0,
    },
    isLoading: bundleQuery.isLoading,
    isError: bundleQuery.isError,
    error: bundleQuery.error,
    refetch: bundleQuery.refetch,
    createPaystack: createPaystackMutation.mutateAsync,
    isCreatingPaystack: createPaystackMutation.isPending,
    createManual: createManualMutation.mutateAsync,
    isCreatingManual: createManualMutation.isPending,
    deleteMethod: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  };
}

/**
 * Prefetch payment methods
 */
export function usePrefetchPaymentMethods() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.prefetchQuery({
      queryKey: paymentKeys.methods(),
      queryFn: paymentsApi.getPaymentMethods,
    });
  };
}

// Export types for convenience
export type { PaymentMethod };
