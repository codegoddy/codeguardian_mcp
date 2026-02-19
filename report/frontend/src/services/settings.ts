/**
 * Settings API service
 * Handles user settings and profile management
 */

import ApiService from './api';

export interface SettingsResponse {
  id: number;
  user_id: number;
  profile_image_url: string | null;
  bio: string | null;
  default_currency: string;
  timezone: string;
  date_format: string;
  time_format: string;
  email_notifications: boolean;
  auto_pause_notifications: boolean;
  contract_signed_notifications: boolean;
  payment_received_notifications: boolean;
  created_at: string;
  updated_at: string;
  // User profile fields (included to avoid separate API call)
  full_name: string;
  email: string;
  provider: string | null;
  is_oauth_user: boolean;
  can_change_password: boolean;
}

export interface SettingsUpdate {
  bio?: string;
  default_currency?: string;
  timezone?: string;
  date_format?: string;
  time_format?: string;
  email_notifications?: boolean;
  auto_pause_notifications?: boolean;
  contract_signed_notifications?: boolean;
  payment_received_notifications?: boolean;
}

interface ProfileImageUploadResponse {
  message: string;
  profile_image_url: string;
}

export interface UserProfile {
  id: number;
  email: string;
  full_name: string;
  provider: string | null;
  is_oauth_user: boolean;
  can_change_password: boolean;
}

export interface ProfileUpdateData {
  full_name: string;
}

export interface PasswordChangeData {
  current_password: string;
  new_password: string;
}

export interface StaticData {
  currencies: Array<{ code: string; name: string; symbol: string }>;
  timezones: Array<{ value: string; label: string }>;
  date_formats: Array<{ value: string; label: string; example: string }>;
  time_formats: Array<{ value: string; label: string; example: string }>;
  constraints: {
    profile_image: {
      recommended: string;
      max_size_mb: number;
      accepted_formats: string[];
    };
    password: {
      min_length: number;
      requirements: string;
    };
  };
}

export const settingsApi = {
  /**
   * Get user settings
   */
  getSettings: async (): Promise<SettingsResponse> => {
    return ApiService.get<SettingsResponse>('/api/settings');
  },

  /**
   * Get static data (currencies, timezones, formats, constraints)
   * This data is cached on both server and client side
   */
  getStaticData: async (): Promise<StaticData> => {
    return ApiService.get<StaticData>('/api/settings/static-data');
  },

  /**
   * Update user settings
   */
  updateSettings: async (data: SettingsUpdate): Promise<SettingsResponse> => {
    return ApiService.put<SettingsResponse>('/api/settings', data);
  },

  /**
   * Upload profile image
   */
  uploadProfileImage: async (file: File): Promise<ProfileImageUploadResponse> => {
    // For file uploads, we need to use FormData
    const formData = new FormData();
    formData.append('image', file);

    return ApiService.post<ProfileImageUploadResponse>('/api/settings/profile-image', formData);
  },

  /**
   * Delete profile image
   */
  deleteProfileImage: async (): Promise<{ message: string }> => {
    return ApiService.delete<{ message: string }>('/api/settings/profile-image');
  },

  /**
   * Get user profile
   */
  getProfile: async (): Promise<UserProfile> => {
    return ApiService.get<UserProfile>('/api/settings/profile');
  },

  /**
   * Update user profile (name)
   */
  updateProfile: async (data: ProfileUpdateData): Promise<{ message: string; full_name: string }> => {
    return ApiService.put<{ message: string; full_name: string }>('/api/settings/profile', data);
  },

  /**
   * Change password
   */
  changePassword: async (data: PasswordChangeData): Promise<{ message: string }> => {
    return ApiService.post<{ message: string }>('/api/settings/change-password', data);
  },
};

export type { ProfileImageUploadResponse };
