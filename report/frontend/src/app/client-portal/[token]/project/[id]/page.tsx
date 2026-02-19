'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import LoadingSpinner from '../../../../../components/LoadingSpinner';
import { useCurrencyFormat } from '../../../../../hooks/use-currency-format';
import { useClientPortalProjectBundle } from '../../../../../hooks/useClientPortal';
import { 
  ArrowLeft,
  DollarSign,
  Clock,
  AlertCircle,
  FileText,
  Package,
  Calendar,
  ExternalLink,
  Download,
  X,
  Maximize2,
  Minimize2,
  Activity
} from 'lucide-react';
import { DeliverableActivityModal } from '../../../../../components/activity/DeliverableActivityModal';
import { clientPortalService } from '../../../../../services/clientPortal';

export default function ClientPortalProjectPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const projectId = params.id as string;
  const { formatWithCurrency } = useCurrencyFormat();
  
  // Use the client portal project bundle hook (React Query)
  const {
    project,
    isLoading: loading,
    error,
    clientName,
    currency,
    sessionExpires
  } = useClientPortalProjectBundle(token, projectId);
  
  const [isActivitiesSidebarOpen, setIsActivitiesSidebarOpen] = useState(false);
  const [isActivitiesSidebarExpanded, setIsActivitiesSidebarExpanded] = useState(false);
  const [selectedDeliverable, setSelectedDeliverable] = useState<{id: string, title: string} | null>(null);

  const fetchDeliverableActivity = async (deliverableId: string) => {
    const response = await clientPortalService.getDeliverableActivity(token, deliverableId);
    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to fetch activity');
    }
    return response.data;
  };

  // Get error message as string
  const errorMessage = error instanceof Error ? error.message : (typeof error === 'string' ? error : 'Project Not Found');

  // React Query automatically handles data fetching based on token and projectId parameters

  const getStatusBadgeColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active':
      case 'in_progress':
        return 'bg-blue-500 text-white';
      case 'completed':
      case 'verified':
      case 'billed':
        return 'bg-[#ccff00] text-black';
      case 'paused':
        return 'bg-red-500 text-white';
      case 'pending':
      case 'awaiting_review':
        return 'bg-[#1a1a2e] text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  const getActivityIcon = (type: string) => {
    const borderColorClass = {
      deliverable: "border-green-400",
      invoice: "border-blue-400",
      change_request: "border-purple-400",
      default: "border-gray-400",
    };
    const borderColor = borderColorClass[type as keyof typeof borderColorClass] || borderColorClass.default;
    return <div className={`w-3 h-3 bg-white rounded-full border-2 ${borderColor}`}></div>;
  };

  // Mock activities for right sidebar
  const activities = [
    {
      id: "1",
      type: "deliverable",
      title: "Deliverable Completed",
      description: "User dashboard completed",
      time: "2h ago",
      projectName: project?.name,
    },
    {
      id: "2",
      type: "invoice",
      title: "Invoice Sent",
      description: "Invoice #INV-001 sent",
      time: "1d ago",
      projectName: project?.name,
    },
    {
      id: "3",
      type: "change_request",
      title: "Change Request Approved",
      description: "Additional features approved",
      time: "2d ago",
      projectName: project?.name,
    },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F5F5F5' }}>
        <LoadingSpinner size="lg" />
        <span className="ml-3 text-gray-600">Loading project details...</span>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: '#F5F5F5' }}>
        <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <div className="bg-white rounded-2xl p-8 text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">
              {errorMessage}
            </h2>
            <p className="text-gray-600 mb-6">
              Unable to load project details. Please try again.
            </p>
            <button
              onClick={() => router.push(`/client-portal/${token}`)}
              className="px-6 py-2 text-sm font-medium black-button"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  const budgetUsed = (project.project_budget || 0) - (project.current_budget_remaining || 0);
  const budgetUsedPercentage = project.project_budget > 0 ? (budgetUsed / project.project_budget) * 100 : 0;

  const completedDeliverables = project.deliverables?.filter(
    d => ['completed', 'verified', 'billed'].includes(d.status.toLowerCase())
  ).length || 0;

  const totalDeliverableHours = project.deliverables?.reduce((sum, d) => sum + (d.actual_hours || 0), 0) || 0;
  const totalDeliverableCost = project.deliverables?.reduce((sum, d) => sum + (d.total_cost || 0), 0) || 0;

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F5F5' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#F5F5F5' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.push(`/client-portal/${token}`)}
                className="p-2 hover:bg-white hover:shadow-md rounded-lg transition-all duration-200 hover:scale-105"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div>
                <h1 className="text-2xl font-semibold text-black">{project.name}</h1>
                {project.description && (
                  <p className="text-sm text-gray-600 mt-1">{project.description}</p>
                )}
              </div>
            </div>
            <span
              className={`px-3 py-1 text-xs font-medium rounded-full ${getStatusBadgeColor(project.status)}`}
            >
              {project.status.replace(/_/g, ' ').toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:pr-[400px]">
        {/* Project Overview Stats */}
        <div className="mb-8">
          {/* Section Header */}
          <div className="mb-4">
            <h3 className="text-xl font-medium text-black">Project Overview</h3>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Budget Remaining */}
            <div className="email-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: "#10b981" }}
                />
                <span className="text-sm font-bold text-white uppercase tracking-wide">
                  Budget Remaining
                </span>
              </div>
              <div className="text-2xl font-black text-white mb-1">
                {formatWithCurrency(project.current_budget_remaining, currency)}
              </div>
              <div className="text-xs text-gray-400 mb-2">
                of {formatWithCurrency(project.project_budget, currency)}
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2 mb-1">
                <div 
                  className="bg-[#10b981] h-2 rounded-full" 
                  style={{ width: `${project.budget_percentage_remaining || 0}%` }}
                ></div>
              </div>
              <p className="text-xs text-gray-400">
                {(project.budget_percentage_remaining || 0).toFixed(0)}% remaining
              </p>
            </div>

            {/* Budget Used */}
            <div className="email-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: "#3b82f6" }}
                />
                <span className="text-sm font-bold text-white uppercase tracking-wide">
                  Budget Used
                </span>
              </div>
              <div className="text-2xl font-black text-white mb-1">
                {formatWithCurrency(budgetUsed, currency)}
              </div>
              <div className="text-xs text-gray-400 mb-2">
                {(budgetUsedPercentage || 0).toFixed(0)}% of total budget
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div 
                  className="bg-[#3b82f6] h-2 rounded-full" 
                  style={{ width: `${budgetUsedPercentage || 0}%` }}
                ></div>
              </div>
            </div>

            {/* Hours Tracked */}
            <div className="email-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: "#8b5cf6" }}
                />
                <span className="text-sm font-bold text-white uppercase tracking-wide">
                  Hours Tracked
                </span>
              </div>
              <div className="text-2xl font-black text-white mb-1">
                {(project.total_hours_tracked || 0).toFixed(1)}h
              </div>
              <div className="text-xs text-gray-400">
                Total time logged
              </div>
              <div className="text-xs text-gray-400 mt-2">
                Cost: {formatWithCurrency(totalDeliverableCost, currency)}
              </div>
            </div>

            {/* Deliverables */}
            <div className="email-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: "#f59e0b" }}
                />
                <span className="text-sm font-bold text-white uppercase tracking-wide">
                  Deliverables
                </span>
              </div>
              <div className="text-2xl font-black text-white mb-1">
                {completedDeliverables}/{project.deliverables.length}
              </div>
              <div className="text-xs text-gray-400 mb-2">
                Completed
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2 mb-1">
                <div 
                  className="bg-[#f59e0b] h-2 rounded-full" 
                  style={{ width: `${project.deliverables.length > 0 ? (completedDeliverables / project.deliverables.length) * 100 : 0}%` }}
                ></div>
              </div>
              <p className="text-xs text-gray-400">
                {project.deliverables.length > 0 ? Math.round((completedDeliverables / project.deliverables.length) * 100) : 0}% complete
              </p>
            </div>
          </div>
        </div>

        {/* Invoices Section - Now at the top */}
        {project.invoices.length > 0 && (
          <div className="bg-white rounded-2xl p-6 mb-8">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-xl font-medium text-black">Invoices</h3>
              <span className="text-sm text-gray-600">
                {project.invoices.length} invoice{project.invoices.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Table Header */}
            <div className="pb-4 border-b-2 border-gray-300">
              <div className="flex items-center space-x-4">
                <div
                  className="text-xs font-semibold text-gray-700 uppercase tracking-wide"
                  style={{ width: '100px' }}
                >
                  Status
                </div>
                <div className="flex-1 grid grid-cols-3 gap-6">
                  <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                    Invoice
                  </div>
                  <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                    Amount
                  </div>
                  <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                    Due Date
                  </div>
                </div>
                <div
                  className="text-xs font-semibold text-gray-700 uppercase tracking-wide"
                  style={{ width: '140px' }}
                >
                  Actions
                </div>
              </div>
            </div>

            {/* Invoice Rows */}
            {project.invoices.map((invoice, index) => (
              <div
                key={invoice.id}
                className={`py-4 ${index !== project.invoices.length - 1 ? 'border-b border-gray-200' : ''}`}
              >
                <div className="flex items-center space-x-4">
                  <span
                    className={`px-3 py-1 text-xs font-medium rounded-full ${getStatusBadgeColor(invoice.status)}`}
                    style={{ minWidth: '100px', textAlign: 'center', display: 'inline-block' }}
                  >
                    {invoice.status.replace(/_/g, ' ').toUpperCase()}
                  </span>
                  <div className="flex-1 grid grid-cols-3 gap-6">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{invoice.invoice_number}</div>
                      {invoice.payment_method && (
                        <div className="text-xs text-gray-500">{invoice.payment_method}</div>
                      )}
                    </div>
                    <div className="text-sm font-bold text-gray-900">
                      {formatWithCurrency(invoice.total_amount, currency)}
                    </div>
                    <div className="text-xs text-gray-600">
                      {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('en-GB') : 'N/A'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2" style={{ width: '140px' }}>
                    {/* Pay button for unpaid invoices */}
                    {invoice.status === 'sent' && (
                      <button
                        onClick={() => router.push(`/client-portal/${token}/invoices/${invoice.id}/pay`)}
                        className="px-3 py-1 text-xs font-medium text-white rounded-full hover:scale-105 transition-transform duration-200 flex items-center gap-1"
                        style={{ backgroundColor: '#22c55e' }}
                      >
                        <DollarSign className="w-3 h-3" />
                        Pay
                      </button>
                    )}
                    {/* Download PDF button */}
                    {invoice.invoice_pdf_url && (
                      <a
                        href={invoice.invoice_pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1 text-xs font-medium text-black rounded-full hover:scale-105 transition-transform duration-200 flex items-center gap-1"
                        style={{ backgroundColor: '#ccff00' }}
                      >
                        <Download className="w-3 h-3" />
                        PDF
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Deliverables Section */}
        <div className="bg-white rounded-2xl p-6 mb-8">
          <div className="mb-6 flex items-center justify-between">
            <h3 className="text-xl font-medium text-black">Deliverables</h3>
            <span className="text-sm text-gray-600">
              {completedDeliverables} of {project.deliverables.length} completed
            </span>
          </div>

          {project.deliverables.length === 0 && project.milestones.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No deliverables yet</h3>
              <p className="text-gray-500">
                Deliverables will appear here as work progresses.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Milestones with their deliverables */}
              {project.milestones.map((milestone) => {
                const milestoneDeliverables = project.deliverables.filter(
                  (d) => d.milestone_id === milestone.id
                );
                
                return (
                  <div key={milestone.id} className="bg-white rounded-lg border border-gray-200 p-6">
                    {/* Milestone Header */}
                    <div className="mb-4 pb-4 border-b border-gray-200">
                      <h3 className="text-lg font-semibold text-gray-900">{milestone.name}</h3>
                      {milestone.description && (
                        <p className="text-sm text-gray-600 mt-1">{milestone.description}</p>
                      )}
                    </div>

                    {/* Deliverables in this milestone */}
                    {milestoneDeliverables.length === 0 ? (
                      <div className="text-center py-6 text-gray-500 text-sm">
                        No deliverables in this milestone yet
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {milestoneDeliverables.map((deliverable) => (
                          <div
                            key={deliverable.id}
                            className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-all"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-1">
                                  <h4 className="text-base font-semibold text-gray-900">
                                    {deliverable.title}
                                  </h4>
                                  <span
                                    className={`px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap ${getStatusBadgeColor(deliverable.status)}`}
                                  >
                                    {deliverable.status.replace(/_/g, ' ').toUpperCase()}
                                  </span>
                                  {deliverable.task_reference && (
                                    <span className="px-2 py-0.5 text-xs text-gray-500 bg-gray-100 rounded">
                                      {deliverable.task_reference}
                                    </span>
                                  )}
                                </div>
                                {deliverable.description && (
                                  <p className="text-sm text-gray-600 mb-3">
                                    {deliverable.description}
                                  </p>
                                )}
                                <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 mb-3">
                                  <div className="flex items-center space-x-1">
                                    <Clock className="w-4 h-4" />
                                    <span>
                                      {(deliverable.actual_hours || 0).toFixed(1)}h tracked
                                    </span>
                                  </div>
                                  <div className="flex items-center space-x-1">
                                    <DollarSign className="w-4 h-4" />
                                    <span>{formatWithCurrency(deliverable.total_cost, currency)}</span>
                                  </div>
                                  {deliverable.created_at && (
                                    <div className="flex items-center space-x-1">
                                      <Calendar className="w-4 h-4" />
                                      <span>
                                        {new Date(deliverable.created_at).toLocaleDateString('en-GB')}
                                      </span>
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-3">
                                  <button
                                    onClick={() => setSelectedDeliverable({ id: deliverable.id, title: deliverable.title })}
                                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full hover:scale-105 transition-transform duration-200"
                                    style={{ backgroundColor: '#ccff00', color: '#000' }}
                                  >
                                    <Activity className="w-4 h-4" />
                                    <span>Proof of Work</span>
                                  </button>
                                  {deliverable.preview_url && (
                                    <a
                                      href={deliverable.preview_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                                    >
                                      <ExternalLink className="w-4 h-4" />
                                      <span>Preview</span>
                                    </a>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Unassigned Deliverables */}
              {project.deliverables.filter((d) => !d.milestone_id).length > 0 && (
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <div className="mb-4 pb-4 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900">Unassigned Deliverables</h3>
                  </div>

                  <div className="space-y-3">
                    {project.deliverables.filter((d) => !d.milestone_id).map((deliverable) => (
                      <div
                        key={deliverable.id}
                        className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-all"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-1">
                              <h4 className="text-base font-semibold text-gray-900">
                                {deliverable.title}
                              </h4>
                              <span
                                className={`px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap ${getStatusBadgeColor(deliverable.status)}`}
                              >
                                {deliverable.status.replace(/_/g, ' ').toUpperCase()}
                              </span>
                              {deliverable.task_reference && (
                                <span className="px-2 py-0.5 text-xs text-gray-500 bg-gray-100 rounded">
                                  {deliverable.task_reference}
                                </span>
                              )}
                            </div>
                            {deliverable.description && (
                              <p className="text-sm text-gray-600 mb-3">
                                {deliverable.description}
                              </p>
                            )}
                            <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 mb-3">
                              <div className="flex items-center space-x-1">
                                <Clock className="w-4 h-4" />
                                <span>
                                  {(deliverable.actual_hours || 0).toFixed(1)}h tracked
                                </span>
                              </div>
                              <div className="flex items-center space-x-1">
                                <DollarSign className="w-4 h-4" />
                                <span>{formatWithCurrency(deliverable.total_cost, currency)}</span>
                              </div>
                              {deliverable.created_at && (
                                <div className="flex items-center space-x-1">
                                  <Calendar className="w-4 h-4" />
                                  <span>
                                    {new Date(deliverable.created_at).toLocaleDateString('en-GB')}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => setSelectedDeliverable({ id: deliverable.id, title: deliverable.title })}
                                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full hover:scale-105 transition-transform duration-200"
                                style={{ backgroundColor: '#ccff00', color: '#000' }}
                              >
                                <Activity className="w-4 h-4" />
                                <span>Proof of Work</span>
                              </button>
                              {deliverable.preview_url && (
                                <a
                                  href={deliverable.preview_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                  <span>Preview</span>
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Deliverables Summary */}
          {project.deliverables.length > 0 && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-sm text-gray-600 mb-1">Total Hours</p>
                  <p className="text-xl font-bold text-gray-900">
                    {(totalDeliverableHours || 0).toFixed(1)}h
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-600 mb-1">Total Cost</p>
                  <p className="text-xl font-bold text-gray-900">
                    {formatWithCurrency(totalDeliverableCost, currency)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-600 mb-1">Avg Cost/Hour</p>
                  <p className="text-xl font-bold text-gray-900">
                    {totalDeliverableHours > 0 
                      ? formatWithCurrency(totalDeliverableCost / totalDeliverableHours, currency)
                      : formatWithCurrency(0, currency)
                    }
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Change Requests Section */}
        {project.change_requests.length > 0 && (
          <div className="bg-white rounded-2xl p-6 mb-8">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-xl font-medium text-black">Change Requests</h3>
              <span className="text-sm text-gray-600">
                {project.change_requests.length} request{project.change_requests.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="space-y-4">
              {project.change_requests.map((cr) => (
                <div
                  key={cr.id}
                  className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="text-base font-semibold text-gray-900 mb-1">
                        {cr.title}
                      </h4>
                      <p className="text-sm text-gray-600 mb-3">
                        {cr.description}
                      </p>
                      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
                        <div className="flex items-center space-x-1">
                          <Clock className="w-4 h-4" />
                          <span>{(cr.estimated_hours || 0).toFixed(1)}h estimated</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <DollarSign className="w-4 h-4" />
                          <span>
                            {formatWithCurrency(cr.total_cost, currency)} 
                            ({formatWithCurrency(cr.hourly_rate, currency)}/hr)
                          </span>
                        </div>
                        {cr.payment_required && (
                          <span className={`px-2 py-0.5 rounded ${cr.payment_received ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                            {cr.payment_received ? 'Payment Received' : 'Payment Required'}
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      className={`px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap ml-4 ${getStatusBadgeColor(cr.status)}`}
                    >
                      {cr.status.replace(/_/g, ' ').toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
        </div>
        )}

        {/* Contract Section */}
        {project.contract_signed && project.contract_pdf_url && (
          <div className="bg-white rounded-2xl p-6 mt-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <FileText className="w-6 h-6 text-green-600" />
                <div>
                  <h3 className="text-lg font-medium text-black">Contract</h3>
                  <p className="text-sm text-gray-600">Contract has been signed</p>
                </div>
              </div>
              <a
                href={project.contract_pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 text-sm font-medium black-button inline-flex items-center space-x-2"
              >
                <Download className="w-4 h-4" />
                <span>Download Contract</span>
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Right Sidebar */}
      <div className="hidden lg:fixed lg:right-0 lg:top-0 lg:z-50 lg:flex lg:w-96 lg:flex-col lg:h-screen">
        <div className="flex flex-col h-full bg-white">
          {/* Sidebar Header */}
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center space-x-3">
              {/* Empty space for alignment */}
            </div>
            <div className="flex items-center space-x-3">
              <span className="text-sm font-medium text-black">
                {clientName}
              </span>
              <div className="w-8 h-8 rounded-full bg-gray-500 flex items-center justify-center" style={{ border: '1px solid #171717' }}>
                <span className="text-white font-semibold text-xs">
                  {clientName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col flex-1 overflow-y-auto px-4 py-6">
            {/* Quick Actions */}
            <div className="pb-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-normal text-black">Quick Actions</h2>
              </div>
              <div className="space-y-2">
                <button
                  onClick={() => router.push(`/client-portal/${token}`)}
                  className="flex items-center px-4 py-2 text-sm font-medium email-button w-full"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Dashboard
                </button>
                {project?.contract_pdf_url && (
                  <a
                    href={project.contract_pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center px-4 py-2 text-sm font-medium purple-button w-full"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    View Contract
                  </a>
                )}
                <button
                  className="flex items-center px-4 py-2 text-sm font-medium black-button w-full"
                >
                  <Clock className="h-4 w-4 mr-2" />
                  Request Support
                </button>
              </div>
            </div>

            {/* Session Info */}
            <div className="pb-6">
              <div className="rounded-lg p-4 bg-green-50" style={{ border: '1px solid #22c55e' }}>
                <div className="flex items-center mb-2">
                  <AlertCircle className="w-4 h-4 text-green-600 mr-2" />
                  <span className="text-sm font-semibold text-green-900">Session Active</span>
                </div>
                <p className="text-xs text-green-700">
                  Expires: {sessionExpires ? new Date(sessionExpires).toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  }) : 'N/A'}
                </p>
              </div>
            </div>

            {/* Activities Section */}
            <div className="py-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-normal text-black">Recent Activity</h2>
              </div>
              <div className="space-y-3">
                {activities.slice(0, 3).map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-start space-x-2 relative hover:scale-105 transform transition-all duration-300 ease-in-out"
                  >
                    <div className="flex-shrink-0 flex flex-col items-center">
                      <div className="mt-0.5">
                        {getActivityIcon(activity.type)}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-normal text-black truncate">
                        {activity.description}
                      </p>
                      <p className="text-xs text-gray-600 mt-1">
                        {activity.time}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Show All Activities Button */}
            <div className="pb-6">
              <button 
                onClick={() => setIsActivitiesSidebarOpen(true)}
                className="px-4 py-2 text-sm font-medium black-button w-full"
              >
                Show All Activities
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Activities Sidebar */}
      <>
        {/* Backdrop overlay when expanded */}
        {isActivitiesSidebarOpen && isActivitiesSidebarExpanded && (
          <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 transition-opacity duration-300"
            onClick={() => setIsActivitiesSidebarExpanded(false)}
          />
        )}

        <div
          className={`fixed top-0 right-0 h-screen bg-white flex flex-col shadow-lg transition-all duration-300 ease-in-out ${
            isActivitiesSidebarOpen ? "translate-x-0" : "translate-x-full"
          } ${isActivitiesSidebarExpanded ? "w-[800px] z-50" : "w-96 z-60"}`}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div className="flex items-center space-x-3">
              <h2 className="text-xl font-semibold text-black">All Activities</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsActivitiesSidebarExpanded(!isActivitiesSidebarExpanded)}
                className="p-1.5 hover:bg-gray-100 rounded transition-colors"
                title={isActivitiesSidebarExpanded ? "Collapse" : "Expand"}
              >
                {isActivitiesSidebarExpanded ? (
                  <Minimize2 className="w-5 h-5 text-gray-600" />
                ) : (
                  <Maximize2 className="w-5 h-5 text-gray-600" />
                )}
              </button>
              <button
                onClick={() => {
                  setIsActivitiesSidebarOpen(false);
                  setIsActivitiesSidebarExpanded(false);
                }}
                className="p-1.5 hover:bg-gray-100 rounded transition-colors"
              >
                <X className="w-6 h-6 text-gray-600" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-4">
              {activities.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-start space-x-3 p-4 rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all duration-200"
                >
                  <div className="flex-shrink-0 flex flex-col items-center">
                    <div className="mt-1">
                      {getActivityIcon(activity.type)}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-black mb-1">
                          {activity.title}
                        </p>
                        <p className="text-sm text-gray-700 mb-2">
                          {activity.description}
                        </p>
                        {activity.projectName && (
                          <p className="text-xs text-gray-500 mb-1">
                            Project: {activity.projectName}
                          </p>
                        )}
                        <p className="text-xs text-gray-600">
                          {activity.time}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {activities.length === 0 && (
              <div className="text-center py-12">
                <Clock className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No activities yet</h3>
                <p className="text-gray-500">
                  Your recent activities will appear here.
                </p>
              </div>
            )}
          </div>
        </div>
      </>
      {/* Activity Modal */}
      {selectedDeliverable && (
        <DeliverableActivityModal
          isOpen={!!selectedDeliverable}
          onClose={() => setSelectedDeliverable(null)}
          deliverableId={selectedDeliverable.id}
          deliverableTitle={selectedDeliverable.title}
          fetchActivity={fetchDeliverableActivity}
        />
      )}
    </div>
  );
}

