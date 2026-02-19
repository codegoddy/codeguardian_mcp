import React from 'react';

import '@testing-library/jest-dom';

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  Loader2: ({ className, size }) => (
    React.createElement('svg', { className, width: size || 24, height: size || 24, viewBox: '0 0 24 24', 'data-testid': 'loader-icon' },
      React.createElement('circle', { cx: '12', cy: '12', r: '10', stroke: 'currentColor', strokeWidth: '4', fill: 'none' })
    )
  ),
  Github: ({ className }) => (
    React.createElement('svg', { className, viewBox: '0 0 24 24', 'data-testid': 'github-icon' },
      React.createElement('path', { fill: 'currentColor', d: 'M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z' })
    )
  ),
  Gitlab: ({ className }) => (
    React.createElement('svg', { className, viewBox: '0 0 24 24', 'data-testid': 'gitlab-icon' },
      React.createElement('path', { fill: 'currentColor', d: 'M12 0L1.5 17.5h21L12 0z' })
    )
  ),
  Eye: ({ className, size }) => (
    React.createElement('svg', { className, width: size || 24, height: size || 24, viewBox: '0 0 24 24', 'data-testid': 'eye-icon' },
      React.createElement('path', { fill: 'none', stroke: 'currentColor', strokeWidth: '2', d: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z' }),
      React.createElement('circle', { cx: '12', cy: '12', r: '3' })
    )
  ),
  EyeOff: ({ className, size }) => (
    React.createElement('svg', { className, width: size || 24, height: size || 24, viewBox: '0 0 24 24', 'data-testid': 'eye-off-icon' },
      React.createElement('path', { fill: 'none', stroke: 'currentColor', strokeWidth: '2', d: 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24' }),
      React.createElement('line', { x1: '1', y1: '1', x2: '23', y2: '23', stroke: 'currentColor', strokeWidth: '2' })
    )
  ),
}));

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
  }),
  useSearchParams: () => ({
    get: jest.fn(),
    toString: jest.fn(),
  }),
  usePathname: () => '/',
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

// Mock @/contexts/AuthContext
jest.mock('@/contexts/AuthContext', () => ({
  useAuthContext: () => ({
    user: null,
    loading: false,
    refreshAuth: jest.fn(),
    logout: jest.fn(),
  }),
}));

// Mock next/link
jest.mock('next/link', () => {
  const MockLink = ({ children, href }) => React.createElement('a', { href }, children);
  MockLink.displayName = 'MockLink';
  return MockLink;
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock window.alert
window.alert = jest.fn();

// Mock window.location
delete window.location;
window.location = {
  href: 'http://localhost:3000',
  pathname: '/',
  search: '',
  hash: '',
  protocol: 'http:',
  host: 'localhost:3000',
  assign: jest.fn(),
  replace: jest.fn(),
  reload: jest.fn(),
};

// Mock ResizeObserver
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Suppress console.error for cleaner test output
const originalError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning: ReactDOM.render is no longer supported')
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});
