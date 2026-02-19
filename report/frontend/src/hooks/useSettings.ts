/**
 * React Query hooks for settings operations
 *
 * Architecture:
 * - useQuery: For FETCHING data (GET) - caches and manages loading states
 * - useMutation: For MODIFYING data (POST/PUT/DELETE) - handles updates without refetching everything
 *
 * This ensures:
 * - Only the specific API endpoint is called for each action
 * - No unnecessary refetches of the entire bundle
 * - Optimized cache updates for better performance
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  settingsApi,
  SettingsResponse,
  SettingsUpdate,
  UserProfile,
  ProfileUpdateData,
  PasswordChangeData,
} from "../services/settings";
import { useAuthContext } from "../contexts/AuthContext";

// Query keys for React Query cache management
export const settingsKeys = {
  all: ["settings"] as const,
  detail: () => [...settingsKeys.all, "detail"] as const,
  profileImage: () => [...settingsKeys.all, "profileImage"] as const,
  profile: () => [...settingsKeys.all, "profile"] as const,
};

/**
 * FETCH user settings (GET request)
 * Uses useQuery for data fetching with automatic caching
 * Auto-creates default settings if none exist
 *
 * @returns Query result with settings data and loading states
 */
export function useSettings() {
  const { isAuthenticated, isInitialized } = useAuthContext();

  return useQuery({
    queryKey: settingsKeys.detail(),
    queryFn: settingsApi.getSettings,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
    enabled: isInitialized && isAuthenticated, // Only fetch when auth is ready
  });
}

/**
 * UPDATE user settings (PUT request)
 * Uses useMutation - only calls PUT /api/settings endpoint
 * Does NOT refetch the entire bundle - updates cache directly
 *
 * @returns Mutation with mutate/mutateAsync functions
 *
 * @example
 * const updateMutation = useUpdateSettings();
 * await updateMutation.mutateAsync({ bio: 'New bio' });
 */
export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SettingsUpdate) => settingsApi.updateSettings(data),
    onSuccess: (updatedSettings) => {
      // Directly update the cache with new data (no refetch needed)
      queryClient.setQueryData(settingsKeys.detail(), updatedSettings);

      // Invalidate settings to ensure fresh data
      queryClient.invalidateQueries({ queryKey: settingsKeys.all });

      // Invalidate time-tracker-bundle since it includes default_currency
      // This ensures currency changes are reflected immediately in the time tracker
      queryClient.invalidateQueries({ queryKey: ['time-tracker-bundle'] });
    },
    onError: (error) => {
      console.error("Failed to update settings:", error);
    },
  });
}

/**
 * UPLOAD profile image (POST request)
 * Uses useMutation - only calls POST /api/settings/profile-image endpoint
 * Does NOT refetch settings - updates only the profile_image_url in cache
 *
 * @returns Mutation with mutate/mutateAsync functions
 *
 * @example
 * const uploadMutation = useUploadProfileImage();
 * await uploadMutation.mutateAsync(file);
 */
export function useUploadProfileImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => settingsApi.uploadProfileImage(file),
    onSuccess: (response) => {
      // Update only the profile_image_url in cache (no full refetch)
      queryClient.setQueryData<SettingsResponse>(
        settingsKeys.detail(),
        (oldData) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            profile_image_url: response.profile_image_url,
          };
        }
      );

      // Invalidate to ensure consistency
      queryClient.invalidateQueries({ queryKey: settingsKeys.all });
    },
    onError: (error) => {
      console.error("Failed to upload profile image:", error);
    },
  });
}

/**
 * DELETE profile image (DELETE request)
 * Uses useMutation - only calls DELETE /api/settings/profile-image endpoint
 * Does NOT refetch settings - updates only the profile_image_url to null in cache
 *
 * @returns Mutation with mutate/mutateAsync functions
 *
 * @example
 * const deleteMutation = useDeleteProfileImage();
 * await deleteMutation.mutateAsync();
 */
export function useDeleteProfileImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => settingsApi.deleteProfileImage(),
    onSuccess: () => {
      // Update only the profile_image_url to null in cache (no full refetch)
      queryClient.setQueryData<SettingsResponse>(
        settingsKeys.detail(),
        (oldData) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            profile_image_url: null,
          };
        }
      );

      // Invalidate to ensure consistency
      queryClient.invalidateQueries({ queryKey: settingsKeys.all });
    },
    onError: (error) => {
      console.error("Failed to delete profile image:", error);
    },
  });
}

/**
 * Complete settings bundle hook
 * Combines all settings operations with loading states
 *
 * @example
 * ```tsx
 * const {
 *   settings,
 *   isLoading,
 *   updateSettings,
 *   uploadImage,
 *   deleteImage,
 *   isUpdating,
 *   isUploading,
 * } = useSettingsBundle();
 *
 * // Use in component
 * await updateSettings({ bio: 'New bio' });
 * await uploadImage(file);
 * ```
 */
export function useSettingsBundle() {
  const settingsQuery = useSettings();
  const updateMutation = useUpdateSettings();
  const uploadMutation = useUploadProfileImage();
  const deleteMutation = useDeleteProfileImage();

  return {
    // Settings data
    settings: settingsQuery.data,
    isLoading: settingsQuery.isLoading,
    isError: settingsQuery.isError,
    error: settingsQuery.error,

    // Refetch function
    refetch: settingsQuery.refetch,

    // Update settings
    updateSettings: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error,

    // Upload profile image
    uploadImage: uploadMutation.mutateAsync,
    isUploading: uploadMutation.isPending,
    uploadError: uploadMutation.error,

    // Delete profile image
    deleteImage: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
    deleteError: deleteMutation.error,

    // Combined loading state
    isAnyLoading:
      settingsQuery.isLoading ||
      updateMutation.isPending ||
      uploadMutation.isPending ||
      deleteMutation.isPending,
  };
}

/**
 * Prefetch settings
 * Useful for preloading settings before navigating to settings page
 */
export function usePrefetchSettings() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.prefetchQuery({
      queryKey: settingsKeys.detail(),
      queryFn: settingsApi.getSettings,
    });
  };
}

/**
 * FETCH user profile (GET request)
 * Uses useQuery for fetching user profile data
 *
 * @returns Query result with profile data
 */
export function useProfile() {
  return useQuery({
    queryKey: settingsKeys.profile(),
    queryFn: settingsApi.getProfile,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });
}

/**
 * UPDATE user profile (PUT request)
 * Uses useMutation - only calls PUT /api/settings/profile endpoint
 *
 * @returns Mutation with mutate/mutateAsync functions
 *
 * @example
 * const updateProfileMutation = useUpdateProfile();
 * await updateProfileMutation.mutateAsync({ full_name: 'John Doe' });
 */
export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ProfileUpdateData) => settingsApi.updateProfile(data),
    onSuccess: (response) => {
      // Update the profile cache
      queryClient.setQueryData<UserProfile>(
        settingsKeys.profile(),
        (oldData) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            full_name: response.full_name,
          };
        }
      );

      // Also update the settings cache with the new full_name
      queryClient.setQueryData<SettingsResponse>(
        settingsKeys.detail(),
        (oldData) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            full_name: response.full_name,
          };
        }
      );

      // Invalidate to ensure consistency
      queryClient.invalidateQueries({ queryKey: settingsKeys.profile() });
      queryClient.invalidateQueries({ queryKey: settingsKeys.detail() });
    },
    onError: (error) => {
      console.error("Failed to update profile:", error);
    },
  });
}

/**
 * CHANGE password (POST request)
 * Uses useMutation - only calls POST /api/settings/change-password endpoint
 *
 * @returns Mutation with mutate/mutateAsync functions
 *
 * @example
 * const changePasswordMutation = useChangePassword();
 * await changePasswordMutation.mutateAsync({
 *   current_password: 'old',
 *   new_password: 'new'
 * });
 */
export function useChangePassword() {
  return useMutation({
    mutationFn: (data: PasswordChangeData) => settingsApi.changePassword(data),
    onError: (error) => {
      console.error("Failed to change password:", error);
    },
  });
}

/**
 * FETCH static data (GET request)
 * Uses useQuery with aggressive caching (24 hours stale time)
 * This data rarely changes and is shared across all users
 *
 * @returns Query result with static data (currencies, timezones, formats, constraints)
 */
export function useStaticData() {
  return useQuery({
    queryKey: ["settings", "static-data"],
    queryFn: settingsApi.getStaticData,
    staleTime: 24 * 60 * 60 * 1000, // 24 hours - very aggressive caching
    gcTime: 7 * 24 * 60 * 60 * 1000, // 7 days - keep in cache for a week
    retry: 2,
    refetchOnWindowFocus: false, // Don't refetch when window regains focus
    refetchOnMount: false, // Don't refetch on component mount if data exists
  });
}

// Export types for convenience
export type {
  SettingsResponse,
  SettingsUpdate,
  UserProfile,
  ProfileUpdateData,
  PasswordChangeData,
};
