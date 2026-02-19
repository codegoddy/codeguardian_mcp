# State Management Patterns

This document outlines the state management patterns used in the DevHQ frontend application, following the separation of concerns between server state and client state.

## Overview

The application uses **TanStack Query** (React Query) for server state management and **React useState** for UI state management.

## Server State (Data from Backend)

Server state is data that comes from the backend API and needs to be synchronized with the server. This includes:
- Projects, clients, contracts
- Invoices, payments
- Settings, user profile
- Time entries, activities
- Change requests, deliverables

### How It Works

**Query Keys**
Each data type has a hierarchical key structure for cache management:

```typescript
// Example: Projects
export const projectKeys = {
  all: ["projects"] as const,
  lists: () => [...projectKeys.all, "list"] as const,
  list: (filters?: string) => [...projectKeys.lists(), { filters }] as const,
  details: () => [...projectKeys.all, "detail"] as const,
  detail: (id: string) => [...projectKeys.details(), id] as const,
};
```

**Data Fetching (useQuery)**
Used for GET requests to fetch data from the server:

```typescript
export function useProjects() {
  const { isAuthenticated, isInitialized } = useAuthContext();

  return useQuery({
    queryKey: projectKeys.lists(),
    queryFn: projectsApi.getProjects,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
    enabled: isInitialized && isAuthenticated, // Only fetch when auth is ready
  });
}
```

**Data Modification (useMutation)**
Used for POST/PUT/DELETE requests to modify server data:

```typescript
export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ProjectCreate) => projectsApi.createProject(data),
    onSuccess: () => {
      // Invalidate affected queries to refresh data
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
    onError: (error) => {
      console.error("Failed to create project:", error);
    },
  });
}
```

### Existing Hooks

The following React Query hooks are available:

- `useProjects()` - Fetch and manage projects
- `useClients()` - Fetch and manage clients
- `useContracts()` - Fetch and manage contracts
- `useInvoices()` - Fetch and manage invoices
- `useSettings()` - Fetch and manage user settings
- `useChangeRequests()` - Fetch and manage change requests
- `useDashboard()` - Combined hook for dashboard data (projects, budget warnings, pending change requests)

### Usage in Components

```typescript
// In a component
function ProjectsPage() {
  const { data: projects, isLoading, isError, error } = useProjects();
  const createProject = useCreateProject();

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorDisplay error={error} />;

  return (
    <div>
      {projects?.map(project => (
        <ProjectCard key={project.id} project={project} />
      ))}
      <button onClick={() => createProject.mutateAsync(newProject)}>
        Create Project
      </button>
    </div>
  );
}
```

## Client State (UI Only)

Client state is data that exists only in the frontend and is not stored on the server. This includes:
- Modal open/close states
- Selected items (selected project, selected client, etc.)
- Form input values
- Tab selection
- Filter values
- Sidebar states

### How It Works

Use React's built-in `useState` hook for UI state:

```typescript
function ProjectsPage() {
  // UI STATE: Modal states (client state)
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  // UI STATE: Filter value (client state)
  const [filterValue, setFilterValue] = useState<string>("all");

  // UI STATE: Tab selection (client state)
  const [activeTab, setActiveTab] = useState<"projects" | "templates" | "contract">("projects");

  // SERVER STATE: Data from backend (TanStack Query)
  const { data: projects, isLoading } = useProjects(filterValue);

  return (
    // UI component using both client and server state
  );
}
```

## Best Practices

### DO - Server State

✅ Use React Query (`useQuery`) for fetching data
✅ Use React Query (`useMutation`) for modifying data
✅ Invalidate queries after mutations to refresh data
✅ Use query keys for cache management
✅ Bundle related queries into a single hook (e.g., `useProjectsBundle`)

### DON'T - Server State

❌ Don't use `useState` for data from the backend
❌ Don't use `useEffect` to fetch data on mount (React Query handles this)
❌ Don't manually call API endpoints in components (use hooks instead)
❌ Don't mix server state with UI state in `useState`

### DO - Client State

✅ Use `useState` for modal states
✅ Use `useState` for form inputs
✅ Use `useState` for selected items
✅ Use `useState` for filter values
✅ Keep UI state local to the component

### DON'T - Client State

❌ Don't store API data in `useState`
❌ Don't try to sync `useState` with React Query cache
❌ Don't use global state (Zustand) for UI-only data
❌ Don't persist UI state to localStorage (unless required)

## Common Patterns

### Loading and Error States

```typescript
function ProjectsPage() {
  const { data: projects, isLoading, isError, error } = useProjects();

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorDisplay error={error} />;

  return <ProjectList projects={projects} />;
}
```

### Bundle Hooks for Convenience

```typescript
// Combined hook that provides all related operations
export function useProjectsBundle() {
  const projectsQuery = useProjects();
  const createMutation = useCreateProject();
  const updateMutation = useUpdateProject();
  const deleteMutation = useDeleteProject();

  return {
    projects: projectsQuery.data,
    isLoading: projectsQuery.isLoading,
    createProject: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    updateProject: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    deleteProject: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  };
}

// Usage
function ProjectsPage() {
  const {
    projects,
    isLoading,
    createProject,
    isCreating,
  } = useProjectsBundle();

  return (
    <button onClick={() => createProject(newData)} disabled={isCreating}>
      Create Project
    </button>
  );
}
```

### Dashboard-Specific Data Transformation

```typescript
// useDashboard hook transforms raw API data into dashboard-specific formats
export function useDashboard() {
  const projectsQuery = useProjects();
  const changeRequestsQuery = useChangeRequests();

  const projectsData = useMemo(() => {
    if (!projectsQuery.data) return [];

    // Transform raw API data into ProjectStatus format
    return projectsQuery.data.map((project) => ({
      ...project,
      status: determineProjectStatus(project),
      budgetPercentage: calculateBudgetPercentage(project),
    }));
  }, [projectsQuery.data]);

  const budgetWarnings = useMemo(() => {
    // Derive warnings from projects
    return projectsData.filter(project => project.budgetPercentage < 20);
  }, [projectsData]);

  return {
    projects: projectsData,
    budgetWarnings,
    isLoading: projectsQuery.isLoading || changeRequestsQuery.isLoading,
    isError: projectsQuery.isError || changeRequestsQuery.isError,
  };
}
```

## Benefits of This Approach

1. **Separation of Concerns**: Clear distinction between server state and client state
2. **Automatic Caching**: React Query handles caching and revalidation
3. **Optimistic Updates**: React Query supports optimistic updates
4. **Error Handling**: Built-in retry logic and error states
5. **Loading States**: Automatic loading state management
6. **Less Boilerplate**: No need for useEffect + useState pattern for data fetching
7. **Better Performance**: Intelligent caching and background refetching
8. **Type Safety**: Full TypeScript support

## Migration Checklist

When adding new features, follow this checklist:

- [ ] Create React Query hooks for data fetching (`useQuery`)
- [ ] Create React Query hooks for data modification (`useMutation`)
- [ ] Define query keys hierarchy
- [ ] Add proper cache invalidation in mutations
- [ ] Use `useState` only for UI state
- [ ] Test loading and error states
- [ ] Update this documentation

## Resources

- [TanStack Query Documentation](https://tanstack.com/query/latest)
- [React State Management](https://react.dev/learn/state-a-components-summary)
