import ApiService from './api';

export interface CommitReview {
  id: string;
  project_id: string;
  commit_hash: string;
  commit_message: string;
  commit_author: string | null;
  commit_timestamp: string | null;
  deliverable_id: string | null;
  parsed_hours: number | null;
  manual_hours: number | null;
  manual_notes: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface ReviewSubmit {
  deliverable_id?: string;
  manual_hours?: number;
  manual_notes?: string;
}

export interface ReviewReject {
  reason: string;
}

export interface ReviewStatistics {
  pending: number;
  reviewed: number;
  rejected: number;
  total: number;
}

export interface ReviewSubmitResponse {
  status: string;
  review_id: string;
  time_entry_id: string;
  deliverable_id: string;
  hours_tracked: number;
}

export interface ReviewRejectResponse {
  status: string;
  message: string;
}

export interface BulkReviewResponse {
  success_count: number;
  error_count: number;
  errors: Array<{
    review_id: string;
    error: string;
  }>;
}

export const reviewsApi = {
  getPendingReviews: async (): Promise<CommitReview[]> => {
    return ApiService.get<CommitReview[]>('/api/commit-reviews/pending');
  },

  getPendingCount: async (): Promise<{ count: number }> => {
    return ApiService.get<{ count: number }>('/api/commit-reviews/count');
  },

  getStatistics: async (): Promise<ReviewStatistics> => {
    return ApiService.get<ReviewStatistics>('/api/commit-reviews/statistics');
  },

  getReview: async (id: string): Promise<CommitReview> => {
    return ApiService.get<CommitReview>(`/api/commit-reviews/${id}`);
  },

  submitReview: async (id: string, data: ReviewSubmit): Promise<ReviewSubmitResponse> => {
    return ApiService.post<ReviewSubmitResponse>(`/api/commit-reviews/${id}/review`, data);
  },

  rejectReview: async (id: string, data: ReviewReject): Promise<ReviewRejectResponse> => {
    return ApiService.post<ReviewRejectResponse>(`/api/commit-reviews/${id}/reject`, data);
  },

  bulkSubmitReviews: async (reviewIds: string[]): Promise<BulkReviewResponse> => {
    return ApiService.post<BulkReviewResponse>('/api/commit-reviews/bulk-submit', { review_ids: reviewIds });
  },
};
