import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { timeEntriesApi } from '@/services/timeEntries';
import type {
  PendingTimeEntry,
  ApproveTimeEntryRequest,
  RejectTimeEntryRequest,
  TimeEntryResponse,
  DeliverableTimeStats,
  ProjectTimeEntries,
} from '@/services/timeEntries';

/**
 * Hook to fetch pending time entries
 * Note: Polling removed to reduce Redis usage. Use NATS events or manual refetch for updates.
 */
export const usePendingTimeEntries = () => {
  return useQuery<PendingTimeEntry[], Error>({
    queryKey: ['pending-time-entries'],
    queryFn: () => timeEntriesApi.getPending(),
    // Removed aggressive 30s polling - was causing 60K+ Redis ops per user per 3 weeks
    // Use NATS real-time events or manual refetch instead
  });
};

/**
 * Hook to approve a time entry
 */
export const useApproveTimeEntry = () => {
  const queryClient = useQueryClient();

  return useMutation<TimeEntryResponse, Error, ApproveTimeEntryRequest>({
    mutationFn: (data) => timeEntriesApi.approve(data),
    onSuccess: () => {
      // Invalidate pending time entries to refresh the list
      queryClient.invalidateQueries({ queryKey: ['pending-time-entries'] });
      queryClient.invalidateQueries({ queryKey: ['deliverable-time-stats'] });
      queryClient.invalidateQueries({ queryKey: ['project-time-entries'] });
    },
  });
};

/**
 * Hook to reject a time entry
 */
export const useRejectTimeEntry = () => {
  const queryClient = useQueryClient();

  return useMutation<TimeEntryResponse, Error, RejectTimeEntryRequest>({
    mutationFn: (data) => timeEntriesApi.reject(data),
    onSuccess: () => {
      // Invalidate pending time entries to refresh the list
      queryClient.invalidateQueries({ queryKey: ['pending-time-entries'] });
    },
  });
};

/**
 * Hook to fetch time entries for a deliverable
 */
export const useDeliverableTimeStats = (deliverableId: string, enabled: boolean = true) => {
  return useQuery<DeliverableTimeStats, Error>({
    queryKey: ['deliverable-time-stats', deliverableId],
    queryFn: () => timeEntriesApi.getByDeliverable(deliverableId),
    enabled,
  });
};

/**
 * Hook to fetch time entries for a project
 */
export const useProjectTimeEntries = (projectId: string, enabled: boolean = true) => {
  return useQuery<ProjectTimeEntries, Error>({
    queryKey: ['project-time-entries', projectId],
    queryFn: () => timeEntriesApi.getByProject(projectId),
    enabled,
  });
};
