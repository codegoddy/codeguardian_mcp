// Mock API service layer for testing

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Reset all mocks
const resetMocks = () => {
  mockFetch.mockReset();
};

// Mock API responses
const mockApiResponses = {
  success: { success: true, data: {} },
  error: { success: false, error: 'Mock error' },
};

// Auth service mocks
const mockAuthService = {
  login: jest.fn(),
  register: jest.fn(),
  logout: jest.fn(),
  getCurrentUser: jest.fn(),
  verifyOtp: jest.fn(),
  resendOtp: jest.fn(),
  forgotPassword: jest.fn(),
};

// API service mock
const mockApiCall = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  patch: jest.fn(),
  delete: jest.fn(),
};

// Helper to create mock API responses
const createMockResponse = (data: unknown, success = true) => ({
  success,
  data: success ? data : undefined,
  error: success ? undefined : data,
});

// Helper to mock successful API calls
const mockSuccessfulApiCall = (data: unknown) => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: jest.fn().mockResolvedValue(data),
    headers: new Headers(),
  });
};

// Helper to mock failed API calls
const mockFailedApiCall = (error: unknown) => {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    json: jest.fn().mockResolvedValue({ detail: error }),
    status: 400,
    headers: new Headers(),
  });
};

// Mock delay for async operations
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export {
  resetMocks,
  mockApiResponses,
  mockAuthService,
  mockApiCall,
  createMockResponse,
  mockSuccessfulApiCall,
  mockFailedApiCall,
  delay,
};
