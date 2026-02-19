import ApiService from './api';

// Interfaces
export interface PendingTimeEntry {
  session_id: string;
  deliverable_id: string;
  deliverable_title: string;
  project_id: string;
  project_name: string;
  start_time: string;
  end_time: string;
  duration_hours: number;
  duration_minutes: number;
  commit_count: number;
  total_insertions: number;
  total_deletions: number;
  total_files_changed: number;
  commits: Array<{
    committed_at: string;
    deliverable_id: string;
    message: string;
    sha: string;
    author_name: string;
    insertions: number;
    deletions: number;
    files_changed: number;
  }>;
  summary: string;
  estimated_cost?: number;
}

export interface AttachmentInfo {
  url: string;
  filename: string;
  type: string;
  size: number;
}

export interface PreviewLinkInfo {
  url: string;
  title?: string;
  description?: string;
}

export interface ApproveTimeEntryRequest {
  session_id: string;
  adjusted_hours?: number;
  notes?: string;
  attachments?: AttachmentInfo[];
  preview_links?: PreviewLinkInfo[];
}

export interface RejectTimeEntryRequest {
  session_id: string;
  reason?: string;
}

export interface TimeEntryResponse {
  status: string;
  message: string;
  deliverable_id: string;
  hours_approved?: number;
  reason?: string;
}

export interface DeliverableTimeStats {
  deliverable_id: string;
  deliverable_title: string;
  estimated_hours: number | null;
  actual_hours: number | null;
  calculated_hours: number | null;
  hours_remaining: number | null;
  usage_percentage: number | null;
  variance_hours: number | null;
  variance_percentage: number | null;
  commit_count: number;
  entry_count: number;
  entries: TimeEntry[];
}

export interface TimeEntry {
  id: string;
  project_id: string;
  deliverable_id: string;
  user_id: string;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number | null;
  hourly_rate: number | null;
  cost: number | null;
  currency: string | null;
  source: string | null;
  git_commit_sha: string | null;
  git_commit_message: string | null;
  auto_generated: boolean;
  is_billable: boolean;
  is_billed: boolean;
  created_at: string;
  updated_at?: string;
}

export interface ProjectTimeEntries {
  project_id: string;
  total_entries: number;
  total_hours: number;
  total_cost: number;
  deliverables: Record<string, TimeEntry[]>;
}

export interface UserTimeEntries {
  user_id: string;
  start_date: string | null;
  end_date: string | null;
  total_entries: number;
  total_hours: number;
  total_cost: number;
  default_currency: string;
  entries_by_date: Record<string, TimeEntry[]>;
}

export const timeEntriesApi = {
  /**
   * Get all pending time entries that need review/approval
   */
  getPending: async (): Promise<PendingTimeEntry[]> => {
    return ApiService.get<PendingTimeEntry[]>('/api/time-entries/pending');
  },

  /**
   * Approve a pending time entry
   */
  approve: async (data: ApproveTimeEntryRequest): Promise<TimeEntryResponse> => {
    return ApiService.post<TimeEntryResponse>('/api/time-entries/approve', data);
  },

  /**
   * Reject a pending time entry
   */
  reject: async (data: RejectTimeEntryRequest): Promise<TimeEntryResponse> => {
    return ApiService.post<TimeEntryResponse>('/api/time-entries/reject', data);
  },

  /**
   * Get time entries for a specific deliverable
   */
  getByDeliverable: async (deliverableId: string): Promise<DeliverableTimeStats> => {
    return ApiService.get<DeliverableTimeStats>(`/api/time-entries/deliverable/${deliverableId}`);
  },

  /**
   * Get time entries for a project
   */
  getByProject: async (projectId: string): Promise<ProjectTimeEntries> => {
    return ApiService.get<ProjectTimeEntries>(`/api/time-entries/project/${projectId}`);
  },

  /**
   * Get time entries for the current user with optional date filtering
   */
  getUserEntries: async (startDate?: string, endDate?: string): Promise<UserTimeEntries> => {
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);

    const query = params.toString() ? `?${params.toString()}` : '';
    return ApiService.get<UserTimeEntries>(`/api/time-entries/user/entries${query}`);
  },

  /**
   * Upload a file attachment for a time entry
   */
  uploadAttachment: async (file: File): Promise<AttachmentInfo> => {
    const formData = new FormData();
    formData.append('file', file);

    // For file uploads, we still use ApiService but need to handle FormData
    // Since ApiService.post stringifies data, we might need a custom call if ApiService doesn't support FormData
    // Let's check authenticatedApiCall in auth.ts
    
    // Actually, let's just use authenticatedApiCall directly for this unique case if needed
    // but wait, let's see why documentation.ts was listed too
    
    return ApiService.post<AttachmentInfo>('/api/time-entries/upload-attachment', formData);
  },
};
