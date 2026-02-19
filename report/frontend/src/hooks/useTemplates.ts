import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { templatesApi, TemplateCreate, TemplateUpdate } from "../services/templates";
import { useAuthContext } from "../contexts/AuthContext";

export const templateKeys = {
  all: ["templates"] as const,
  lists: () => [...templateKeys.all, "list"] as const,
  system: () => [...templateKeys.lists(), "system"] as const,
  custom: () => [...templateKeys.lists(), "custom"] as const,
  details: () => [...templateKeys.all, "detail"] as const,
  detail: (id: string) => [...templateKeys.details(), id] as const,
};

// Fetch all templates (system + custom)
export function useAllTemplates() {
  const { isAuthenticated, isInitialized } = useAuthContext();

  return useQuery({
    queryKey: templateKeys.lists(),
    queryFn: () => templatesApi.getAllTemplates(),
    staleTime: 10 * 60 * 1000, // 10 minutes - templates don't change often
    retry: 2,
    enabled: isInitialized && isAuthenticated,
  });
}

// Fetch system templates only
export function useSystemTemplates(enabled: boolean = true) {
  const { isAuthenticated, isInitialized } = useAuthContext();

  return useQuery({
    queryKey: templateKeys.system(),
    queryFn: () => templatesApi.getSystemTemplates(),
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: 2,
    enabled: enabled && isInitialized && isAuthenticated,
  });
}

// Fetch custom (user) templates only
export function useCustomTemplates(enabled: boolean = true) {
  const { isAuthenticated, isInitialized } = useAuthContext();

  return useQuery({
    queryKey: templateKeys.custom(),
    queryFn: () => templatesApi.getCustomTemplates(),
    staleTime: 5 * 60 * 1000, // 5 minutes - custom templates may change more often
    retry: 2,
    enabled: enabled && isInitialized && isAuthenticated,
  });
}

// Fetch a single template
export function useTemplate(templateId: string) {
  const { isAuthenticated, isInitialized } = useAuthContext();

  return useQuery({
    queryKey: templateKeys.detail(templateId),
    queryFn: () => templatesApi.getTemplate(templateId),
    staleTime: 10 * 60 * 1000,
    retry: 2,
    enabled: isInitialized && isAuthenticated && !!templateId,
  });
}

// Create a new template
export function useCreateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: TemplateCreate) => templatesApi.createTemplate(data),
    onSuccess: () => {
      // Invalidate custom and all template queries
      queryClient.invalidateQueries({ queryKey: templateKeys.custom() });
      queryClient.invalidateQueries({ queryKey: templateKeys.lists() });
    },
    onError: (error) => {
      console.error("Failed to create template:", error);
    },
  });
}

// Update a template
export function useUpdateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: TemplateUpdate }) =>
      templatesApi.updateTemplate(id, data),
    onSuccess: (_, variables) => {
      // Invalidate specific template and all lists
      queryClient.invalidateQueries({ queryKey: templateKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: templateKeys.custom() });
      queryClient.invalidateQueries({ queryKey: templateKeys.lists() });
    },
    onError: (error) => {
      console.error("Failed to update template:", error);
    },
  });
}

// Delete a template
export function useDeleteTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (templateId: string) => templatesApi.deleteTemplate(templateId),
    onSuccess: () => {
      // Invalidate custom and all template queries
      queryClient.invalidateQueries({ queryKey: templateKeys.custom() });
      queryClient.invalidateQueries({ queryKey: templateKeys.lists() });
    },
    onError: (error) => {
      console.error("Failed to delete template:", error);
    },
  });
}

// Bundle hook for templates tab
export function useTemplatesBundle() {
  const systemTemplates = useSystemTemplates();
  const customTemplates = useCustomTemplates();
  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate();
  const deleteTemplate = useDeleteTemplate();

  return {
    // System templates
    systemTemplates: systemTemplates.data ?? [],
    isLoadingSystemTemplates: systemTemplates.isLoading,
    isErrorSystemTemplates: systemTemplates.isError,
    systemTemplatesError: systemTemplates.error,

    // Custom templates
    customTemplates: customTemplates.data ?? [],
    isLoadingCustomTemplates: customTemplates.isLoading,
    isErrorCustomTemplates: customTemplates.isError,
    customTemplatesError: customTemplates.error,

    // Combined loading state
    isLoadingTemplates: systemTemplates.isLoading || customTemplates.isLoading,

    // Mutations
    createTemplate: createTemplate.mutateAsync,
    isCreating: createTemplate.isPending,
    
    updateTemplate: updateTemplate.mutateAsync,
    isUpdating: updateTemplate.isPending,
    
    deleteTemplate: deleteTemplate.mutateAsync,
    isDeleting: deleteTemplate.isPending,

    // Refetch
    refetchAll: () => {
      systemTemplates.refetch();
      customTemplates.refetch();
    },
  };
}

// Prefetch hook
export function usePrefetchTemplates() {
  const queryClient = useQueryClient();
  const { isAuthenticated, isInitialized } = useAuthContext();

  return () => {
    if (isInitialized && isAuthenticated) {
      queryClient.prefetchQuery({
        queryKey: templateKeys.system(),
        queryFn: () => templatesApi.getSystemTemplates(),
        staleTime: 10 * 60 * 1000,
      });
      queryClient.prefetchQuery({
        queryKey: templateKeys.custom(),
        queryFn: () => templatesApi.getCustomTemplates(),
        staleTime: 5 * 60 * 1000,
      });
    }
  };
}
