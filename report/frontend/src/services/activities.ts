import ApiService from "./api";

// Activity types matching backend
export type ActivityType = "commit" | "invoice" | "deliverable" | "contract" | "project" | "time_entry" | "default";
export type EntityType = "project" | "deliverable" | "contract" | "invoice" | "time_entry" | "change_request" | "client";

export interface Activity {
  id: string;
  user_id: string;
  entity_type: EntityType;
  entity_id: string;
  action: string;
  title: string;
  description: string | null;
  activity_type: ActivityType;
  extra_data: Record<string, unknown> | null;
  created_at: string;
}

export interface ActivityListResponse {
  items: Activity[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

export interface GetActivitiesParams {
  entity_type?: EntityType;
  page?: number;
  page_size?: number;
}

export const activitiesApi = {
  /**
   * Get activities for the current user with optional filtering and pagination.
   */
  getActivities: async (params?: GetActivitiesParams): Promise<ActivityListResponse> => {
    const queryParams = new URLSearchParams();
    if (params?.entity_type) queryParams.append("entity_type", params.entity_type);
    if (params?.page) queryParams.append("page", params.page.toString());
    if (params?.page_size) queryParams.append("page_size", params.page_size.toString());
    
    const queryString = queryParams.toString();
    const url = `/api/activities${queryString ? `?${queryString}` : ""}`;
    return await ApiService.get<ActivityListResponse>(url);
  },

  /**
   * Get recent activities for sidebar display.
   */
  getRecentActivities: async (limit: number = 10): Promise<Activity[]> => {
    return await ApiService.get<Activity[]>(`/api/activities/recent?limit=${limit}`);
  },
};
