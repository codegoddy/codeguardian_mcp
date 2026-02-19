'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Deliverable, DeliverableCreate, DeliverableUpdate, deliverablesApi } from '@/services/deliverables';
import { Milestone, MilestoneUpdate, milestonesApi } from '@/services/milestones';
import EditDeliverableModal from '@/components/EditDeliverableModal';
import EditMilestoneModal from '@/components/EditMilestoneModal';
import { projectsApi, Project } from '@/services/projects';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import { useSettings } from '@/hooks/useSettings';
import { useAuthContext } from '@/contexts/AuthContext';
import ProjectDetailsSidebar from '@/components/ProjectDetailsSidebar';
import AuthGuard from '@/components/AuthGuard';
import LoadingSpinner from '@/components/LoadingSpinner';
import {  Plus,
  CheckCircle,
  Clock,
  AlertCircle,
  Trash2,
} from 'lucide-react';
import DeliverableCard from '@/components/DeliverableCard';

export default function DeliverablesPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  
  // Get user's currency from settings
  const { data: settings } = useSettings();
  const userCurrency = settings?.default_currency || 'USD';
  
  // Map currency codes to symbols
  const getCurrencyDisplay = (currency: string) => {
    const symbolMap: Record<string, string> = {
      'USD': '$',
      'EUR': '€',
      'GBP': '£',
      'JPY': '¥',
      'CNY': '¥',
      'INR': '₹',
      'AUD': 'A$',
      'CAD': 'C$',
      'CHF': 'CHF',
      'SEK': 'kr',
      'NZD': 'NZ$',
    };
    return symbolMap[currency] || currency;
  };
  
  const currencySymbol = getCurrencyDisplay(userCurrency);
  
  const [project, setProject] = useState<Project | null>(null);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [selectedDeliverable, setSelectedDeliverable] = useState<Deliverable | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [editingDeliverable, setEditingDeliverable] = useState<Deliverable | null>(null);
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);
  const [createModalMilestoneId, setCreateModalMilestoneId] = useState<string | null>(null);
  const [contractSigned, setContractSigned] = useState(false);

  const { isAuthenticated, isInitialized } = useAuthContext();

  useEffect(() => {
    // Only load data if authentication is ready
    if (isInitialized && isAuthenticated) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, statusFilter, isAuthenticated, isInitialized]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [projectData, deliverablesData, milestonesData] = await Promise.all([
        projectsApi.getProject(projectId),
        deliverablesApi.getDeliverables(projectId, statusFilter !== 'all' ? statusFilter : undefined),
        milestonesApi.listMilestones(projectId),
      ]);
      setProject(projectData);
      setDeliverables(deliverablesData);
      setMilestones(milestonesData);
      
      // Check if contract is signed
      setContractSigned(projectData.contract_signed || false);
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to load data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };



  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this deliverable?')) return;
    
    try {
      await deliverablesApi.deleteDeliverable(id);
      await loadData();
    } catch (err) {
      const error = err as Error;
      alert(error.message || 'Failed to delete deliverable');
    }
  };

  const handleMarkReadyToBill = async (id: string) => {
    if (!confirm('Mark this deliverable as ready to bill?')) return;
    
    try {
      await deliverablesApi.markReadyToBill(id);
      await loadData();
    } catch (err) {
      const error = err as Error;
      alert(error.message || 'Failed to mark as ready to bill');
    }
  };

  if (loading) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <LoadingSpinner size="lg" color="black" />
          <span className="ml-3 text-gray-400">Loading deliverables...</span>
        </div>
      </AuthGuard>
    );
  }

  if (error || !project) {
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
        {/* Project Details Sidebar */}
        <ProjectDetailsSidebar
          project={project}
          isOpen={true}
          onClose={() => {}} 
          alwaysOpen={true}
        />
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="min-h-screen" style={{ backgroundColor: '#F5F5F5' }}>
        <main>
          <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
            {/* Page Header */}
            <div className="email-section p-8 mb-8">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="email-text-heading text-2xl mb-2">Project Plan</h1>
                  <p className="text-gray-600">Manage deliverables and track progress for {project.name}</p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => router.push('/projects')}
                    className="px-6 py-2 text-sm font-medium email-button"
                  >
                    Back
                  </button>
                </div>
              </div>
            </div>

            {/* Project Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {/* Hours Tracked */}
              <div className="email-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-gray-400">Hours Tracked</h3>
                  <Clock className="h-4 w-4 text-gray-400" />
                </div>
                <p className="text-2xl font-bold text-white">{Number(project.total_hours_tracked || 0).toFixed(1)}h</p>
                <p className="text-xs text-gray-500 mt-1">Total time logged</p>
              </div>

              {/* Total Revenue */}
              <div className="email-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-gray-400">Total Revenue</h3>
                  <span className="text-gray-400 font-bold">$</span>
                </div>
                <p className="text-2xl font-bold text-white">
                  {currencySymbol}{Number(project.total_revenue || 0).toFixed(2)}
                </p>
                <p className="text-xs text-gray-500 mt-1">Earned to date</p>
              </div>

              {/* Deliverables */}
              <div className="email-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-gray-400">Deliverables</h3>
                  <CheckCircle className="h-4 w-4 text-gray-400" />
                </div>
                <p className="text-2xl font-bold text-white">
                  {deliverables.filter(d => ['completed', 'verified', 'ready_to_bill', 'billed'].includes(d.status)).length}/{deliverables.length}
                </p>
                <p className="text-xs text-gray-500 mt-1">Completed</p>
              </div>

              {/* Auto-Replenish */}
              <div className="email-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-gray-400">Auto-Replenish</h3>
                  <div className={`h-2 w-2 rounded-full ${project.auto_replenish ? 'bg-green-500' : 'bg-red-500'}`} />
                </div>
                <p className="text-2xl font-bold text-white">
                  {project.auto_replenish ? 'ON' : 'OFF'}
                </p>
                <p className="text-xs text-gray-500 mt-1">Budget auto-refill</p>
              </div>
            </div>

            {/* Filters */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Filter by Status</h2>
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="All Deliverables" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Deliverables</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="verified">Verified</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Deliverables List */}
            {deliverables.length === 0 && milestones.length === 0 ? (
              <div className="email-section p-12 text-center">
                <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No deliverables or milestones found</h3>
                <p className="text-gray-600 mb-6">
                  {statusFilter !== 'all'
                    ? `No deliverables with status "${statusFilter}"`
                    : 'Get started by creating your first deliverable'}
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Milestones with their deliverables */}
                {(milestones || []).map((milestone) => {
                  const milestoneDeliverables = deliverables.filter(
                    (d) => d.milestone_id === milestone.id
                  );
                  
                  return (
                    <div key={milestone.id} className="email-section p-6">
                      {/* Milestone Header */}
                      <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-200">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">{milestone.name}</h3>
                          {milestone.description && (
                            <p className="text-sm text-gray-600 mt-1">{milestone.description}</p>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            setCreateModalMilestoneId(milestone.id);
                            setShowCreateModal(true);
                          }}
                          className="px-3 py-1 text-xs font-medium text-black rounded hover:scale-105 transition-transform duration-200"
                          style={{
                            backgroundColor: '#ccff00',
                            border: '1px solid #171717',
                          }}
                        >
                          <Plus className="h-3 w-3 inline mr-1" />
                          New Deliverable
                        </button>
                      </div>

                      {/* Deliverables in this milestone */}
                      {milestoneDeliverables.length === 0 ? (
                        <div className="text-center py-6 text-gray-500 text-sm">
                          No deliverables in this milestone yet
                        </div>
                      ) : (
                        <div className="flex flex-col bg-white rounded-lg border border-gray-200 overflow-hidden">
                          {milestoneDeliverables.map((deliverable) => (
                            <div key={deliverable.id} className="relative">
                              <DeliverableCard
                                deliverable={deliverable}
                                contractSigned={contractSigned}
                                currencySymbol={currencySymbol}
                                onClick={() => setEditingDeliverable(deliverable)}
                              />
                              {deliverable.status !== 'billed' && (
                                <div className="absolute top-4 right-4 flex gap-2 z-10">
                                  {deliverable.status === 'completed' && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedDeliverable(deliverable);
                                        setShowVerifyModal(true);
                                      }}
                                      className="px-3 py-1.5 text-xs font-medium email-button"
                                    >
                                      Verify
                                    </button>
                                  )}
                                  {deliverable.status === 'verified' && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleMarkReadyToBill(deliverable.id);
                                      }}
                                      className="px-3 py-1.5 text-xs font-medium email-button-green"
                                    >
                                      Mark Ready to Bill
                                    </button>
                                  )}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDelete(deliverable.id);
                                    }}
                                    className="p-1.5 text-red-600 hover:text-red-900 bg-white rounded"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Unassigned Deliverables */}
                {deliverables.filter((d) => !d.milestone_id).length > 0 && (
                  <div className="email-section p-6">
                    <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-200">
                      <h3 className="text-lg font-semibold text-gray-900">Unassigned Deliverables</h3>
                      <button
                        onClick={() => {
                          setCreateModalMilestoneId(null);
                          setShowCreateModal(true);
                        }}
                        className="px-3 py-1 text-xs font-medium text-black rounded hover:scale-105 transition-transform duration-200"
                        style={{
                          backgroundColor: '#ccff00',
                          border: '1px solid #171717',
                        }}
                      >
                        <Plus className="h-3 w-3 inline mr-1" />
                        New Deliverable
                      </button>
                    </div>

                    <div className="flex flex-col bg-white rounded-lg border border-gray-200 overflow-hidden">
                      {deliverables.filter((d) => !d.milestone_id).map((deliverable) => (
                        <div key={deliverable.id} className="relative">
                          <DeliverableCard
                            deliverable={deliverable}
                            contractSigned={contractSigned}
                            currencySymbol={currencySymbol}
                            onClick={() => setEditingDeliverable(deliverable)}
                          />
                          {deliverable.status !== 'billed' && (
                            <div className="absolute top-4 right-4 flex gap-2 z-10">
                              {deliverable.status === 'completed' && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedDeliverable(deliverable);
                                    setShowVerifyModal(true);
                                  }}
                                  className="px-3 py-1.5 text-xs font-medium email-button"
                                >
                                  Verify
                                </button>
                              )}
                              {deliverable.status === 'verified' && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMarkReadyToBill(deliverable.id);
                                  }}
                                  className="px-3 py-1.5 text-xs font-medium email-button-green"
                                >
                                  Mark Ready to Bill
                                </button>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(deliverable.id);
                                }}
                                className="p-1.5 text-red-600 hover:text-red-900 bg-white rounded"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>

        {/* Create Deliverable Modal */}
        {showCreateModal && (
          <CreateDeliverableModal
            projectId={projectId}
            defaultMilestoneId={createModalMilestoneId}
            onClose={() => setShowCreateModal(false)}
            onSuccess={() => {
              setShowCreateModal(false);
              loadData();
            }}
          />
        )}

        {/* Verify Deliverable Modal */}
        {showVerifyModal && selectedDeliverable && (
          <VerifyDeliverableModal
            deliverable={selectedDeliverable}
            onClose={() => {
              setShowVerifyModal(false);
              setSelectedDeliverable(null);
            }}
            onSuccess={() => {
              setShowVerifyModal(false);
              setSelectedDeliverable(null);
              loadData();
            }}
          />
        )}

        {/* Edit Deliverable Modal */}
        {editingDeliverable && (
          <EditDeliverableModal
            isOpen={true}
            onClose={() => setEditingDeliverable(null)}
            deliverable={editingDeliverable}
            onSave={async (data: DeliverableUpdate) => {
              try {
                await deliverablesApi.updateDeliverable(editingDeliverable.id, data);
                setEditingDeliverable(null);
                loadData();
              } catch (err) {
                console.error('Failed to update deliverable:', err);
              }
            }}
          />
        )}

        {/* Edit Milestone Modal */}
        {editingMilestone && (
          <EditMilestoneModal
            isOpen={true}
            onClose={() => setEditingMilestone(null)}
            milestone={editingMilestone}
            onSave={async (data: MilestoneUpdate) => {
              try {
                await milestonesApi.updateMilestone(String(params.id), editingMilestone.id, data);
                setEditingMilestone(null);
                loadData();
              } catch (err) {
                console.error('Failed to update milestone:', err);
              }
            }}
          />
        )}
      </div>
    </AuthGuard>
  );
}

// Create Deliverable Modal Component
function CreateDeliverableModal({
  projectId,
  defaultMilestoneId,
  onClose,
  onSuccess,
}: {
  projectId: string;
  defaultMilestoneId?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [formData, setFormData] = useState<DeliverableCreate>({
    project_id: projectId,
    title: '',
    description: '',
    estimated_hours: undefined,
    milestone_id: defaultMilestoneId || null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await deliverablesApi.createDeliverable(formData);
      onSuccess();
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to create deliverable');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
      <div 
        className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
        style={{
          border: '1px solid #171717',
          boxShadow: '2px 2px 0px #171717'
        }}
      >
        <h2 className="text-xl font-semibold mb-4">Create Deliverable</h2>
        
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              style={{ border: '1px solid #171717' }}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              style={{ border: '1px solid #171717' }}
              rows={3}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Estimated Hours
            </label>
            <input
              type="number"
              step="0.5"
              value={formData.estimated_hours || ''}
              onChange={(e) => setFormData({ ...formData, estimated_hours: e.target.value ? parseFloat(e.target.value) : undefined })}
              className="w-full px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              style={{ border: '1px solid #171717' }}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium email-button"
              disabled={submitting}
            >
              {submitting ? 'Creating...' : 'Create Deliverable'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Verify Deliverable Modal Component
function VerifyDeliverableModal({
  deliverable,
  onClose,
  onSuccess,
}: {
  deliverable: Deliverable;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await deliverablesApi.verifyDeliverable(deliverable.id, {
        pr_url: deliverable.git_pr_url || '',
        manual_override: false,
        justification: undefined,
      });
      onSuccess();
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to verify deliverable');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
      <div 
        className="bg-white rounded-lg p-6 max-w-lg w-full mx-4"
        style={{
          border: '1px solid #171717',
          boxShadow: '2px 2px 0px #171717'
        }}
      >
        <h2 className="text-xl font-semibold mb-4">Verify Deliverable</h2>
        
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="mb-4">
          <p className="text-sm text-gray-600 mb-2">
            Deliverable: <span className="font-medium text-gray-900">{deliverable.title}</span>
          </p>
          <p className="text-sm text-gray-600">
            This will mark the deliverable as verified and ready for billing.
          </p>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            onClick={handleVerify}
            className="px-4 py-2 text-sm font-medium email-button"
            disabled={submitting}
          >
            {submitting ? 'Verifying...' : 'Verify Deliverable'}
          </button>
        </div>
      </div>
    </div>
  );
}
