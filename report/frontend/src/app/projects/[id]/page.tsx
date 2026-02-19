'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { projectsApi, Project, ProjectMetrics } from '@/services/projects';
import AuthGuard from '@/components/AuthGuard';
import LoadingSpinner from '@/components/LoadingSpinner';
import RetainerBalanceWidget from '@/components/RetainerBalanceWidget';
import AutoPauseBanner from '@/components/AutoPauseBanner';
import BudgetHistory from '@/components/BudgetHistory';
import MilestoneSection from '@/components/MilestoneSection';
import { 
  GitBranch, 
  Clock, 
  TrendingUp, 
  AlertTriangle,
  CheckCircle,
  Users
} from 'lucide-react';

export default function ProjectDashboard() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  
  const [project, setProject] = useState<Project | null>(null);
  const [metrics, setMetrics] = useState<ProjectMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Mock budget history data - in production, this would come from an API
  const [budgetHistory] = useState([
    {
      id: '1',
      type: 'addition' as const,
      amount: 5000,
      description: 'Initial project budget',
      timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      balance_after: 5000
    },
    {
      id: '2',
      type: 'deduction' as const,
      amount: 150,
      description: 'Time entry: Implemented user authentication',
      timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      balance_after: 4850
    },
    {
      id: '3',
      type: 'deduction' as const,
      amount: 200,
      description: 'Time entry: Built API endpoints',
      timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      balance_after: 4650
    },
  ]);

  useEffect(() => {
    loadProjectData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const loadProjectData = async () => {
    try {
      setLoading(true);
      const [projectData, metricsData] = await Promise.all([
        projectsApi.getProject(projectId),
        projectsApi.getMetrics(projectId),
      ]);
      setProject(projectData);
      setMetrics(metricsData);
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to load project data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { color: string; text: string }> = {
      awaiting_contract: { color: 'bg-gray-100 text-gray-800', text: 'Awaiting Contract' },
      contract_sent: { color: 'bg-blue-100 text-blue-800', text: 'Contract Sent' },
      active: { color: 'bg-green-100 text-green-800', text: 'Active' },
      paused: { color: 'bg-red-100 text-red-800', text: 'Paused' },
      completed: { color: 'bg-gray-100 text-gray-800', text: 'Completed' },
      cancelled: { color: 'bg-gray-100 text-gray-800', text: 'Cancelled' },
    };
    const badge = badges[status] || badges.active;
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
        {badge.text}
      </span>
    );
  };

  if (loading) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <LoadingSpinner size="lg" color="black" />
          <span className="ml-3 text-gray-400">Loading project...</span>
        </div>
      </AuthGuard>
    );
  }

  if (error || !project || !metrics) {
    return (
      <AuthGuard>
        <div className="min-h-screen" style={{ backgroundColor: '#F5F5F5' }}>
          <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
            <div className="bg-white rounded-2xl p-8 text-center" style={{ border: '1px solid #171717' }}>
              <div className="mb-6">
                <svg
                  className="mx-auto h-16 w-16 text-red-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                {error || 'Project Not Found'}
              </h2>
              <p className="text-gray-600 mb-6">
                {error ? 'There was an error loading the project data.' : 'The project you are looking for does not exist or you do not have access to it.'}
              </p>
              <button
                onClick={() => router.push('/projects')}
                className="px-6 py-2 text-sm font-medium email-button"
              >
                Back to Projects
              </button>
            </div>
          </div>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="min-h-screen" style={{ backgroundColor: '#F5F5F5' }}>
        <main>
          <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
            {/* Page Header */}
            <div className="mb-8 rounded-2xl p-6 bg-white">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h1 className="text-2xl font-semibold text-black">{project.name}</h1>
                    {getStatusBadge(project.status)}
                  </div>
                  <p className="text-sm text-gray-600">{project.description || 'No description available'}</p>
                  <div className="flex items-center gap-4 mt-3">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Users className="w-4 h-4" />
                      <span>Client ID: {project.client_id}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Clock className="w-4 h-4" />
                      <span>Created: {new Date(project.created_at).toLocaleDateString('en-GB')}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => router.push('/projects')}
                    className="px-4 py-2 text-sm font-medium black-button"
                  >
                    Back to Projects
                  </button>
                  <button className="px-4 py-2 text-sm font-medium email-button">
                    Edit Project
                  </button>
                </div>
              </div>
            </div>

            {/* Auto-Pause Banner */}
            <AutoPauseBanner
              projectBudget={project.project_budget}
              currentBudgetRemaining={project.current_budget_remaining}
              autoPauseThreshold={project.auto_pause_threshold}
              projectStatus={project.status}
              projectName={project.name}
              onReplenishBudget={() => {
                // TODO: Implement budget replenishment flow
                alert('Budget replenishment feature coming soon!');
              }}
            />

            {/* Contract Status Banner */}
            {!project.contract_signed && (
              <div className="mb-8 p-4 bg-blue-50 border border-blue-200 rounded-2xl flex items-start">
                <AlertTriangle className="h-5 w-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
                <div>
                  <h3 className="text-sm font-semibold text-blue-800">Contract Pending</h3>
                  <p className="text-sm text-blue-700 mt-1">
                    Waiting for client to sign the contract. Project setup is blocked until signature is received.
                  </p>
                </div>
              </div>
            )}

            {/* Budget Monitoring Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              {/* Retainer Balance Widget */}
              <div className="lg:col-span-1">
                <div className="rounded-2xl p-6 bg-white">
                  <RetainerBalanceWidget
                    projectBudget={project.project_budget}
                    currentBudgetRemaining={project.current_budget_remaining}
                    autoPauseThreshold={project.auto_pause_threshold}
                    currency="USD"
                  />
                </div>
              </div>

              {/* Budget History */}
              <div className="lg:col-span-2">
                <div className="rounded-2xl p-6 bg-white">
                  <BudgetHistory
                    transactions={budgetHistory}
                    currency="USD"
                  />
                </div>
              </div>
            </div>

            {/* Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">

              {/* Hours Tracked */}
              <div className="rounded-2xl p-6 bg-white">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-gray-600">Hours Tracked</h3>
                  <Clock className="h-5 w-5 text-gray-400" />
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {Number(metrics.total_hours_tracked).toFixed(1)}h
                </p>
                <p className="text-sm text-gray-500">Total time logged</p>
              </div>

              {/* Total Revenue */}
              <div className="rounded-2xl p-6 bg-white">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-gray-600">Total Revenue</h3>
                  <TrendingUp className="h-5 w-5 text-gray-400" />
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  ${Number(metrics.total_revenue).toFixed(2)}
                </p>
                <p className="text-sm text-gray-500">Earned to date</p>
              </div>

              {/* Deliverables */}
              <div className="rounded-2xl p-6 bg-white">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-gray-600">Deliverables</h3>
                  <CheckCircle className="h-5 w-5 text-gray-400" />
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {metrics.deliverables_completed}/{metrics.deliverables_total}
                </p>
                <p className="text-sm text-gray-500">Completed</p>
              </div>

              {/* Auto-Replenish Status */}
              <div className="rounded-2xl p-6 bg-white">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-gray-600">Auto-Replenish</h3>
                  <div className={`w-3 h-3 rounded-full ${project.auto_replenish ? 'bg-green-400' : 'bg-gray-400'}`}></div>
                </div>
                <p className={`text-2xl font-bold ${project.auto_replenish ? 'text-green-600' : 'text-gray-600'}`}>
                  {project.auto_replenish ? 'ON' : 'OFF'}
                </p>
                <p className="text-sm text-gray-500">Budget auto-refill</p>
              </div>
            </div>

            {/* Milestones Section */}
            <div className="mb-8">
              <MilestoneSection projectId={projectId} />
            </div>

            {/* Project Details */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Contract Status */}
              <div className="rounded-2xl p-6 bg-white">
                <h3 className="text-lg font-semibold text-black mb-4">Contract Status</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Contract Type:</span>
                    <span className="text-sm font-medium text-black">
                      {project.contract_type === 'auto_generated' ? 'Auto-Generated' : 'Custom Upload'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Signed:</span>
                    <span className="text-sm font-medium text-black">
                      {project.contract_signed ? (
                        <span className="text-green-600 flex items-center">
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Yes
                        </span>
                      ) : (
                        <span className="text-yellow-600 flex items-center">
                          <AlertTriangle className="h-4 w-4 mr-1" />
                          Pending
                        </span>
                      )}
                    </span>
                  </div>
                  {project.contract_signed_at && (
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Signed At:</span>
                      <span className="text-sm font-medium text-black">
                        {new Date(project.contract_signed_at).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  {project.contract_pdf_url && (
                    <div className="pt-3 border-t">
                      <a
                        href={project.contract_pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-black hover:text-gray-600 font-medium"
                      >
                        Download Contract PDF →
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Project Settings */}
              <div className="rounded-2xl p-6 bg-white">
                <h3 className="text-lg font-semibold text-black mb-4">Project Settings</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Auto-Pause Threshold:</span>
                    <span className="text-sm font-medium text-black">
                      {project.auto_pause_threshold}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Max Revisions:</span>
                    <span className="text-sm font-medium text-black">
                      {project.max_revisions} per deliverable
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Auto-Replenish:</span>
                    <span className={`text-sm font-medium ${project.auto_replenish ? 'text-green-600' : 'text-gray-600'}`}>
                      {project.auto_replenish ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Scope Deviation:</span>
                    <span className="text-sm font-medium text-black">
                      {Number(metrics.scope_deviation_percentage).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Change Requests:</span>
                    <span className="text-sm font-medium text-black">
                      {metrics.change_requests_total} total
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Git Repositories */}
            {project.allowed_repositories && project.allowed_repositories.length > 0 && (
              <div className="rounded-2xl p-6 bg-white mb-8">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-black">Git Repositories</h3>
                  <GitBranch className="h-5 w-5 text-gray-400" />
                </div>
                <div className="space-y-2">
                  {project.allowed_repositories.map((repo, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <span className="text-sm text-black font-mono">{repo}</span>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        project.status === 'paused'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {project.status === 'paused' ? 'Access Revoked' : 'Active'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Change Requests Summary */}
            {metrics.change_requests_total > 0 && (
              <div className="rounded-2xl p-6 bg-white mb-8">
                <h3 className="text-lg font-semibold text-black mb-4">Change Requests</h3>
                <div className="grid grid-cols-2 gap-6">
                  <div className="text-center">
                    <p className="text-sm text-gray-600 mb-2">Total Requests</p>
                    <p className="text-3xl font-bold text-black">{metrics.change_requests_total}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-600 mb-2">Approved</p>
                    <p className="text-3xl font-bold text-green-600">{metrics.change_requests_approved}</p>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Value Added:</span>
                    <span className="font-medium text-black">${Number(metrics.change_request_value_added).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Team Members Section */}
            <div className="rounded-2xl p-6 bg-white mb-8">
              <h3 className="text-lg font-semibold text-black mb-4">Team Members</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                  <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                    <span className="text-white font-medium text-sm">JD</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-black">John Developer</p>
                    <p className="text-xs text-gray-600">Lead Developer</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                  <div className="w-10 h-10 bg-gradient-to-r from-green-500 to-teal-600 rounded-full flex items-center justify-center">
                    <span className="text-white font-medium text-sm">DS</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-black">Jane Smith</p>
                    <p className="text-xs text-gray-600">Project Manager</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Activity Section */}
            <div className="rounded-2xl p-6 bg-white mb-8">
              <h3 className="text-lg font-semibold text-black mb-4">Recent Activity</h3>
              <div className="space-y-3">
                <div className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                  <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-black">Project milestone completed</p>
                    <p className="text-xs text-gray-500">2 hours ago</p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-black">Client feedback received</p>
                    <p className="text-xs text-gray-500">1 day ago</p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                  <div className="w-2 h-2 bg-purple-500 rounded-full mt-2 flex-shrink-0"></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-black">Code commit pushed</p>
                    <p className="text-xs text-gray-500">2 days ago</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
