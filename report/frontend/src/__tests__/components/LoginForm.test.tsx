import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';

// Mock the auth service before importing the component
jest.mock('@/services/auth', () => ({
  authService: {
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(),
    getCurrentUser: jest.fn(),
    verifyOtp: jest.fn(),
    resendOtp: jest.fn(),
    forgotPassword: jest.fn(),
  },
}));



// Mock @/contexts/AuthContext
jest.mock('@/contexts/AuthContext', () => ({
  useAuthContext: () => ({
    user: null,
    loading: false,
    refreshAuth: jest.fn(),
    logout: jest.fn(),
  }),
}));

// Mock @/utils/supabase/client
jest.mock('@/utils/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signInWithOAuth: jest.fn(),
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn(),
      getUser: jest.fn(),
      refreshSession: jest.fn(),
    },
  }),
}));

// Mock sonner
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

// Mock lucide-react
jest.mock('lucide-react', () => ({
  Loader2: ({ className }) => React.createElement('svg', { className, 'data-testid': 'loader' }),
  Github: ({ className }) => React.createElement('svg', { className, 'data-testid': 'github' }),
  Gitlab: ({ className }) => React.createElement('svg', { className, 'data-testid': 'gitlab' }),
  Eye: ({ className }) => React.createElement('svg', { className, 'data-testid': 'eye' }),
  EyeOff: ({ className }) => React.createElement('svg', { className, 'data-testid': 'eye-off' }),
}));

// Mock next/link with proper implementation
jest.mock('next/link', () => {
  return function MockLink({ href, children, className }) {
    return React.createElement('a', { href, className }, children);
  };
});

import LoginForm from '@/components/auth/LoginForm';
import { authService } from '@/services/auth';

describe('LoginForm', () => {
  let mockPush;
  let mockRefreshAuth;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPush = jest.fn();
    mockRefreshAuth = jest.fn();
    
    // Setup default mocks
    const { useRouter } = await import('next/navigation');
    const { useAuthContext } = await import('@/contexts/AuthContext');

    jest.spyOn(useRouter).mockReturnValue({ push: mockPush });
    jest.spyOn(useAuthContext).mockReturnValue({ refreshAuth: mockRefreshAuth });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders login form with email and password fields', () => {
    render(React.createElement(LoginForm));

    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('shows error message when login fails', async () => {
    authService.login.mockResolvedValueOnce({
      success: false,
      error: 'Invalid credentials',
    });

    render(React.createElement(LoginForm));

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'wrongpassword' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument();
    });
  });

  it('redirects to dashboard on successful login', async () => {
    authService.login.mockResolvedValueOnce({
      success: true,
      data: { access_token: 'test', refresh_token: 'test', token_type: 'bearer' },
    });

    render(React.createElement(LoginForm));

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockRefreshAuth).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('redirects to OTP verification when email is not verified', async () => {
    authService.login.mockResolvedValueOnce({
      success: false,
      error: 'Email not verified',
    });

    render(React.createElement(LoginForm));

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/verify-otp?email=test%40example.com');
    });
  });

  it('toggles password visibility', () => {
    render(React.createElement(LoginForm));

    const passwordInput = screen.getByLabelText(/password/i);
    expect(passwordInput.type).toBe('password');

    const toggleButton = screen.getByTestId('eye');
    fireEvent.click(toggleButton);
    expect(passwordInput.type).toBe('text');
  });

  it('disables submit button during loading', () => {
    authService.login.mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve({ success: false, error: 'error' }), 100))
    );

    render(React.createElement(LoginForm));

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'password123' },
    });

    const submitButton = screen.getByRole('button', { name: /sign in/i });
    expect(submitButton).not.toBeDisabled();

    fireEvent.click(submitButton);
    expect(submitButton).toBeDisabled();
  });

  it('has a link to signup page', () => {
    render(React.createElement(LoginForm));

    const signupLink = screen.getByRole('link', { name: /sign up now/i });
    expect(signupLink).toHaveAttribute('href', '/signup');
  });

  it('has a link to forgot password', () => {
    render(React.createElement(LoginForm));

    const forgotLink = screen.getByRole('link', { name: /forgot password/i });
    expect(forgotLink).toHaveAttribute('href', '/forgot-password');
  });
});
