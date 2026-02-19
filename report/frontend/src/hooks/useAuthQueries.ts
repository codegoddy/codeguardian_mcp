// React Query hooks for authentication operations
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { authService, LoginCredentials, RegisterData, OTPRequest, OTPVerify, AuthApiResponse, AuthResponse, OAuthLoginResponse } from '../services/auth';
import { useAuthStore } from './useAuth';
import { toast } from '@/lib/toast';

// Query keys for React Query
export const authKeys = {
  login: ['auth', 'login'] as const,
  register: ['auth', 'register'] as const,
  forgotPassword: ['auth', 'forgotPassword'] as const,
  verifyOtp: ['auth', 'verifyOtp'] as const,
  oauthLogin: ['auth', 'oauthLogin'] as const,
};

export function useLoginMutation() {
  const { setAuthenticated, setUser, setError } = useAuthStore();
  const router = useRouter();

  return useMutation({
    mutationKey: authKeys.login,
    mutationFn: async (credentials: LoginCredentials): Promise<AuthApiResponse<AuthResponse>> => {
      return authService.login(credentials);
    },

    onSuccess: async (response, variables) => {
      if (response.success && response.data) {
        console.log('🔧 Login success - tokens in HTTP-only cookies');
        
        // SECURITY: Tokens are now in HTTP-only cookies set by the server
        // We don't store them in localStorage or state anymore
        setAuthenticated(true);
        setError(null);

        console.log('✅ User authenticated via cookies');

        // Fetch complete user data immediately after login
        try {
          const userResponse = await authService.getCurrentUser();
          if (userResponse.success && userResponse.data) {
            setUser({
              email: userResponse.data.email,
              fullName: userResponse.data.fullName,
              provider: userResponse.data.provider,
              profileImageUrl: userResponse.data.profileImageUrl
            });
            console.log('🔧 User data loaded successfully');
          } else {
            // Fallback to basic user object if getCurrentUser fails
            setUser({
              email: variables.email,
              fullName: undefined,
              provider: undefined,
              profileImageUrl: undefined
            });
            console.warn('Failed to fetch user data after login, using fallback');
          }
        } catch (error) {
          // Fallback to basic user object if getCurrentUser throws
          setUser({
            email: variables.email,
            fullName: undefined,
            provider: undefined,
            profileImageUrl: undefined
          });
          console.warn('Error fetching user data after login:', error);
        }

        // Redirect to dashboard after successful login
        toast.success('Login Successful!', 'Welcome back to DevHQ');
        router.push('/dashboard');
      } else {
        const errorMsg = response.error || 'Login failed';
        setError(errorMsg);
        toast.error('Login Failed', errorMsg);
      }
    },
    onError: (error) => {
      const errorMessage = error instanceof Error ? error.message : 'Login failed';
      setError(errorMessage);
      toast.error('Login Failed', errorMessage);
    },
  });
}

export function useRegisterMutation() {
  const { setError, clearError } = useAuthStore();

  return useMutation({
    mutationKey: authKeys.register,
    mutationFn: async (userData: RegisterData): Promise<AuthApiResponse<AuthResponse>> => {
      return authService.register(userData);
    },
    onSuccess: (response) => {
      if (response.success) {
        clearError();
        // Registration successful, typically user would go to OTP verification
      } else {
        setError(response.error || 'Registration failed');
      }
    },
    onError: (error) => {
      const errorMessage = error instanceof Error ? error.message : 'Registration failed';
      setError(errorMessage);
    },
  });
}

export function useForgotPasswordMutation() {
  const { setError, clearError } = useAuthStore();

  return useMutation({
    mutationKey: authKeys.forgotPassword,
    mutationFn: async (emailData: OTPRequest): Promise<AuthApiResponse<{ message: string }>> => {
      return authService.forgotPassword(emailData);
    },
    onSuccess: (response) => {
      if (response.success) {
        clearError();
        // Password reset email sent successfully
      } else {
        setError(response.error || 'Failed to send reset email');
      }
    },
    onError: (error) => {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send reset email';
      setError(errorMessage);
    },
  });
}

export function useVerifyOtpMutation() {
  const { setAuthenticated, setUser, setError, setToken, setRefreshToken } = useAuthStore();

  return useMutation({
    mutationKey: authKeys.verifyOtp,
    mutationFn: async (otpData: OTPVerify): Promise<AuthApiResponse<AuthResponse>> => {
      return authService.verifyOtp(otpData);
    },
    onSuccess: async (response, variables) => {
      if (response.success && response.data) {
        // Store both access token AND refresh token
        setToken(response.data.access_token);
        setRefreshToken(response.data.refresh_token);
        setAuthenticated(true);
        setError(null);

        console.log('✅ OTP verified - Access token stored');
        console.log('✅ OTP verified - Refresh token stored');

        // Fetch complete user data immediately after OTP verification
        try {
          const userResponse = await authService.getCurrentUser();
          if (userResponse.success && userResponse.data) {
            setUser({
              email: userResponse.data.email,
              fullName: userResponse.data.fullName,
              provider: userResponse.data.provider,
              profileImageUrl: userResponse.data.profileImageUrl
            });
            console.log('🔧 User data loaded successfully after OTP');
          } else {
            // Fallback to basic user object if getCurrentUser fails
            setUser({
              email: variables.email,
              fullName: undefined,
              provider: undefined,
              profileImageUrl: undefined
            });
            console.warn('Failed to fetch user data after OTP, using fallback');
          }
        } catch (error) {
          // Fallback to basic user object if getCurrentUser throws
          setUser({
            email: variables.email,
            fullName: undefined,
            provider: undefined,
            profileImageUrl: undefined
          });
          console.warn('Error fetching user data after OTP:', error);
        }
      } else {
        setError(response.error || 'Invalid OTP');
      }
    },
    onError: (error) => {
      const errorMessage = error instanceof Error ? error.message : 'OTP verification failed';
      setError(errorMessage);
    },
  });
}

// OAuth login mutation
export function useOAuthLoginMutation() {
  return useMutation({
    mutationKey: authKeys.oauthLogin,
    mutationFn: async (provider: string): Promise<AuthApiResponse<OAuthLoginResponse>> => {
      return authService.oauthLogin(provider);
    },
  });
}

// Custom hook that combines store state with React Query loading states
export function useAuth() {
  const store = useAuthStore();

  const loginMutation = useLoginMutation();
  const registerMutation = useRegisterMutation();
  const forgotPasswordMutation = useForgotPasswordMutation();
  const verifyOtpMutation = useVerifyOtpMutation();
  const oauthLoginMutation = useOAuthLoginMutation();

  const isLoading = useMemo(() =>
    loginMutation.isPending || registerMutation.isPending ||
    forgotPasswordMutation.isPending || verifyOtpMutation.isPending ||
    oauthLoginMutation.isPending,
    [loginMutation.isPending, registerMutation.isPending,
     forgotPasswordMutation.isPending, verifyOtpMutation.isPending,
     oauthLoginMutation.isPending]
  );

  return {
    // Store state
    ...store,

    // Combined loading state
    isLoading,

    // Mutation states
    login: loginMutation.mutateAsync,
    register: registerMutation.mutateAsync,
    forgotPassword: forgotPasswordMutation.mutateAsync,
    verifyOtp: verifyOtpMutation.mutateAsync,
    oauthLogin: oauthLoginMutation.mutateAsync,

    // Individual loading states if needed
    isLoginLoading: loginMutation.isPending,
    isRegisterLoading: registerMutation.isPending,
    isForgotPasswordLoading: forgotPasswordMutation.isPending,
    isVerifyOtpLoading: verifyOtpMutation.isPending,
    isOAuthLoginLoading: oauthLoginMutation.isPending,
  };
}
