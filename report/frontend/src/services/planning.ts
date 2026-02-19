import ApiService from './api';

export interface PlannedTimeBlock {
  id: string;
  user_id: string;
  project_id: string;
  deliverable_id: string;
  project_name: string;
  deliverable_name: string;
  tracking_code: string;
  planned_date: string;
  start_time: string | null;
  end_time: string | null;
  planned_hours: number;
  description?: string;
  google_calendar_event_id?: string;
  status: 'planned' | 'in_progress' | 'completed' | 'missed';
  created_at: string;
  updated_at: string;
}

export interface ActiveDeliverable {
  id: string;
  name: string;
  tracking_code: string | null;
  has_tracking_code: boolean;
  estimated_hours: number;
  hours_tracked: number;
  hours_remaining: number;
  deadline: string | null;
  priority: string;
  status: string;
}

export interface ActiveProject {
  id: string;
  name: string;
  contract_signed: boolean;
  contract_signed_at: string | null;
  start_date: string | null;
  end_date: string | null;
  deliverables: ActiveDeliverable[];
}

export interface ActiveDeliverablesResponse {
  projects: ActiveProject[];
}

export interface PlannedBlocksResponse {
  planned_blocks: PlannedTimeBlock[];
  total_planned_hours: number;
}

export interface CreatePlannedBlockRequest {
  deliverable_id: string;
  planned_date: string;
  start_time?: string;
  end_time?: string;
  planned_hours: number;
  description?: string;
  sync_to_calendar?: boolean;
}

export interface UpdatePlannedBlockRequest {
  planned_date?: string;
  start_time?: string;
  end_time?: string;
  planned_hours?: number;
  description?: string;
  status?: string;
}

export interface AutoScheduleRequest {
  deliverable_ids: string[];
  start_date: string;
  end_date: string;
  hours_per_day: number;
}

export interface AIAutoScheduleRequest {
  deliverable_ids: string[];
  start_date: string;
  end_date: string;
  preferences: {
    max_daily_hours: number;
    work_pattern: 'focused' | 'balanced' | 'flexible';
    include_buffer: boolean;
  };
}

export interface ScheduleAnalysis {
  feasibility: 'aggressive' | 'realistic' | 'comfortable';
  total_scheduled_hours: number;
  buffer_hours: number;
  confidence: number;
  warnings: string[];
  recommendations: string[];
}

export interface ScheduledBlock {
  deliverable_id: string;
  deliverable_title: string;
  planned_date: string;
  start_time: string;
  end_time: string;
  planned_hours: number;
  reasoning: string;
}

export interface AIAutoScheduleResponse {
  scheduled_blocks: ScheduledBlock[];
  analysis: ScheduleAnalysis;
  schedule_summary: {
    total_blocks: number;
    total_hours: number;
    feasibility: string;
    confidence: number;
  };
}

export interface AutoScheduleResponse {
  planned_blocks: Array<{
    id: string;
    deliverable_id: string;
    planned_date: string;
    planned_hours: number;
  }>;
  schedule_summary: {
    total_deliverables: number;
    total_hours_planned: number;
    days_scheduled: number;
  };
}

export interface GoogleCalendarStatus {
  connected: boolean;
  google_email?: string;
  calendar_id?: string;
  sync_enabled?: boolean;
  last_sync_at?: string;
}

export interface GoogleCalendarAuthResponse {
  auth_url: string;
}

export interface GoogleCalendarIntegration {
  id: string;
  google_email: string;
  calendar_id: string;
  sync_enabled: boolean;
}

export interface GoogleCalendarAutoSetupResponse {
  status: string;
  message: string;
  integration_id: string;
  google_email: string;
}

export interface SyncResponse {
  synced_events: number;
  created: number;
  updated: number;
  deleted: number;
}

export const planningApi = {
  /**
   * Get all active deliverables for planning
   */
  getActiveDeliverables: async (): Promise<ActiveDeliverablesResponse> => {
    return ApiService.get<ActiveDeliverablesResponse>('/api/planning/active-deliverables');
  },

  /**
   * Create a new planned time block
   */
  createPlannedBlock: async (data: CreatePlannedBlockRequest): Promise<PlannedTimeBlock> => {
    return ApiService.post<PlannedTimeBlock>('/api/planning/schedule', data);
  },

  /**
   * Get planned time blocks for a date range
   */
  getPlannedBlocks: async (startDate: string, endDate: string): Promise<PlannedBlocksResponse> => {
    return ApiService.get<PlannedBlocksResponse>(
      `/api/planning/schedule?start_date=${startDate}&end_date=${endDate}`
    );
  },

  /**
   * Update a planned time block
   */
  updatePlannedBlock: async (
    blockId: string,
    data: UpdatePlannedBlockRequest
  ): Promise<PlannedTimeBlock> => {
    return ApiService.put<PlannedTimeBlock>(`/api/planning/schedule/${blockId}`, data);
  },

  /**
   * Delete a planned time block
   */
  deletePlannedBlock: async (blockId: string): Promise<{ success: boolean }> => {
    return ApiService.delete<{ success: boolean }>(`/api/planning/schedule/${blockId}`);
  },

  /**
   * Auto-schedule deliverables (basic algorithm)
   */
  autoSchedule: async (data: AutoScheduleRequest): Promise<AutoScheduleResponse> => {
    return ApiService.post<AutoScheduleResponse>('/api/planning/auto-schedule', data);
  },

  /**
   * AI-powered auto-schedule deliverables (intelligent optimization)
   */
  aiAutoSchedule: async (data: AIAutoScheduleRequest): Promise<AIAutoScheduleResponse> => {
    return ApiService.post<AIAutoScheduleResponse>('/api/planning/ai-auto-schedule', data);
  },
};

export const googleCalendarApi = {
  /**
   * Get Google Calendar OAuth authorization URL
   */
  getAuthUrl: async (): Promise<GoogleCalendarAuthResponse> => {
    return ApiService.get<GoogleCalendarAuthResponse>(
      '/api/integrations/google-calendar/auth'
    );
  },

  /**
   * Get Google Calendar integration status
   */
  getStatus: async (): Promise<GoogleCalendarStatus> => {
    return ApiService.get<GoogleCalendarStatus>(
      '/api/integrations/google-calendar/status'
    );
  },

  /**
   * Disconnect Google Calendar integration
   */
  disconnect: async (): Promise<{ success: boolean }> => {
    return ApiService.delete<{ success: boolean }>(
      '/api/integrations/google-calendar'
    );
  },

  /**
   * Manually sync planned blocks to Google Calendar
   */
  sync: async (): Promise<SyncResponse> => {
    return ApiService.post<SyncResponse>('/api/integrations/google-calendar/sync');
  },

  /**
   * Auto-setup Google Calendar integration after OAuth signup
   * This is called automatically when a user signs up with Google
   */
  autoSetup: async (
    googleAccessToken: string,
    googleUserId: string,
    googleEmail: string,
    googleRefreshToken?: string,
    expiresAt?: number
  ): Promise<GoogleCalendarAutoSetupResponse> => {
    return ApiService.post<GoogleCalendarAutoSetupResponse>('/api/auth/google-calendar-auto-setup', {
      google_access_token: googleAccessToken,
      google_refresh_token: googleRefreshToken,
      google_user_id: googleUserId,
      google_email: googleEmail,
      expires_at: expiresAt,
    });
  },
};

export default planningApi;
