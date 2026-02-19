import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { contractsApi } from "../services/contracts";
import { useAuthContext } from "../contexts/AuthContext";

export const contractKeys = {
  all: ["contracts"] as const,
  lists: () => [...contractKeys.all, "list"] as const,
  list: () => [...contractKeys.lists()] as const,
  details: () => [...contractKeys.all, "detail"] as const,
  detail: (id: string) => [...contractKeys.details(), id] as const,
};

export function useContracts(enabled: boolean = true) {
  const { isAuthenticated, isInitialized } = useAuthContext();

  console.log('[useContracts] isInitialized:', isInitialized, 'isAuthenticated:', isAuthenticated);

  return useQuery({
    queryKey: contractKeys.list(),
    queryFn: () => contractsApi.listContracts(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
    enabled: enabled && isInitialized && isAuthenticated,
  });
}

export function useResendContractEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (contractId: string) => 
      contractsApi.resendContractEmail(contractId),
    onSuccess: () => {
      // Invalidate contracts list to refresh data
      queryClient.invalidateQueries({ queryKey: contractKeys.all });
    },
    onError: (error) => {
      console.error("Failed to resend contract email:", error);
    },
  });
}

// Bundle hook for convenience
export function useContractsBundle() {
  const contracts = useContracts();
  const resendEmail = useResendContractEmail();

  return {
    // Queries
    contracts: contracts.data ?? [],
    isLoadingContracts: contracts.isLoading,
    isErrorContracts: contracts.isError,
    contractsError: contracts.error,
    refetchContracts: contracts.refetch,

    // Mutations
    resendContractEmail: resendEmail.mutateAsync,
    isResending: resendEmail.isPending,
  };
}

// Prefetch hook
export function usePrefetchContracts() {
  const queryClient = useQueryClient();
  const { isAuthenticated, isInitialized } = useAuthContext();

  return () => {
    if (isInitialized && isAuthenticated) {
      queryClient.prefetchQuery({
        queryKey: contractKeys.list(),
        queryFn: () => contractsApi.listContracts(),
        staleTime: 5 * 60 * 1000,
      });
    }
  };
}
