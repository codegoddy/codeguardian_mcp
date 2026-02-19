import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  changeRequestsApi,
  ChangeRequest,
  ChangeRequestCreate,
  ChangeRequestUpdate,
} from "../services/changeRequests";
import { useAuthContext } from "../contexts/AuthContext";

export const changeRequestKeys = {
  all: ["changeRequests"] as const,
  lists: () => [...changeRequestKeys.all, "list"] as const,
  list: (projectId?: string) => [...changeRequestKeys.lists(), { projectId }] as const,
  details: () => [...changeRequestKeys.all, "detail"] as const,
  detail: (id: string) => [...changeRequestKeys.details(), id] as const,
};

export function useChangeRequests(projectId?: string) {
  const { isAuthenticated, isInitialized } = useAuthContext();

  return useQuery({
    queryKey: changeRequestKeys.list(projectId),
    queryFn: () => changeRequestsApi.getChangeRequests(projectId),
    staleTime: 5 * 60 * 1000,
    retry: 2,
    enabled: isInitialized && isAuthenticated,
  });
}

export function useChangeRequest(id: string) {
  const { isAuthenticated, isInitialized } = useAuthContext();

  return useQuery({
    queryKey: changeRequestKeys.detail(id),
    queryFn: () => changeRequestsApi.getChangeRequest(id),
    staleTime: 5 * 60 * 1000,
    retry: 2,
    enabled: isInitialized && isAuthenticated && !!id,
  });
}

export function useCreateChangeRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ChangeRequestCreate) =>
      changeRequestsApi.createChangeRequest(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: changeRequestKeys.all });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (error) => {
      console.error("Failed to create change request:", error);
    },
  });
}

export function useUpdateChangeRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ChangeRequestUpdate }) =>
      changeRequestsApi.updateChangeRequest(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: changeRequestKeys.all });
    },
    onError: (error) => {
      console.error("Failed to update change request:", error);
    },
  });
}

export function useApproveChangeRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => changeRequestsApi.approveChangeRequest(id),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: changeRequestKeys.detail(variables) });
      queryClient.invalidateQueries({ queryKey: changeRequestKeys.all });
    },
    onError: (error) => {
      console.error("Failed to approve change request:", error);
    },
  });
}

export function useRejectChangeRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => changeRequestsApi.rejectChangeRequest(id),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: changeRequestKeys.detail(variables) });
      queryClient.invalidateQueries({ queryKey: changeRequestKeys.all });
    },
    onError: (error) => {
      console.error("Failed to reject change request:", error);
    },
  });
}

export function useCompleteChangeRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => changeRequestsApi.completeChangeRequest(id),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: changeRequestKeys.detail(variables) });
      queryClient.invalidateQueries({ queryKey: changeRequestKeys.all });
    },
    onError: (error) => {
      console.error("Failed to complete change request:", error);
    },
  });
}

export function useChangeRequestsBundle(projectId?: string) {
  const changeRequestsQuery = useChangeRequests(projectId);
  const createMutation = useCreateChangeRequest();
  const updateMutation = useUpdateChangeRequest();
  const approveMutation = useApproveChangeRequest();
  const rejectMutation = useRejectChangeRequest();
  const completeMutation = useCompleteChangeRequest();

  return {
    changeRequests: changeRequestsQuery.data,
    isLoading: changeRequestsQuery.isLoading,
    isError: changeRequestsQuery.isError,
    error: changeRequestsQuery.error,
    refetch: changeRequestsQuery.refetch,
    createChangeRequest: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    createError: createMutation.error,
    updateChangeRequest: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error,
    approveChangeRequest: approveMutation.mutateAsync,
    isApproving: approveMutation.isPending,
    approveError: approveMutation.error,
    rejectChangeRequest: rejectMutation.mutateAsync,
    isRejecting: rejectMutation.isPending,
    rejectError: rejectMutation.error,
    completeChangeRequest: completeMutation.mutateAsync,
    isCompleting: completeMutation.isPending,
    completeError: completeMutation.error,
    isAnyLoading:
      changeRequestsQuery.isLoading ||
      createMutation.isPending ||
      updateMutation.isPending ||
      approveMutation.isPending ||
      rejectMutation.isPending ||
      completeMutation.isPending,
  };
}

export function usePrefetchChangeRequests() {
  const queryClient = useQueryClient();

  return (projectId?: string) => {
    queryClient.prefetchQuery({
      queryKey: changeRequestKeys.list(projectId),
      queryFn: () => changeRequestsApi.getChangeRequests(projectId),
      staleTime: 5 * 60 * 1000,
    });
  };
}

export type { ChangeRequest, ChangeRequestCreate, ChangeRequestUpdate };
