// Zustand store for authentication state management
import { create } from 'zustand';
import { authService } from '../services/auth';

interface User {
  email: string;
  fullName?: string;
  provider?: string;
  profileImageUrl?: string;
}

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean; // New flag to track initialization completion
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  error: string | null;

  // Actions
  setAuthenticated: (isAuthenticated: boolean) => void;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  setRefreshToken: (refreshToken: string | null) => void;
  setError: (error: string | null) => void;
  setLoading: (isLoading: boolean) => void;
  setInitialized: (isInitialized: boolean) => void;
  clearError: () => void;
  logout: () => void;

  // Initialize on app start
  initialize: () => Promise<void>;

  // Refresh token
  refreshAuth: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  isLoading: false,
  isInitialized: false,
  user: null,
  token: null,
  refreshToken: null,
  error: null,

  setAuthenticated: (isAuthenticated) => {
    set({ isAuthenticated });
  },

  setInitialized: (isInitialized) => {
    set({ isInitialized });
  },

  setUser: (user) => {
    if (user) {
      localStorage.setItem('user_email', user.email);
      if (user.fullName) localStorage.setItem('user_fullName', user.fullName);
      if (user.provider) localStorage.setItem('user_provider', user.provider);
      if (user.profileImageUrl) localStorage.setItem('user_profileImageUrl', user.profileImageUrl);
    } else {
      localStorage.removeItem('user_email');
      localStorage.removeItem('user_fullName');
      localStorage.removeItem('user_provider');
      localStorage.removeItem('user_profileImageUrl');
    }
    set({ user });
  },

  setToken: (token) => {
    // SECURITY: Tokens are now stored in HTTP-only cookies, not localStorage
    // Only update the in-memory state for UI purposes
    set({ token });
  },

  setRefreshToken: (refreshToken: string | null) => {
    // SECURITY: Tokens are now stored in HTTP-only cookies, not localStorage
    // Only update the in-memory state for UI purposes
    set({ refreshToken });
  },

  setError: (error) => set({ error }),

  setLoading: (isLoading) => set({ isLoading }),

  clearError: () => set({ error: null }),

  logout: () => {
    // SECURITY: Clear old localStorage tokens (migration cleanup)
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    
    // Keep user profile info in localStorage for UI purposes (non-sensitive)
    localStorage.removeItem('user_email');
    localStorage.removeItem('user_fullName');
    localStorage.removeItem('user_provider');
    localStorage.removeItem('user_profileImageUrl');
    
    set({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      token: null,
      refreshToken: null,
      error: null,
    });

    // Clear React Query cache on logout
    // This ensures fresh data when a new user logs in
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('auth:logout');
      window.dispatchEvent(event);
    }
  },

  initialize: async () => {
    set({ isLoading: true, isInitialized: false });

    try {
      // SECURITY: Clean up any old localStorage tokens from pre-cookie implementation
      const oldToken = localStorage.getItem('access_token');
      const oldRefreshToken = localStorage.getItem('refresh_token');
      
      if (oldToken || oldRefreshToken) {
        console.warn('[AUTH] Cleaning up old localStorage tokens - migrating to cookie-only auth');
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
      }

      // Get user info from localStorage (non-sensitive data)
      const email = localStorage.getItem('user_email');
      const fullName = localStorage.getItem('user_fullName');
      const provider = localStorage.getItem('user_provider');
      const profileImageUrl = localStorage.getItem('user_profileImageUrl');

      // Validate auth by calling getCurrentUser - this uses cookies automatically
      try {
        const validationResponse = await authService.getCurrentUser();

        if (validationResponse.success && validationResponse.data) {
          // User is authenticated via cookies
          const user: User = {
            email: validationResponse.data.email || email || '',
            fullName: validationResponse.data.fullName || fullName || undefined,
            provider: validationResponse.data.provider || provider || undefined,
            profileImageUrl: validationResponse.data.profileImageUrl || profileImageUrl || undefined
          };

          set({
            isAuthenticated: true,
            user,
            isLoading: false,
            isInitialized: true,
            token: null, // Tokens are in HTTP-only cookies, not accessible to JS
            refreshToken: null
          });
        } else {
          // Not authenticated, clear everything
          localStorage.removeItem('user_email');
          localStorage.removeItem('user_fullName');
          localStorage.removeItem('user_provider');
          localStorage.removeItem('user_profileImageUrl');
          
          set({
            isAuthenticated: false,
            user: null,
            token: null,
            refreshToken: null,
            isLoading: false,
            isInitialized: true
          });
        }
      } catch (error) {
        // Network error or auth failure
        console.warn('[AUTH] Initialization failed, user not authenticated:', error);
        set({
          isAuthenticated: false,
          user: null,
          token: null,
          refreshToken: null,
          isLoading: false,
          isInitialized: true
        });
      }
    } catch (error) {
      console.error('Auth initialization error:', error);
      set({ isLoading: false, isInitialized: true });
    }
  },
  
  refreshAuth: async () => {
    set({ isLoading: true });

    try {
      // SECURITY: Tokens are in HTTP-only cookies now, no need to pass them manually
      // The browser will automatically send the cookies with the request
      const userResponse = await authService.getCurrentUser();
      
      if (userResponse.success && userResponse.data) {
        // Tokens are updated in HTTP-only cookies by the server
        // Just update the auth state
        set({
          isAuthenticated: true,
          isLoading: false,
          token: null, // Tokens are in HTTP-only cookies
          refreshToken: null
        });
      
        return true;
      } else {
        // Refresh failed, clear everything
        set({
          isAuthenticated: false,
          user: null,
          token: null,
          refreshToken: null,
          isLoading: false
        });
        localStorage.removeItem('user_email');
        localStorage.removeItem('user_fullName');
        localStorage.removeItem('user_provider');
        localStorage.removeItem('user_profileImageUrl');

        set({
          isAuthenticated: false,
          user: null,
          token: null,
          refreshToken: null,
          isLoading: false
        });

        return false;
      }
    } catch (error) {
      console.error('Token refresh failed:', error);

      // Clear user data
      localStorage.removeItem('user_email');
      localStorage.removeItem('user_fullName');
      localStorage.removeItem('user_provider');
      localStorage.removeItem('user_profileImageUrl');

      set({
        isAuthenticated: false,
        user: null,
        token: null,
        refreshToken: null,
        isLoading: false
      });

      return false;
    }
  },
}));
