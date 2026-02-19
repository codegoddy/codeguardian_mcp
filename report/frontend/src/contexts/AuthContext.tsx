// React Query provider and auth context provider
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import * as React from 'react';
import { createClient } from '@/utils/supabase/client';
import { authService } from '../services/auth';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false, // We'll handle retries in our service layer
    },
  },
});

interface User {
  email: string;
  fullName?: string;
  provider?: string;
  profileImageUrl?: string;
  id?: string;
}

// Track which auth method is currently active
type AuthMethod = 'supabase_oauth' | 'cookie_based' | null;

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  authMethod: AuthMethod;
  error: string | null;
  isLoading: boolean;
  isInitialized: boolean;
  logout: () => Promise<void>;
  clearError: () => void;
  refreshAuth: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextType | undefined>(undefined);

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {children}
      </AuthProvider>
      {/* PERFORMANCE: Only load devtools in development to reduce production bundle */}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = React.useState(false);
  const [authMethod, setAuthMethod] = React.useState<AuthMethod>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Initialize Supabase client
  const supabase = React.useMemo(() => createClient(), []);

  // Check current session - tries both auth methods
  const checkSession = React.useCallback(async () => {
    setIsLoading(true);
    try {
      // Try Supabase OAuth first
      const { data: { session: supabaseSession } } = await supabase.auth.getSession();
      
      if (supabaseSession?.user) {
        // User logged in via Supabase OAuth
        setIsAuthenticated(true);
        setAuthMethod('supabase_oauth');
        setUser({
          email: supabaseSession.user.email || '',
          id: supabaseSession.user.id,
          fullName: supabaseSession.user.user_metadata?.full_name,
          profileImageUrl: supabaseSession.user.user_metadata?.avatar_url,
          provider: supabaseSession.user.app_metadata?.provider || 'email'
        });
        return;
      }

      // Try cookie-based auth (email/password login)
      const cookieResult = await authService.getCurrentUser();
      
      if (cookieResult.success && cookieResult.data) {
        // User logged in via email/password
        setIsAuthenticated(true);
        setAuthMethod('cookie_based');
        setUser(cookieResult.data);
        return;
      }

      // No valid session found
      setIsAuthenticated(false);
      setUser(null);
      setAuthMethod(null);
    } catch (err) {
      console.error("Session check failed", err);
      setError("Failed to restore session");
      setIsAuthenticated(false);
      setUser(null);
      setAuthMethod(null);
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  React.useEffect(() => {
    checkSession();

    // Listen for Supabase auth changes (OAuth events)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, supabaseSession) => {
      if (supabaseSession?.user) {
        // User logged in via OAuth
        setIsAuthenticated(true);
        setAuthMethod('supabase_oauth');
        setUser({
          email: supabaseSession.user.email || '',
          id: supabaseSession.user.id,
          fullName: supabaseSession.user.user_metadata?.full_name,
          profileImageUrl: supabaseSession.user.user_metadata?.avatar_url,
          provider: supabaseSession.user.app_metadata?.provider || 'email'
        });
        setIsLoading(false);
      } else {
        // Supabase signed out - check if cookie session exists
        checkSession();
      }
    });

    // AUTO-REFRESH: Refresh Supabase session every 50 minutes (token expires at 60 min)
    // This prevents "JWT expired" errors for OAuth users
    let refreshInterval: NodeJS.Timeout | null = null;
    
    if (authMethod === 'supabase_oauth') {
      refreshInterval = setInterval(async () => {
        console.log('[Auth] Auto-refreshing Supabase session...');
        const { error } = await supabase.auth.refreshSession();
        if (error) {
          console.error('[Auth] Session refresh failed:', error);
          // If refresh fails, redirect to login
          logout();
        } else {
          console.log('[Auth] Session refreshed successfully');
        }
      }, 50 * 60 * 1000); // 50 minutes
    }

    return () => {
      subscription.unsubscribe();
      if (refreshInterval) clearInterval(refreshInterval);
    };
  }, [supabase, checkSession, authMethod]);

  const logout = async () => {
    try {
      // Sign out from both auth methods
      await supabase.auth.signOut();
      await authService.logout();

      queryClient.clear();
      
      // Dispatch legacy event if needed
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('auth:logout'));
      }
      
      setIsAuthenticated(false);
      setUser(null);
      setAuthMethod(null);
      
      // Redirect to login page
      window.location.href = '/login';
    } catch (err) {
      console.error('Error signing out:', err);
      // Still redirect even if there was an error
      window.location.href = '/login';
    }
  };

  const clearError = () => setError(null);

  const contextValue: AuthContextType = {
    isAuthenticated,
    user,
    token: null, // Tokens managed internally (Supabase client or cookies)
    refreshToken: null,
    authMethod,
    error,
    isLoading,
    isInitialized: !isLoading,
    logout,
    clearError,
    refreshAuth: checkSession,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext(): AuthContextType {
  const context = React.useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuthContext must be used within Providers');
  }
  return context;
}

// Higher-order component for protecting routes
export function withAuth<P extends object>(
  Component: React.ComponentType<P>
) {
  return function ProtectedComponent(props: P) {
    const { isAuthenticated, isInitialized, isLoading } = useAuthContext();

    if (!isInitialized || isLoading) {
      return null; // Or a loading spinner
    }

    if (!isAuthenticated) {
      window.location.href = '/login';
      return null;
    }

    return <Component {...props} />;
  };
}

// Async-safe route protection hook
export function useProtectedRoute() {
  const { isAuthenticated, isInitialized, isLoading } = useAuthContext();
  return { isAuthenticated, isInitialized, isLoading };
}
