import ApiService from "./api";

// Notification types matching backend
export type NotificationType = "notification" | "alert" | "update" | "reminder";
export type NotificationEntityType = "project" | "invoice" | "deliverable" | "contract" | "change_request";

export interface Notification {
  id: string;
  user_id: string;
  notification_type: NotificationType;
  title: string;
  message: string;
  is_read: boolean;
  action_url: string | null;
  entity_type: NotificationEntityType | null;
  entity_id: string | null;
  extra_data: Record<string, unknown> | null;
  created_at: string;
}

export interface NotificationListResponse {
  items: Notification[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

export interface UnreadCountResponse {
  count: number;
}

export interface GetNotificationsParams {
  unread_only?: boolean;
  page?: number;
  page_size?: number;
}

export const notificationsApi = {
  /**
   * Get notifications for the current user with optional filtering and pagination.
   */
  getNotifications: async (params?: GetNotificationsParams): Promise<NotificationListResponse> => {
    const queryParams = new URLSearchParams();
    if (params?.unread_only !== undefined) queryParams.append("unread_only", params.unread_only.toString());
    if (params?.page) queryParams.append("page", params.page.toString());
    if (params?.page_size) queryParams.append("page_size", params.page_size.toString());
    
    const queryString = queryParams.toString();
    const url = `/api/notifications${queryString ? `?${queryString}` : ""}`;
    return await ApiService.get<NotificationListResponse>(url);
  },

  /**
   * Get the count of unread notifications.
   */
  getUnreadCount: async (): Promise<UnreadCountResponse> => {
    return await ApiService.get<UnreadCountResponse>("/api/notifications/unread");
  },

  /**
   * Mark a notification as read.
   */
  markAsRead: async (notificationId: string): Promise<{ message: string }> => {
    return await ApiService.post<{ message: string }>(`/api/notifications/${notificationId}/read`, {});
  },

  /**
   * Mark all notifications as read.
   */
  markAllAsRead: async (): Promise<{ message: string; count: number }> => {
    return await ApiService.post<{ message: string; count: number }>("/api/notifications/read-all", {});
  },

  /**
   * Delete a notification.
   */
  deleteNotification: async (notificationId: string): Promise<{ message: string }> => {
    return await ApiService.delete<{ message: string }>(`/api/notifications/${notificationId}`);
  },
};
