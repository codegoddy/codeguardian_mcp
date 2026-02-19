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

import SignupForm from '@/components/auth/SignupForm';
import { authService } from '@/services/auth';

describe('SignupForm', () => {
  let mockPush;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPush = jest.fn();
    
    // Setup default mocks
    const { useRouter } = await import('next/navigation');
    jest.spyOn(useRouter).mockReturnValue({ push: mockPush });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders signup form with all fields', () => {
    render(React.createElement(SignupForm));

    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('shows error message when signup fails', async () => {
    authService.register.mockResolvedValueOnce({
      success: false,
      error: 'Email already registered',
    });

    render(React.createElement(SignupForm));

    fireEvent.change(screen.getByLabelText(/full name/i), {
      target: { value: 'Test User' },
    });
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText(/email already registered/i)).toBeInTheDocument();
    });
  });

  it('redirects to OTP verification on successful signup', async () => {
    authService.register.mockResolvedValueOnce({
      success: true,
      data: { access_token: 'test', refresh_token: 'test', token_type: 'bearer' },
    });

    render(React.createElement(SignupForm));

    fireEvent.change(screen.getByLabelText(/full name/i), {
      target: { value: 'Test User' },
    });
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/verify-otp?email=test%40example.com');
    });
  });

  it('has link to login page', () => {
    render(React.createElement(SignupForm));

    const loginLink = screen.getByRole('link', { name: /sign in/i });
    expect(loginLink).toHaveAttribute('href', '/login');
  });

  it('toggles password visibility', () => {
    render(React.createElement(SignupForm));

    const passwordInput = screen.getByLabelText(/password/i);
    expect(passwordInput.type).toBe('password');

    const toggleButton = screen.getByTestId('eye');
    fireEvent.click(toggleButton);
    expect(passwordInput.type).toBe('text');
  });

  it('disables submit button during loading', () => {
    authService.register.mockImplementation(() =>
      new Promise(resolve => setTimeout(() => resolve({ success: false, error: 'error' }), 100))
    );

    render(React.createElement(SignupForm));

    fireEvent.change(screen.getByLabelText(/full name/i), {
      target: { value: 'Test User' },
    });
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'password123' },
    });

    const submitButton = screen.getByRole('button', { name: /create account/i });
    expect(submitButton).not.toBeDisabled();

    fireEvent.click(submitButton);
    expect(submitButton).toBeDisabled();
  });

  it('has correct form structure', () => {
    render(React.createElement(SignupForm));

    const nameInput = screen.getByLabelText(/full name/i);
    const emailInput = screen.getByLabelText(/email address/i);
    const passwordInput = screen.getByLabelText(/password/i);

    expect(nameInput).toHaveAttribute('type', 'text');
    expect(emailInput).toHaveAttribute('type', 'email');
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('has correct button text', () => {
    render(React.createElement(SignupForm));

    const button = screen.getByRole('button', { name: /create account/i });
    expect(button).toBeInTheDocument();
  });
});
