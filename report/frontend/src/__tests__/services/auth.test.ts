import { authService } from '@/services/auth';

describe('Auth Service', () => {
  let mockFetch;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch = jest.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    delete global.fetch;
  });

  describe('login', () => {
    it('returns success response on valid login', async () => {
      const mockResponse = {
        access_token: 'test-token',
        refresh_token: 'refresh-token',
        token_type: 'bearer',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponse),
        headers: new Headers({ 'X-CSRF-Token': 'csrf-token' }),
      });

      const credentials = {
        email: 'test@example.com',
        password: 'password123',
      };

      const result = await authService.login(credentials);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth-cookies/login'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(credentials),
        })
      );
    });

    it('returns error response on failed login', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: jest.fn().mockResolvedValue({ detail: 'Invalid credentials' }),
        status: 401,
        headers: new Headers(),
      });

      const credentials = {
        email: 'test@example.com',
        password: 'wrongpassword',
      };

      const result = await authService.login(credentials);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid credentials');
    });
  });

  describe('register', () => {
    it('returns success response on valid registration', async () => {
      const mockResponse = {
        access_token: 'test-token',
        refresh_token: 'refresh-token',
        token_type: 'bearer',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponse),
        headers: new Headers({ 'X-CSRF-Token': 'csrf-token' }),
      });

      const registerData = {
        email: 'newuser@example.com',
        password: 'password123',
        full_name: 'New User',
      };

      const result = await authService.register(registerData);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth-cookies/register'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(registerData),
        })
      );
    });

    it('returns error response on failed registration', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: jest.fn().mockResolvedValue({ detail: 'Email already exists' }),
        status: 400,
        headers: new Headers(),
      });

      const registerData = {
        email: 'existing@example.com',
        password: 'password123',
        full_name: 'Existing User',
      };

      const result = await authService.register(registerData);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Email already exists');
    });
  });

  describe('logout', () => {
    it('calls logout endpoint successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ message: 'Logged out successfully' }),
        headers: new Headers(),
      });

      const result = await authService.logout();

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth-cookies/logout'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('getCurrentUser', () => {
    it('returns current user data', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        fullName: 'Test User',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(mockUser),
        headers: new Headers(),
      });

      const result = await authService.getCurrentUser();

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockUser);
    });

    it('returns error when not authenticated', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: jest.fn().mockResolvedValue({ detail: 'Not authenticated' }),
        status: 401,
        headers: new Headers(),
      });

      const result = await authService.getCurrentUser();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('verifyOtp', () => {
    it('verifies OTP successfully', async () => {
      const mockResponse = {
        access_token: 'test-token',
        refresh_token: 'refresh-token',
        token_type: 'bearer',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponse),
        headers: new Headers(),
      });

      const result = await authService.verifyOtp({
        email: 'test@example.com',
        otp: '123456',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResponse);
    });

    it('returns error on invalid OTP', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: jest.fn().mockResolvedValue({ detail: 'Invalid OTP' }),
        status: 400,
        headers: new Headers(),
      });

      const result = await authService.verifyOtp({
        email: 'test@example.com',
        otp: '000000',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid OTP');
    });
  });

  describe('resendOtp', () => {
    it('resends OTP successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ message: 'OTP sent' }),
        headers: new Headers(),
      });

      const result = await authService.resendOtp({ email: 'test@example.com' });

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth-cookies/resend-otp'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('forgotPassword', () => {
    it('requests password reset successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ message: 'Password reset email sent' }),
        headers: new Headers(),
      });

      const result = await authService.forgotPassword({ email: 'test@example.com' });

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth-cookies/forgot-password'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });
});
