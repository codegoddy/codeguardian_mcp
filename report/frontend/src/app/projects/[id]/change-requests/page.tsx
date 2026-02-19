'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { changeRequestsApi, ChangeRequest, ChangeRequestCreate } from '@/services/changeRequests';
import { projectsApi, Project } from '@/services/projects';

export default function ChangeRequestsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState<ChangeRequestCreate>({
    project_id: projectId,
    title: '',
    description: '',
    estimated_hours: 0,
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [projectData, crsData] = await Promise.all([
        projectsApi.getProject(projectId),
        changeRequestsApi.getChangeRequests(projectId),
      ]);
      setProject(projectData);
      setChangeRequests(crsData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateChangeRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title || !formData.description || formData.estimated_hours <= 0) {
      alert('Please fill in all fields');
      return;
    }

    try {
      setSubmitting(true);
      await changeRequestsApi.createChangeRequest(formData);
      
      // Reset form and refresh data
      setFormData({
        project_id: projectId,
        title: '',
        description: '',
        estimated_hours: 0,
      });
      setShowCreateForm(false);
      await fetchData();
      
      alert('Change request created successfully!');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create change request');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (crId: string) => {
    if (!confirm('Are you sure you want to approve this change request?')) {
      return;
    }

    try {
      await changeRequestsApi.approveChangeRequest(crId);
      await fetchData();
      alert('Change request approved!');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to approve change request');
    }
  };

  const handleReject = async (crId: string) => {
    if (!confirm('Are you sure you want to reject this change request?')) {
      return;
    }

    try {
      await changeRequestsApi.rejectChangeRequest(crId);
      await fetchData();
      alert('Change request rejected');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to reject change request');
    }
  };

  const handleComplete = async (crId: string) => {
    if (!confirm('Mark this change request as completed?')) {
      return;
    }

    try {
      await changeRequestsApi.completeChangeRequest(crId);
      await fetchData();
      alert('Change request marked as completed!');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to complete change request');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      case 'completed':
        return 'bg-blue-100 text-blue-800';
      case 'billed':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-8"></div>
            <div className="space-y-4">
              <div className="h-32 bg-gray-200 rounded"></div>
              <div className="h-32 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push(`/projects/${projectId}`)}
            className="text-purple-600 hover:text-purple-700 mb-4 flex items-center"
          >
            ← Back to Project
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Change Requests</h1>
          <p className="text-gray-600 mt-2">
            {project?.name} - Manage scope changes and additional work
          </p>
        </div>

        {/* Create Button */}
        <div className="mb-6">
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 transition-colors"
          >
            {showCreateForm ? 'Cancel' : '+ Create Change Request'}
          </button>
        </div>

        {/* Create Form */}
        {showCreateForm && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">New Change Request</h2>
            <form onSubmit={handleCreateChangeRequest}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Title *
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="Brief description of the change"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description *
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    rows={4}
                    placeholder="Detailed description of what needs to be changed or added"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Estimated Hours *
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    value={formData.estimated_hours || ''}
                    onChange={(e) => setFormData({ ...formData, estimated_hours: parseFloat(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="0.0"
                    required
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Cost will be calculated automatically based on the change request rate
                  </p>
                </div>

                <div className="flex gap-4">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 transition-colors disabled:bg-gray-400"
                  >
                    {submitting ? 'Creating...' : 'Create Change Request'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="bg-gray-200 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* Change Requests List */}
        <div className="space-y-4">
          {changeRequests.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md p-8 text-center">
              <p className="text-gray-500">No change requests yet</p>
              <p className="text-sm text-gray-400 mt-2">
                Create a change request to track out-of-scope work
              </p>
            </div>
          ) : (
            changeRequests.map((cr) => (
              <div key={cr.id} className="bg-white rounded-lg shadow-md p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-gray-900">{cr.title}</h3>
                    <p className="text-gray-600 mt-2">{cr.description}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(cr.status)}`}>
                    {cr.status.toUpperCase()}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-gray-500">Estimated Hours</p>
                    <p className="text-lg font-semibold">{cr.estimated_hours}h</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Hourly Rate</p>
                    <p className="text-lg font-semibold">${cr.hourly_rate}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Total Cost</p>
                    <p className="text-lg font-semibold text-purple-600">${cr.total_cost}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Payment</p>
                    <p className="text-lg font-semibold">
                      {cr.payment_received ? (
                        <span className="text-green-600">✓ Received</span>
                      ) : (
                        <span className="text-yellow-600">Pending</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-4">
                  {cr.status === 'pending' && (
                    <>
                      <button
                        onClick={() => handleApprove(cr.id)}
                        className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors text-sm"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleReject(cr.id)}
                        className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors text-sm"
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {cr.status === 'approved' && (
                    <button
                      onClick={() => handleComplete(cr.id)}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm"
                    >
                      Mark as Completed
                    </button>
                  )}
                </div>

                {/* Timestamps */}
                <div className="mt-4 pt-4 border-t border-gray-200 text-sm text-gray-500">
                  <p>Created: {new Date(cr.created_at).toLocaleString()}</p>
                  {cr.approved_at && (
                    <p>Approved: {new Date(cr.approved_at).toLocaleString()}</p>
                  )}
                  {cr.completed_at && (
                    <p>Completed: {new Date(cr.completed_at).toLocaleString()}</p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
