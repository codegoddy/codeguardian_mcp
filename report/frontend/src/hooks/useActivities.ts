import { useQuery, useQueryClient } from "@tanstack/react-query";
import { activitiesApi, Activity, ActivityListResponse, GetActivitiesParams, EntityType } from "../services/activities";
import { useAuthContext } from "../contexts/AuthContext";

export const activityKeys = {
  all: ["activities"] as const,
  lists: () => [...activityKeys.all, "list"] as const,
  list: (params?: GetActivitiesParams) => [...activityKeys.lists(), params] as const,
  recent: () => [...activityKeys.all, "recent"] as const,
};

/**
 * Hook to fetch paginated activities with optional filtering.
 */
export function useActivities(params?: GetActivitiesParams, enabled: boolean = true) {
  const { isAuthenticated, isInitialized } = useAuthContext();

  return useQuery({
    queryKey: activityKeys.list(params),
    queryFn: () => activitiesApi.getActivities(params),
    staleTime: 60 * 1000, // 1 minute - activities update frequently
    retry: 2,
    enabled: enabled && isInitialized && isAuthenticated,
  });
}

/**
 * Hook to fetch recent activities for sidebar display.
 */
export function useRecentActivities(limit: number = 10) {
  const { isAuthenticated, isInitialized } = useAuthContext();

  return useQuery({
    queryKey: [...activityKeys.recent(), limit],
    queryFn: () => activitiesApi.getRecentActivities(limit),
    staleTime: 30 * 1000, // 30 seconds - sidebar needs fresh data
    retry: 2,
    enabled: isInitialized && isAuthenticated,
  });
}

/**
 * Hook to invalidate activities cache (useful after NATS events).
 */
export function useInvalidateActivities() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: activityKeys.all });
  };
}

// Re-export types for convenience
export type { Activity, ActivityListResponse, GetActivitiesParams, EntityType };
