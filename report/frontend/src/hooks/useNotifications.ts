import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  notificationsApi, 
  Notification, 
  NotificationListResponse, 
  UnreadCountResponse,
  GetNotificationsParams,
  NotificationType 
} from "../services/notifications";
import { useAuthContext } from "../contexts/AuthContext";

export const notificationKeys = {
  all: ["notifications"] as const,
  lists: () => [...notificationKeys.all, "list"] as const,
  list: (params?: GetNotificationsParams) => [...notificationKeys.lists(), params] as const,
  unread: () => [...notificationKeys.all, "unread"] as const,
};

/**
 * Hook to fetch paginated notifications with optional filtering.
 */
export function useNotifications(params?: GetNotificationsParams, enabled: boolean = true) {
  const { isAuthenticated, isInitialized } = useAuthContext();

  return useQuery({
    queryKey: notificationKeys.list(params),
    queryFn: () => notificationsApi.getNotifications(params),
    staleTime: 30 * 1000, // 30 seconds - notifications need fresh data
    retry: 2,
    enabled: enabled && isInitialized && isAuthenticated,
  });
}

/**
 * Hook to fetch unread notification count.
 */
export function useUnreadCount() {
  const { isAuthenticated, isInitialized } = useAuthContext();

  return useQuery({
    queryKey: notificationKeys.unread(),
    queryFn: () => notificationsApi.getUnreadCount(),
    staleTime: 30 * 1000, // 30 seconds
    retry: 2,
    enabled: isInitialized && isAuthenticated,
  });
}

/**
 * Hook to mark a notification as read.
 */
export function useMarkAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) => notificationsApi.markAsRead(notificationId),
    onSuccess: () => {
      // Invalidate both notifications list and unread count
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
    onError: (error) => {
      console.error("Failed to mark notification as read:", error);
    },
  });
}

/**
 * Hook to mark all notifications as read.
 */
export function useMarkAllAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => notificationsApi.markAllAsRead(),
    onSuccess: () => {
      // Invalidate both notifications list and unread count
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
    onError: (error) => {
      console.error("Failed to mark all notifications as read:", error);
    },
  });
}

/**
 * Hook to delete a notification.
 */
export function useDeleteNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) => notificationsApi.deleteNotification(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
    onError: (error) => {
      console.error("Failed to delete notification:", error);
    },
  });
}

/**
 * Hook to invalidate notifications cache (useful after NATS events).
 */
export function useInvalidateNotifications() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: notificationKeys.all });
  };
}

// Re-export types for convenience
export type { Notification, NotificationListResponse, UnreadCountResponse, GetNotificationsParams, NotificationType };
