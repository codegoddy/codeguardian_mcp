import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  projectsApi, 
  Project, 
  ProjectCreateWithScopeGuardrail, 
  ProjectUpdate,
  ProjectMetrics,
  ScopeGuardrailConfig
} from "../services/projects";
import { useAuthContext } from "../contexts/AuthContext";

export const projectKeys = {
  all: ["projects"] as const,
  lists: () => [...projectKeys.all, "list"] as const,
  list: (filters?: string) => [...projectKeys.lists(), { filters }] as const,
  details: () => [...projectKeys.all, "detail"] as const,
  detail: (id: string) => [...projectKeys.details(), id] as const,
  metrics: (id: string) => [...projectKeys.detail(id), "metrics"] as const,
};

export function useProjects(statusFilter?: string) {
  const { isAuthenticated, isInitialized } = useAuthContext();

  console.log('[useProjects] isInitialized:', isInitialized, 'isAuthenticated:', isAuthenticated, 'statusFilter:', statusFilter);

  return useQuery({
    queryKey: projectKeys.list(statusFilter),
    queryFn: () => {
      console.log('[useProjects] Fetching projects data...');
      return projectsApi.getProjects(statusFilter);
    },
    staleTime: 5 * 60 * 1000,
    retry: 2,
    enabled: isInitialized && isAuthenticated,
  });
}

export function useProject(projectId: string) {
  const { isAuthenticated, isInitialized } = useAuthContext();

  return useQuery({
    queryKey: projectKeys.detail(projectId),
    queryFn: () => projectsApi.getProject(projectId),
    staleTime: 5 * 60 * 1000,
    retry: 2,
    enabled: isInitialized && isAuthenticated && !!projectId,
  });
}

export function useProjectMetrics(projectId: string) {
  const { isAuthenticated, isInitialized } = useAuthContext();

  return useQuery({
    queryKey: projectKeys.metrics(projectId),
    queryFn: () => projectsApi.getMetrics(projectId),
    staleTime: 2 * 60 * 1000,
    retry: 2,
    enabled: isInitialized && isAuthenticated && !!projectId,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ProjectCreateWithScopeGuardrail) => 
      projectsApi.createProjectWithScopeGuardrail(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
    onError: (error) => {
      console.error("Failed to create project:", error);
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ProjectUpdate }) =>
      projectsApi.updateProject(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
    },
    onError: (error) => {
      console.error("Failed to update project:", error);
    },
  });
}

export function useConfigureScopeGuardrail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, config }: { id: string; config: ScopeGuardrailConfig }) =>
      projectsApi.configureScopeGuardrail(id, config),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(variables.id) });
    },
    onError: (error) => {
      console.error("Failed to configure scope guardrail:", error);
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => projectsApi.deleteProject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
    onError: (error) => {
      console.error("Failed to delete project:", error);
    },
  });
}

export function useProjectsBundle(statusFilter?: string) {
  const projectsQuery = useProjects(statusFilter);
  const createMutation = useCreateProject();
  const updateMutation = useUpdateProject();
  const configureMutation = useConfigureScopeGuardrail();

  return {
    projects: projectsQuery.data,
    isLoading: projectsQuery.isLoading,
    isError: projectsQuery.isError,
    error: projectsQuery.error,
    refetch: projectsQuery.refetch,
    createProject: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    createError: createMutation.error,
    updateProject: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error,
    configureScopeGuardrail: configureMutation.mutateAsync,
    isConfiguring: configureMutation.isPending,
    configureError: configureMutation.error,
    isAnyLoading:
      projectsQuery.isLoading ||
      createMutation.isPending ||
      updateMutation.isPending ||
      configureMutation.isPending,
  };
}

export function usePrefetchProjects() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.prefetchQuery({
      queryKey: projectKeys.lists(),
      queryFn: () => projectsApi.getProjects(),
    });
  };
}

export type { Project, ProjectCreateWithScopeGuardrail, ProjectUpdate, ProjectMetrics, ScopeGuardrailConfig };
