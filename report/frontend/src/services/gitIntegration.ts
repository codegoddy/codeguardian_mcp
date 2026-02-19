import ApiService from './api';

// New interfaces for Git Integration OAuth
export interface GitIntegration {
  id: string;
  platform: string;
  username: string;
  connected_at: string;
  last_synced_at: string | null;
}

export interface GitRepository {
  id: number;
  name: string;
  full_name: string;
  url: string;
  default_branch: string;
  private: boolean;
  description: string | null;
}

export interface ConnectGitHubResponse {
  status: string;
  message: string;
  integration_id: string;
  username: string;
}

export interface LinkRepositoryResponse {
  status: string;
  message: string;
  repository_id: string;
}

export interface RepositoryValidateResponse {
  valid: boolean;
  repo_name?: string;
  owner?: string;
  full_name?: string;
  private?: boolean;
  error?: string;
}

export interface WebhookSetupResponse {
  success: boolean;
  webhook_id?: string;
  message: string;
  error?: string;
}

export interface AccessControlResponse {
  success: boolean;
  message: string;
  error?: string;
}

export interface PRStatusResponse {
  pr_number?: number;
  title?: string;
  state?: string;
  merged?: boolean;
  merged_at?: string;
  commit_sha?: string;
  author?: string;
  created_at?: string;
  updated_at?: string;
  error?: string;
}

export interface GitHubAutoSetupResponse {
  status: string;
  message: string;
  integration_id: string;
  username: string;
}

export const gitIntegrationApi = {
  /**
   * Validate that a repository exists and is accessible
   */
  validateRepository: async (
    provider: string, repoUrl: string
  ): Promise<RepositoryValidateResponse> => {
    return ApiService.post<RepositoryValidateResponse>('/api/git/validate-repository', { 
        provider, 
        repo_url: repoUrl 
    });
  },

  /**
   * Setup webhooks for a repository
   */
  setupWebhooks: async (
    projectId: string, provider: string, repoUrl: string, events: string[]
  ): Promise<WebhookSetupResponse> => {
    return ApiService.post<WebhookSetupResponse>('/api/git/setup-webhooks', { 
        project_id: projectId, 
        provider, 
        repo_url: repoUrl, 
        events 
    });
  },

  /**
   * Revoke repository access (for Auto-Pause)
   */
  revokeAccess: async (
    projectId: string, provider: string, repoUrl: string, username: string
  ): Promise<AccessControlResponse> => {
    return ApiService.post<AccessControlResponse>('/api/git/revoke-access', { 
        project_id: projectId, 
        provider, 
        repo_url: repoUrl, 
        username 
    });
  },

  /**
   * Restore repository access (when Auto-Pause is resolved)
   */
  restoreAccess: async (
    projectId: string, provider: string, repoUrl: string, username: string
  ): Promise<AccessControlResponse> => {
    return ApiService.post<AccessControlResponse>('/api/git/restore-access', { 
        project_id: projectId, 
        provider, 
        repo_url: repoUrl, 
        username 
    });
  },

  /**
   * Get pull request status
   */
  getPRStatus: async (
    provider: string, prUrl: string
  ): Promise<PRStatusResponse> => {
    return ApiService.get<PRStatusResponse>(
      `/api/git/pr-status?pr_url=${encodeURIComponent(prUrl)}&provider=${provider}`
    );
  },

  /**
   * Connect GitHub account via OAuth code
   */
  connectGitHub: async (code: string): Promise<ConnectGitHubResponse> => {
    return ApiService.post<ConnectGitHubResponse>('/api/integrations/git/github/connect', { code });
  },

  /**
   * Get all Git integrations for current user
   */
  listIntegrations: async (): Promise<GitIntegration[]> => {
    return ApiService.get<GitIntegration[]>('/api/integrations/git');
  },

  /**
   * Test if the GitHub integration has webhook permissions
   * This attempts to fetch repos and returns success/failure
   */
  testWebhookPermissions: async (platform: string): Promise<{ hasPermissions: boolean; error?: string }> => {
    try {
      // Try to fetch repositories - if this succeeds, basic connection works
      // Note: This doesn't guarantee webhook permissions, but if this fails,
      // we know the connection has issues
      await gitIntegrationApi.listRepositories(platform);
      return { hasPermissions: true };
    } catch (error) {
      const errorMsg = (error as Error).message || '';
      const isAuthError = errorMsg.includes('401') || 
                          errorMsg.includes('403') || 
                          errorMsg.includes('Unauthorized') ||
                          errorMsg.includes('Forbidden');
      
      return { 
        hasPermissions: false, 
        error: isAuthError 
          ? 'GitHub connection expired or lacks permissions. Please reconnect.' 
          : 'Could not verify GitHub permissions. Please try again.'
      };
    }
  },

  /**
   * List repositories from Git provider
   */
  listRepositories: async (platform: string): Promise<GitRepository[]> => {
    return ApiService.get<GitRepository[]>(`/api/integrations/git/${platform}/repositories`);
  },

  /**
   * Link a repository to a project
   */
  linkRepository: async (
    platform: string,
    repoFullName: string,
    projectId: string
  ): Promise<LinkRepositoryResponse> => {
    return ApiService.post<LinkRepositoryResponse>(`/api/integrations/git/${platform}/repositories/link`, { 
        repo_full_name: repoFullName, 
        project_id: projectId 
    });
  },

  /**
   * Disconnect Git integration
   */
  disconnectGitHub: async (platform: string): Promise<{ status: string; message: string }> => {
    return ApiService.delete<{ status: string; message: string }>(`/api/integrations/git/${platform}`);
  },

  /**
   * Auto-setup GitHub integration after OAuth signup
   * This is called automatically when a user signs up with GitHub
   */
  autoSetupGitHub: async (
    githubAccessToken: string,
    githubUsername: string
  ): Promise<GitHubAutoSetupResponse> => {
    return ApiService.post<GitHubAutoSetupResponse>('/api/auth/github-auto-setup', {
      github_access_token: githubAccessToken,
      github_username: githubUsername,
    });
  },
};

// Export standalone function for backward compatibility or direct use
export const setupGitHubWebhook = async (data: {
  project_id: string;
  repo_url: string;
  provider: string;
  events: string[];
}): Promise<WebhookSetupResponse> => {
  return gitIntegrationApi.setupWebhooks(data.project_id, data.provider, data.repo_url, data.events);
};
