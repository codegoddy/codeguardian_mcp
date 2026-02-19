/**
 * Authentication Migration Utility
 * 
 * Helps transition from localStorage-based auth to HTTP-only cookie-based auth
 */

/**
 * Cleans up old localStorage tokens from pre-cookie implementation
 * This runs automatically on app initialization
 */
export function cleanupOldAuthTokens(): void {
  const oldAccessToken = localStorage.getItem('access_token');
  const oldRefreshToken = localStorage.getItem('refresh_token');
  
  if (oldAccessToken || oldRefreshToken) {
    console.warn('[AUTH MIGRATION] Found old localStorage tokens - cleaning up...');
    
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    
    console.info('[AUTH MIGRATION] ✅ Old tokens removed from localStorage');
    console.info('[AUTH MIGRATION] ℹ️ Authentication now uses secure HTTP-only cookies');
    
    // Show user-friendly notification if in browser
    if (typeof window !== 'undefined' && oldAccessToken) {
      console.info('[AUTH MIGRATION] 🔒 Your authentication is now more secure!');
    }
  }
}

/**
 * Checks if user has old localStorage tokens that need migration
 */
export function hasOldAuthTokens(): boolean {
  return !!(
    localStorage.getItem('access_token') || 
    localStorage.getItem('refresh_token')
  );
}

/**
 * Gets a summary of current auth storage state (for debugging)
 */
export function getAuthStorageState() {
  return {
    localStorage: {
      hasAccessToken: !!localStorage.getItem('access_token'),
      hasRefreshToken: !!localStorage.getItem('refresh_token'),
      hasUserEmail: !!localStorage.getItem('user_email'),
      hasUserFullName: !!localStorage.getItem('user_fullName'),
    },
    cookies: {
      // Note: Can't read HTTP-only cookies from JavaScript (by design)
      message: 'HTTP-only cookies are not accessible via JavaScript (this is secure)',
    },
  };
}

/**
 * Force logout and clear all auth data
 * Useful for complete auth reset
 */
export function clearAllAuthData(): void {
  // Clear localStorage tokens
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  
  // Clear user data
  localStorage.removeItem('user_email');
  localStorage.removeItem('user_fullName');
  localStorage.removeItem('user_provider');
  localStorage.removeItem('user_profileImageUrl');
  
  console.info('[AUTH] All auth data cleared from localStorage');
  console.info('[AUTH] Note: HTTP-only cookies can only be cleared by the server');
}
