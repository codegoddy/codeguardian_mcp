import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { gitIntegrationApi } from '@/services/gitIntegration';
import type {
  GitIntegration,
  GitRepository,
  ConnectGitHubResponse,
  LinkRepositoryResponse,
} from '@/services/gitIntegration';

/**
 * Hook to fetch all Git integrations
 */
export const useGitIntegrations = () => {
  return useQuery<GitIntegration[], Error>({
    queryKey: ['git-integrations'],
    queryFn: () => gitIntegrationApi.listIntegrations(),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
};

/**
 * Hook to fetch repositories from a Git provider
 */
export const useGitRepositories = (platform: string, enabled: boolean = true) => {
  return useQuery<GitRepository[], Error>({
    queryKey: ['git-repositories', platform],
    queryFn: () => gitIntegrationApi.listRepositories(platform),
    enabled,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
};

/**
 * Hook to connect GitHub account
 */
export const useConnectGitHub = () => {
  const queryClient = useQueryClient();

  return useMutation<ConnectGitHubResponse, Error, string>({
    mutationFn: (code: string) => gitIntegrationApi.connectGitHub(code),
    onSuccess: () => {
      // Invalidate and refetch integrations
      queryClient.invalidateQueries({ queryKey: ['git-integrations'] });
    },
  });
};

/**
 * Hook to link repository to project
 */
export const useLinkRepository = () => {
  const queryClient = useQueryClient();

  return useMutation<
    LinkRepositoryResponse,
    Error,
    { platform: string; repoFullName: string; projectId: string }
  >({
    mutationFn: ({ platform, repoFullName, projectId }) =>
      gitIntegrationApi.linkRepository(platform, repoFullName, projectId),
    onSuccess: () => {
      // Invalidate repositories query
      queryClient.invalidateQueries({ queryKey: ['git-repositories'] });
    },
  });
};

/**
 * Hook to disconnect Git integration
 */
export const useDisconnectGit = () => {
  const queryClient = useQueryClient();

  return useMutation<{ status: string; message: string }, Error, string>({
    mutationFn: (platform: string) => gitIntegrationApi.disconnectGitHub(platform),
    onSuccess: () => {
      // Invalidate and refetch integrations
      queryClient.invalidateQueries({ queryKey: ['git-integrations'] });
      queryClient.invalidateQueries({ queryKey: ['git-repositories'] });
    },
  });
};
