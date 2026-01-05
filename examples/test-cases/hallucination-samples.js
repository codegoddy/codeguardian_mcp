/**
 * Real-world examples of AI hallucinations for testing
 * These are actual patterns seen in AI-generated code
 */
// Example 1: The "70% Wall" - AI references non-existent functions
export const scenario1 = {
    name: "Non-existent Function References",
    description: "AI generates code that calls functions that don't exist in the codebase",
    existingCodebase: `
    class UserService {
      async login(email: string, password: string) {
        // Implementation
        return { token: 'abc123', userId: 1 };
      }
      
      async getUser(id: number) {
        // Implementation
        return { id, name: 'John', email: 'john@example.com' };
      }
      
      async verifyToken(token: string) {
        // Implementation
        return token === 'abc123';
      }
    }
    
    const userService = new UserService();
  `,
    aiGeneratedCode: `
    // AI HALLUCINATION: These functions don't exist!
    async function registerNewUser(email: string, password: string) {
      // ❌ authenticateUser doesn't exist - should use login()
      const result = await userService.authenticateUser(email, password);
      
      // ❌ sendWelcomeEmail doesn't exist
      await userService.sendWelcomeEmail(result.userId);
      
      // ❌ createSession doesn't exist
      const session = await userService.createSession(result);
      
      // ❌ logUserActivity doesn't exist
      await userService.logUserActivity(result.userId, 'registration');
      
      return session;
    }
  `,
    expectedHallucinations: [
        'authenticateUser',
        'sendWelcomeEmail',
        'createSession',
        'logUserActivity'
    ],
    suggestedFixes: {
        authenticateUser: 'Use existing login() method',
        sendWelcomeEmail: 'Create this function or use external service',
        createSession: 'Create this function or use existing token',
        logUserActivity: 'Create this function or remove'
    }
};
// Example 2: Wrong Import Hallucination
export const scenario2 = {
    name: "Non-existent Import",
    description: "AI imports packages or modules that don't exist",
    existingCodebase: `
    // package.json dependencies:
    // - react: 18.0.0
    // - lodash: 4.17.21
  `,
    aiGeneratedCode: `
    // ❌ This package doesn't exist in dependencies
    import { validateEmail } from 'email-validator-pro';
    
    // ❌ This module doesn't exist in lodash
    import { deepCloneAdvanced } from 'lodash/deepCloneAdvanced';
    
    // ✅ This is correct
    import { cloneDeep } from 'lodash';
    
    function processUserEmail(email: string) {
      return validateEmail(email);
    }
  `,
    expectedHallucinations: [
        'email-validator-pro',
        'lodash/deepCloneAdvanced'
    ]
};
// Example 3: Type Hallucination
export const scenario3 = {
    name: "Type Mismatch",
    description: "AI uses incorrect types or creates non-existent type definitions",
    existingCodebase: `
    interface User {
      id: number;
      name: string;
      email: string;
    }
    
    function getUser(id: number): User {
      return { id, name: 'John', email: 'john@example.com' };
    }
  `,
    aiGeneratedCode: `
    // ❌ UserProfile interface doesn't exist
    function processUser(id: number): UserProfile {
      const user = getUser(id);
      
      // ❌ Accessing properties that don't exist on User
      return {
        ...user,
        profilePicture: user.avatar, // 'avatar' doesn't exist
        lastLogin: user.lastLoginDate, // 'lastLoginDate' doesn't exist
        preferences: user.settings // 'settings' doesn't exist
      };
    }
  `,
    expectedHallucinations: [
        'UserProfile (type)',
        'avatar (property)',
        'lastLoginDate (property)',
        'settings (property)'
    ]
};
// Example 4: Over-abstraction Hallucination
export const scenario4 = {
    name: "Unnecessary Abstractions",
    description: "AI creates interfaces/classes that are only used once",
    existingCodebase: `
    // Empty codebase
  `,
    aiGeneratedCode: `
    // ❌ Over-engineered: Interface used only once
    interface IUserProcessor {
      processUser(user: User): ProcessedUser;
    }
    
    interface IUserValidator {
      validateUser(user: User): boolean;
    }
    
    interface IUserFormatter {
      formatUser(user: User): string;
    }
    
    // Each interface has only ONE implementation - unnecessary abstraction
    class UserProcessor implements IUserProcessor {
      processUser(user: User): ProcessedUser {
        return user;
      }
    }
    
    // Simpler solution: Just use the class directly without interface
  `,
    expectedIssues: [
        'IUserProcessor - unnecessary interface',
        'IUserValidator - unnecessary interface',
        'IUserFormatter - unnecessary interface'
    ]
};
// Example 5: Python Hallucination
export const scenario5 = {
    name: "Python Function Hallucinations",
    description: "AI generates Python code with non-existent functions",
    existingCodebase: `
def get_user(user_id):
    """Get user by ID"""
    return {"id": user_id, "name": "Alice"}

def update_user(user_id, data):
    """Update user data"""
    return {"success": True}

class UserRepository:
    def find_by_id(self, user_id):
        """Find user by ID"""
        return {"id": user_id}
    
    def save(self, user):
        """Save user to database"""
        return True
  `,
    aiGeneratedCode: `
def process_user_registration(user_id, email):
    """Process new user registration"""
    user = get_user(user_id)
    
    # ❌ These functions don't exist!
    validate_user_data(user)
    send_welcome_email(email)
    create_user_profile(user)
    initialize_user_settings(user_id)
    
    # ❌ This method doesn't exist
    repo = UserRepository()
    repo.cache_user(user)
    
    return user
  `,
    expectedHallucinations: [
        'validate_user_data',
        'send_welcome_email',
        'create_user_profile',
        'initialize_user_settings',
        'cache_user (method)'
    ]
};
// Example 6: API Endpoint Hallucination
export const scenario6 = {
    name: "Non-existent API Endpoints",
    description: "AI generates code calling API endpoints that don't exist",
    existingCodebase: `
    // Existing API routes
    app.get('/api/users/:id', getUser);
    app.post('/api/users', createUser);
    app.put('/api/users/:id', updateUser);
  `,
    aiGeneratedCode: `
    async function fetchUserProfile(userId: string) {
      // ❌ This endpoint doesn't exist
      const profile = await fetch('/api/users/' + userId + '/profile');
      
      // ❌ This endpoint doesn't exist
      const settings = await fetch('/api/users/' + userId + '/settings');
      
      // ❌ This endpoint doesn't exist
      const activity = await fetch('/api/users/' + userId + '/activity');
      
      return { profile, settings, activity };
    }
  `,
    expectedHallucinations: [
        '/api/users/:id/profile',
        '/api/users/:id/settings',
        '/api/users/:id/activity'
    ]
};
// Example 7: Method Chaining Hallucination
export const scenario7 = {
    name: "Non-existent Methods in Chain",
    description: "AI creates method chains with methods that don't exist",
    existingCodebase: `
    class QueryBuilder {
      where(field: string, value: any) {
        return this;
      }
      
      orderBy(field: string) {
        return this;
      }
      
      execute() {
        return [];
      }
    }
  `,
    aiGeneratedCode: `
    const results = new QueryBuilder()
      .where('status', 'active')
      .where('verified', true)
      // ❌ These methods don't exist
      .limit(10)
      .offset(20)
      .groupBy('category')
      .having('count > 5')
      .distinct()
      .orderBy('created_at')
      .execute();
  `,
    expectedHallucinations: [
        'limit (method)',
        'offset (method)',
        'groupBy (method)',
        'having (method)',
        'distinct (method)'
    ]
};
// Example 8: Configuration Hallucination
export const scenario8 = {
    name: "Non-existent Configuration Options",
    description: "AI uses config options that don't exist",
    existingCodebase: `
    interface AppConfig {
      port: number;
      host: string;
      environment: string;
    }
    
    const config: AppConfig = {
      port: 3000,
      host: 'localhost',
      environment: 'development'
    };
  `,
    aiGeneratedCode: `
    // ❌ These config properties don't exist
    const dbUrl = config.database.url;
    const cacheEnabled = config.cache.enabled;
    const logLevel = config.logging.level;
    const apiKey = config.authentication.apiKey;
    
    // AI hallucinates nested config that doesn't exist
  `,
    expectedHallucinations: [
        'database (property)',
        'cache (property)',
        'logging (property)',
        'authentication (property)'
    ]
};
export const allScenarios = [
    scenario1,
    scenario2,
    scenario3,
    scenario4,
    scenario5,
    scenario6,
    scenario7,
    scenario8
];
