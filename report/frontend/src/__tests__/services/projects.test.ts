import { projectsApi } from '@/services/projects';

jest.mock('@/services/api', () => ({
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  patch: jest.fn(),
  delete: jest.fn(),
}));

import * as ApiService from '@/services/api';

describe('Projects API Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getProjects', () => {
    it('fetches all projects without filter', async () => {
      const mockProjects = [
        {
          id: 'proj-1',
          user_id: 'user-1',
          client_id: 'client-1',
          name: 'Project 1',
          description: null,
          start_date: '2024-01-01',
          due_date: '2024-12-31',
          status: 'active',
          project_id: 'proj-1',
          project_budget: 10000,
          current_budget_remaining: 5000,
          auto_replenish: false,
          auto_pause_threshold: 20,
          max_revisions: 3,
          current_revision_count: 1,
          allowed_repositories: ['repo1'],
          time_tracker_provider: null,
          time_tracker_project_name: null,
          contract_type: null,
          contract_file_url: null,
          contract_pdf_url: null,
          contract_signed: false,
          contract_signed_at: null,
          total_hours_tracked: 100,
          total_revenue: 5000,
          scope_deviation_percentage: 0,
          change_request_value_added: 0,
          created_at: '2024-01-01',
          updated_at: '2024-01-01',
        },
      ];

      ApiService.get.mockResolvedValueOnce(mockProjects);

      const result = await projectsApi.getProjects();

      expect(result).toEqual(mockProjects);
      expect(ApiService.get).toHaveBeenCalledWith('/api/projects');
    });

    it('fetches projects with status filter', async () => {
      const mockProjects = [];

      ApiService.get.mockResolvedValueOnce(mockProjects);

      await projectsApi.getProjects('active');

      expect(ApiService.get).toHaveBeenCalledWith('/api/projects?status_filter=active');
    });
  });

  describe('getProject', () => {
    it('fetches single project by ID', async () => {
      const mockProject = {
        id: 'proj-1',
        user_id: 'user-1',
        client_id: 'client-1',
        name: 'Test Project',
        description: 'A test project',
        start_date: '2024-01-01',
        due_date: '2024-12-31',
        status: 'active',
        project_id: 'proj-1',
        project_budget: 10000,
        current_budget_remaining: 5000,
        auto_replenish: false,
        auto_pause_threshold: 20,
        max_revisions: 3,
        current_revision_count: 1,
        allowed_repositories: null,
        time_tracker_provider: null,
        time_tracker_project_name: null,
        contract_type: null,
        contract_file_url: null,
        contract_pdf_url: null,
        contract_signed: false,
        contract_signed_at: null,
        total_hours_tracked: 100,
        total_revenue: 5000,
        scope_deviation_percentage: 0,
        change_request_value_added: 0,
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      };

      ApiService.get.mockResolvedValueOnce(mockProject);

      const result = await projectsApi.getProject('proj-1');

      expect(result).toEqual(mockProject);
      expect(ApiService.get).toHaveBeenCalledWith('/api/projects/proj-1');
    });
  });

  describe('createProjectWithScopeGuardrail', () => {
    it('creates project with scope guardrail config', async () => {
      const createData = {
        client_id: 'client-1',
        name: 'New Project',
        description: 'A new project',
        start_date: '2024-01-01',
        due_date: '2024-12-31',
        project_id: 'new-proj',
        project_budget: 10000,
        auto_pause_threshold: 20,
        max_revisions: 3,
        allowed_repositories: ['repo1'],
      };

      const mockCreatedProject = {
        id: 'new-proj',
        user_id: 'user-1',
        client_id: 'client-1',
        name: 'New Project',
        description: 'A new project',
        start_date: '2024-01-01',
        due_date: '2024-12-31',
        status: 'active',
        project_id: 'new-proj',
        project_budget: 10000,
        current_budget_remaining: 10000,
        auto_replenish: false,
        auto_pause_threshold: 20,
        max_revisions: 3,
        current_revision_count: 0,
        allowed_repositories: ['repo1'],
        time_tracker_provider: null,
        time_tracker_project_name: null,
        contract_type: null,
        contract_file_url: null,
        contract_pdf_url: null,
        contract_signed: false,
        contract_signed_at: null,
        total_hours_tracked: 0,
        total_revenue: 0,
        scope_deviation_percentage: 0,
        change_request_value_added: 0,
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      };

      ApiService.post.mockResolvedValueOnce(mockCreatedProject);

      const result = await projectsApi.createProjectWithScopeGuardrail(createData);

      expect(result).toEqual(mockCreatedProject);
      expect(ApiService.post).toHaveBeenCalledWith('/api/projects/with-scope-guardrail', createData);
    });
  });

  describe('updateProject', () => {
    it('updates project with partial data', async () => {
      const updateData = {
        name: 'Updated Project Name',
        status: 'completed',
      };

      const mockUpdatedProject = {
        id: 'proj-1',
        user_id: 'user-1',
        client_id: 'client-1',
        name: 'Updated Project Name',
        description: null,
        start_date: '2024-01-01',
        due_date: '2024-12-31',
        status: 'completed',
        project_id: 'proj-1',
        project_budget: 10000,
        current_budget_remaining: 5000,
        auto_replenish: false,
        auto_pause_threshold: 20,
        max_revisions: 3,
        current_revision_count: 1,
        allowed_repositories: null,
        time_tracker_provider: null,
        time_tracker_project_name: null,
        contract_type: null,
        contract_file_url: null,
        contract_pdf_url: null,
        contract_signed: false,
        contract_signed_at: null,
        total_hours_tracked: 100,
        total_revenue: 5000,
        scope_deviation_percentage: 0,
        change_request_value_added: 0,
        created_at: '2024-01-01',
        updated_at: '2024-06-01',
      };

      ApiService.put.mockResolvedValueOnce(mockUpdatedProject);

      const result = await projectsApi.updateProject('proj-1', updateData);

      expect(result).toEqual(mockUpdatedProject);
      expect(ApiService.put).toHaveBeenCalledWith('/api/projects/proj-1', updateData);
    });
  });

  describe('getMetrics', () => {
    it('fetches project metrics', async () => {
      const mockMetrics = {
        total_hours_tracked: 150,
        total_revenue: 7500,
        budget_remaining: 2500,
        budget_used_percentage: 75,
        scope_deviation_percentage: 5,
        change_request_value_added: 500,
        deliverables_completed: 8,
        deliverables_total: 10,
        change_requests_approved: 2,
        change_requests_total: 3,
      };

      ApiService.get.mockResolvedValueOnce(mockMetrics);

      const result = await projectsApi.getMetrics('proj-1');

      expect(result).toEqual(mockMetrics);
      expect(ApiService.get).toHaveBeenCalledWith('/api/projects/proj-1/metrics');
    });
  });

  describe('deleteProject', () => {
    it('deletes project by ID', async () => {
      ApiService.delete.mockResolvedValueOnce(undefined);

      await projectsApi.deleteProject('proj-1');

      expect(ApiService.delete).toHaveBeenCalledWith('/api/projects/proj-1');
    });
  });
});
