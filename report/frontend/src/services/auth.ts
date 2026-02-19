/** @format */ 

// API service for authentication operations

import { API_BASE_URL } from '../lib/config';
import { createClient } from '@/utils/supabase/client';

// Supabase client instance for auth
const supabase = createClient();

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  full_name: string;
  password: string;
}

export interface OTPRequest {
  email: string;
}

export interface OTPVerify {
  email: string;
  otp: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface AuthApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface OAuthLoginResponse {
  authorization_url: string;
  state: string;
}

export interface OAuthCallbackData {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: {
    email: string;
    full_name: string;
    is_oauth: boolean;
    provider: string;
    new_account?: boolean;
    linked_account?: boolean;
  };
}

export interface UserResponse {
  id: string;
  email: string;
  fullName: string;
  provider?: string;
  profileImageUrl?: string;
}

// PERFORMANCE: Determine timeout based on endpoint - AI endpoints need longer timeout
const getTimeoutForEndpoint = (endpoint: string): number => {
  // AI estimation endpoints need 90s due to model processing time
  if (endpoint.includes('/ai-estimation') || endpoint.includes('/ai/') || endpoint.includes('/planning/generate')) {
    return 90000; // 90 seconds for AI
  }
  return 15000; // 15 seconds for regular endpoints - fail fast for better UX
};

// Helper function to make API calls
export async function apiCall<T>(
  endpoint: string,
  options: RequestInit = {},
  retries: number = 1
): Promise<AuthApiResponse<T>> {
  // Don't set Content-Type for FormData - browser sets it automatically with boundary
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(!isFormData && { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string> || {}),
  };

  // Add Supabase auth token if available (skip for auth endpoints)
  if (!endpoint.startsWith('/api/auth/')) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
    } catch (e) {
      console.warn('Failed to get Supabase session:', e);
    }
  }

  try {
    const controller = new AbortController();
    // PERFORMANCE: Use appropriate timeout based on endpoint type
    const timeout = getTimeoutForEndpoint(endpoint);
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
      credentials: 'include', // Automatically includes HTTP-only cookies
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    let data;
    try {
      data = await response.json();
    } catch {
      data = { detail: 'Invalid response format' };
    }

    if (!response.ok) {
      const errorMessage = data.detail || data.message || `HTTP ${response.status}`;

      // Retry on network/server errors
      if (retries > 0 && response.status >= 500) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return apiCall(endpoint, options, retries - 1);
      }

      return { success: false, error: errorMessage };
    }

    return { success: true, data };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') return { success: false, error: 'Request timeout' };
      if (retries > 0 && (error.message.includes('fetch') || error.message.includes('network'))) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return apiCall(endpoint, options, retries - 1);
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Unknown error occurred' };
  }
}

// Authentication API functions
// NOTE: These are for cookie-based (email/password) auth only
// OAuth is handled via Supabase client
export const authService = {
  // Register a new user (uses Supabase Auth with Brevo emails)
  register: async (
    userData: RegisterData
  ): Promise<AuthApiResponse<AuthResponse>> => {
    // NEW: Use Supabase Auth endpoint with custom Brevo emails
    return apiCall<AuthResponse>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  },

  // Login user (uses Supabase Auth)
  login: async (
    credentials: LoginCredentials
  ): Promise<AuthApiResponse<AuthResponse>> => {
    // NEW: Use Supabase Auth endpoint
    return apiCall<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  },

  // Request password reset (forgot password) - uses Supabase Auth with Brevo emails
  forgotPassword: async (
    emailData: OTPRequest
  ): Promise<AuthApiResponse<{ message: string }>> => {
    // NEW: Use Supabase Auth endpoint with custom Brevo emails
    return apiCall<{ message: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify(emailData),
    });
  },

  // Verify OTP (uses Supabase Auth with Brevo emails)
  verifyOtp: async (
    otpData: OTPVerify
  ): Promise<AuthApiResponse<AuthResponse>> => {
    // NEW: Use Supabase Auth endpoint
    return apiCall<AuthResponse>('/api/auth/verify', {
      method: 'POST',
      body: JSON.stringify(otpData),
    });
  },

  // Resend OTP (uses Supabase Auth)
  resendOtp: async (
    emailData: OTPRequest
  ): Promise<AuthApiResponse<{ message: string }>> => {
    // Use Supabase Auth to resend OTP
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: emailData.email,
      });
      if (error) throw error;
      return { success: true, data: { message: 'OTP resent successfully' } };
    } catch (e) {
      return { success: false, error: 'Failed to resend OTP' };
    }
  },

  // Reset password with OTP
  resetPassword: async (data: {
    email: string;
    token: string;
    new_password: string;
  }): Promise<AuthApiResponse<{ message: string }>> => {
    // NEW: Use Supabase Auth endpoint
    return apiCall<{ message: string }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // OAuth login initiation (Note: Currently using Supabase OAuth instead)
  // This is kept for future migration to backend OAuth if needed
  oauthLogin: async (
    provider: string
  ): Promise<AuthApiResponse<OAuthLoginResponse>> => {
    return apiCall<OAuthLoginResponse>(`/api/auth/oauth/${provider}/login`);
  },

  // Get current user info (uses Supabase session)
  getCurrentUser: async (): Promise<AuthApiResponse<UserResponse>> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        return {
          success: true,
          data: {
            id: user.id,
            email: user.email || '',
            fullName: user.user_metadata?.full_name || '',
            provider: user.app_metadata?.provider || 'email',
            profileImageUrl: user.user_metadata?.avatar_url,
          }
        };
      }
      return { success: false, error: 'Not authenticated' };
    } catch (e) {
      return { success: false, error: 'Failed to get user' };
    }
  },

  // Logout (clears Supabase session)
  logout: async (): Promise<AuthApiResponse<{ message: string }>> => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      return { success: true, data: { message: 'Logged out successfully' } };
    } catch (e) {
      return { success: false, error: 'Logout failed' };
    }
  },
};

// User Identity interface for linked accounts
export interface UserIdentity {
  identity_id: string;
  id: string;
  user_id: string;
  provider: string;
  created_at: string;
  last_sign_in_at: string;
  updated_at: string;
  identity_data?: {
    email?: string;
    email_verified?: boolean;
    phone_verified?: boolean;
    sub?: string;
    name?: string;
    user_name?: string;
    avatar_url?: string;
    [key: string]: unknown;
  };
}

// Identity Linking API functions
export const identityService = {
  // Get all identities linked to the current user
  getUserIdentities: async (): Promise<AuthApiResponse<UserIdentity[]>> => {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      
      if (error) throw error;
      if (!user) {
        return { success: false, error: 'Not authenticated' };
      }

      // Identities are available on the user object
      const identities = user.identities || [];
      
      return { 
        success: true, 
        data: identities as UserIdentity[]
      };
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to get identities';
      return { success: false, error: errorMessage };
    }
  },

  // Link a new OAuth identity to the current user
  // Note: This is used when user is already logged in and wants to add another OAuth provider
  linkIdentity: async (provider: 'google' | 'github' | 'gitlab' | 'bitbucket', 
    options?: { 
      redirectTo?: string;
      scopes?: string;
    }
  ): Promise<AuthApiResponse<{ url: string }>> => {
    try {
      const { error } = await supabase.auth.linkIdentity({
        provider,
        options: {
          redirectTo: options?.redirectTo || `${window.location.origin}/settings?identity_linked=true`,
          scopes: options?.scopes,
        },
      });

      if (error) throw error;

      // The user will be redirected to the OAuth provider
      return { success: true, data: { url: '' } };
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to link identity';
      return { success: false, error: errorMessage };
    }
  },

  // Unlink an identity from the current user
  // Note: User must have at least 2 identities to unlink (cannot unlink the last one)
  unlinkIdentity: async (identity: UserIdentity): Promise<AuthApiResponse<{ message: string }>> => {
    try {
      const { error } = await supabase.auth.unlinkIdentity(identity);
      
      if (error) throw error;

      return { success: true, data: { message: 'Identity unlinked successfully' } };
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to unlink identity';
      return { success: false, error: errorMessage };
    }
  },

  // Check if user can unlink identities (must have at least 2)
  canUnlinkIdentities: async (): Promise<AuthApiResponse<boolean>> => {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      
      if (error) throw error;
      if (!user) {
        return { success: false, error: 'Not authenticated' };
      }

      const identities = user.identities || [];
      return { success: true, data: identities.length >= 2 };
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to check identities';
      return { success: false, error: errorMessage };
    }
  },
};

// Utility function for making authenticated API calls (for use in other services)
// Note: Cookies are sent automatically with credentials: 'include'
export const authenticatedApiCall = async <T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<AuthApiResponse<T>> => {
  return apiCall<T>(endpoint, options);
};
