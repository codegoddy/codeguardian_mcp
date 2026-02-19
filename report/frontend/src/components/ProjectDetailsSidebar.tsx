/** @format */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  Calendar,
  Users,
  DollarSign,
  Clock,
  CheckCircle,
  AlertCircle,
  Pause,
  Play,
  ExternalLink,
  Maximize2,
  Minimize2,
  GitCommit,
  AlertTriangle,
  Link as LinkIcon,
  Send,
  Copy,
} from "lucide-react";
import ApiService from "@/services/api";
import { Project } from "@/services/projects";
import { useSettings } from "@/hooks/useSettings";
import { useCurrencyFormat } from "@/hooks/use-currency-format";
import { toast } from "@/lib/toast";

interface ProjectDetailsSidebarProps {
  project: Project | null;
  isOpen: boolean;
  onClose: () => void;
  alwaysOpen?: boolean;
}

export default function ProjectDetailsSidebar({
  project,
  isOpen,
  onClose,
  alwaysOpen = false,
}: ProjectDetailsSidebarProps) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);
  const [sendingPortalLink, setSendingPortalLink] = useState(false);

  const { data: settings } = useSettings();
  const { formatWithCurrency } = useCurrencyFormat();

  // Use data from project prop instead of loading separately
  const timeStats = project ? {
    project_id: project.id,
    total_entries: project.total_entries || 0,
    total_hours: Number(project.total_hours_tracked) || 0,
    deliverables: {}
  } : null;

  const portalStatus = project ? {
    has_signed_contract: project.contract_signed,
    has_active_portal: project.has_active_portal || false,
    magic_link: project.portal_magic_link || null,
    expires_at: project.portal_expires_at || null,
    client_email: '', // Will be populated from client data if needed
    client_name: project.client_name || ''
  } : null;

  // Debug logging for contract status
  console.log('[ProjectDetailsSidebar] Project contract status:', {
    projectId: project?.id,
    contract_signed: project?.contract_signed,
    contract_signed_at: project?.contract_signed_at,
    portalStatus: portalStatus?.has_signed_contract
  });

  const handleSendPortalLink = async () => {
    if (!project) return;
    
    try {
      setSendingPortalLink(true);
      const response = await ApiService.post<{
        magic_link: string;
        expires_at: string;
        client_email: string;
      }>(`/api/projects/${project.id}/send-client-portal-link`);
      
      // Portal status will be refreshed on next project list reload
      
      toast.success(
        'Portal Link Sent',
        `Client portal access link has been sent to ${response.client_email}`
      );
    } catch (err: unknown) {
      console.error('Error sending portal link:', err);
      const errorMessage = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail || 'Failed to generate and send client portal link'
        : 'Failed to generate and send client portal link';
      toast.error(
        'Failed to Send Link',
        errorMessage
      );
    } finally {
      setSendingPortalLink(false);
    }
  };

  const handleCopyPortalLink = () => {
    if (portalStatus?.magic_link) {
      navigator.clipboard.writeText(portalStatus.magic_link);
      toast.success('Copied!', 'Portal link copied to clipboard');
    }
  };

  if (!project) return null;

  // Calculate derived fields
  const budgetUsed = project.project_budget - project.current_budget_remaining;
  const budgetPercentage = project.project_budget > 0 ? (budgetUsed / project.project_budget) * 100 : 0;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "healthy":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "active":
        return <Play className="w-5 h-5 text-blue-500" />;
      case "at_risk":
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      case "paused":
        return <Pause className="w-5 h-5 text-yellow-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusBadgeColor = (status: string) => {
    const statusLower = status.toLowerCase();
    
    // Clean pill-shaped badges matching table styling
    if (statusLower === "active" || statusLower === "healthy") {
      return "bg-[#ccff00] text-black";
    } else if (statusLower === "paused") {
      return "bg-red-500 text-white";
    } else if (statusLower === "at_risk") {
      return "bg-red-500 text-white";
    } else if (statusLower === "contract_sent" || statusLower === "awaiting_contract") {
      return "bg-blue-500 text-white";
    } else if (statusLower === "completed") {
      return "bg-purple-500 text-white";
    } else if (statusLower === "cancelled") {
      return "bg-gray-400 text-white";
    } else {
      return "bg-[#1a1a2e] text-white";
    }
  };

  const getBudgetStatusColor = (percentage: number) => {
    if (percentage < 50) return "text-green-600";
    if (percentage < 80) return "text-yellow-600";
    return "text-red-600";
  };

  const getBudgetStatusBg = (percentage: number) => {
    if (percentage < 50) return "bg-green-100";
    if (percentage < 80) return "bg-yellow-100";
    return "bg-red-100";
  };

  const getActivityIcon = (type: string) => {
    const borderColorClass = {
      completed: "border-green-400",
      feedback: "border-blue-400",
      commit: "border-purple-400",
      default: "border-gray-400",
    };
    const borderColor = borderColorClass[type as keyof typeof borderColorClass] || borderColorClass.default;
    return <div className={`w-3 h-3 bg-white rounded-full border-2 ${borderColor}`}></div>;
  };

  return (
    <>
      {/* Backdrop overlay when expanded */}
      {isOpen && isExpanded && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 transition-opacity duration-300"
          onClick={() => setIsExpanded(false)}
        />
      )}

      <div
        className={`fixed top-0 right-0 h-screen bg-white flex flex-col shadow-lg transition-all duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        } ${isExpanded ? "w-[800px] z-50" : "w-96 z-60"}`}
      >
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <h2 className="text-xl font-semibold text-black">Project Details</h2>
        </div>
        <div className="flex items-center gap-2">
          {!alwaysOpen && (
            <>
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1.5 hover:bg-gray-100 rounded transition-colors"
                title={isExpanded ? "Collapse" : "Expand"}
              >
                {isExpanded ? (
                  <Minimize2 className="w-5 h-5 text-gray-600" />
                ) : (
                  <Maximize2 className="w-5 h-5 text-gray-600" />
                )}
              </button>
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-gray-100 rounded transition-colors"
              >
                <X className="w-6 h-6 text-gray-600" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Project Overview */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-black">{project.name}</h3>
            <div className="flex items-center space-x-2">
              {getStatusIcon(project.status)}
              <span
                className={`px-3 py-1 text-xs font-medium rounded-full ${getStatusBadgeColor(
                  project.status
                )}`}
              >
                {project.status.replace("_", " ").toUpperCase()}
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center space-x-3 text-sm">
              <Users className="w-4 h-4 text-gray-500" />
              <span className="text-gray-600">Client:</span>
              <span className="font-medium text-black">{project.client_name}</span>
            </div>

            <div className="flex items-center space-x-3 text-sm">
              <Calendar className="w-4 h-4 text-gray-500" />
              <span className="text-gray-600">Last Activity:</span>
              <span className="font-medium text-black">
                {new Date(project.updated_at).toLocaleDateString("en-GB")}
              </span>
            </div>

            <div className="flex items-center space-x-3 text-sm">
              <DollarSign className="w-4 h-4 text-gray-500" />
              <span className="text-gray-600">Budget:</span>
              <span className={`font-medium ${getBudgetStatusColor(budgetPercentage)}`}>
                {formatWithCurrency(Number(project.project_budget), settings?.default_currency)}
              </span>
            </div>
          </div>
        </div>

        {/* Budget Progress with Time Tracking */}
        <div className="mb-8 p-4 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-base font-medium text-black flex items-center">
              <Clock className="w-4 h-4 mr-2" />
              Budget & Time Tracking
            </h4>
            <span className="text-xs text-gray-500">
              {timeStats?.total_entries || 0} entries
            </span>
          </div>

          {/* Budget Overview */}
          <div className="space-y-3 mb-4">
            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              <div
                className={`h-3 rounded-full transition-all duration-300 ${getBudgetStatusBg(
                  budgetPercentage
                )}`}
                style={{ width: `${Math.min(budgetPercentage, 100)}%` }}
              ></div>
            </div>

            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-500">
                {budgetPercentage.toFixed(1)}% used
              </span>
              <span className={`font-medium ${getBudgetStatusColor(budgetPercentage)}`}>
                {formatWithCurrency(budgetUsed, settings?.default_currency)} spent
              </span>
            </div>
          </div>

          {/* Time Tracking Stats */}
          {timeStats && (
            <>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="flex items-center space-x-2 mb-1">
                    <Clock className="w-3 h-3 text-gray-500" />
                    <p className="text-xs text-gray-600">Total Hours</p>
                  </div>
                  <p className="text-lg font-bold text-gray-900">
                    {timeStats.total_hours.toFixed(1)}h
                  </p>
                </div>

                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="flex items-center space-x-2 mb-1">
                    <GitCommit className="w-3 h-3 text-gray-500" />
                    <p className="text-xs text-gray-600">Time Entries</p>
                  </div>
                  <p className="text-lg font-bold text-gray-900">
                    {timeStats.total_entries}
                  </p>
                </div>
              </div>

              {/* Budget Alert */}
              {budgetPercentage > 90 && (
                <div className="mt-3 flex items-start space-x-2 p-2 bg-red-50 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-red-700">
                    <strong>Budget Alert:</strong> Project is approaching budget limit. Review scope or request additional funds.
                  </p>
                </div>
              )}

              {budgetPercentage > 75 && budgetPercentage <= 90 && (
                <div className="mt-3 flex items-start space-x-2 p-2 bg-yellow-50 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-yellow-700">
                    <strong>Warning:</strong> Project has used over 75% of budget.
                  </p>
                </div>
              )}

              {budgetPercentage <= 75 && timeStats.total_hours > 0 && (
                <div className="mt-3 flex items-start space-x-2 p-2 bg-green-50 rounded-lg">
                  <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-green-700">
                    <strong>On Track:</strong> Project is within budget and progressing well.
                  </p>
                </div>
              )}
            </>
          )}


        </div>

        {/* Project Settings */}
        <div className="mb-8 p-4 rounded-lg border border-gray-200">
          <h4 className="text-base font-medium text-black mb-3">Project Settings</h4>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Auto-Pause:</span>
              <span className={`text-sm font-medium ${project.auto_pause_threshold > 50 ? 'text-green-600' : project.auto_pause_threshold > 20 ? 'text-yellow-600' : 'text-red-600'}`}>
                {project.auto_pause_threshold > 50 ? 'Good' : project.auto_pause_threshold > 20 ? 'Monitor' : 'Critical'}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Auto-Replenish:</span>
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${project.auto_replenish ? 'bg-green-400' : 'bg-red-400'}`}></div>
                <span className={`text-sm font-medium ${project.auto_replenish ? 'text-green-600' : 'text-red-600'}`}>
                  {project.auto_replenish ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Max Revisions:</span>
              <span className="text-sm font-medium text-black">{project.max_revisions} per deliverable</span>
            </div>
          </div>
        </div>

        {/* Client Portal Access */}
        <div className="mb-8 p-4 rounded-lg border border-gray-200 bg-gradient-to-br from-blue-50 to-purple-50">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-base font-medium text-black flex items-center">
              <LinkIcon className="w-4 h-4 mr-2 text-blue-600" />
              Client Portal Access
            </h4>
            {portalStatus?.has_active_portal && (
              <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full font-medium">
                Active
              </span>
            )}
          </div>

          {!portalStatus?.has_signed_contract ? (
            // Contract not signed yet
            <div className="space-y-3">
              <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                <div className="flex items-start space-x-2">
                  <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-yellow-900 mb-1">
                      Contract Not Signed
                    </p>
                    <p className="text-xs text-yellow-700">
                      The client has not signed the contract yet. Portal access will be automatically created and sent to the client once they sign the contract.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : portalStatus?.has_active_portal && portalStatus?.magic_link ? (
            // Has active portal link
            <div className="space-y-3">
              <p className="text-xs text-gray-600 mb-3">
                Share secure portal access with your client to view project progress, deliverables, and invoices.
              </p>

              <div className="p-3 bg-white rounded-lg border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-700">Active Portal Link</span>
                  <CheckCircle className="w-4 h-4 text-green-600" />
                </div>
                <div className="flex items-center space-x-2 mb-2">
                  <input
                    type="text"
                    value={portalStatus.magic_link}
                    readOnly
                    className="flex-1 text-xs bg-gray-50 px-2 py-1 rounded border border-gray-200 font-mono text-gray-600 truncate"
                  />
                  <button
                    onClick={handleCopyPortalLink}
                    className="p-2 hover:bg-gray-100 rounded transition-colors"
                    title="Copy link"
                  >
                    <Copy className="w-4 h-4 text-gray-600" />
                  </button>
                </div>
                {portalStatus.expires_at && (
                  <p className="text-xs text-gray-500">
                    Expires: {new Date(portalStatus.expires_at).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                )}
              </div>

              <button
                onClick={handleSendPortalLink}
                disabled={sendingPortalLink}
                className="w-full flex items-center justify-center px-4 py-2 text-sm font-medium email-button rounded-lg transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
              >
                {sendingPortalLink ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Send New Link
                  </>
                )}
              </button>

              <div className="flex items-start space-x-2 p-2 bg-blue-50 rounded-lg border border-blue-100">
                <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-blue-700">
                  Sending a new link will email it to <strong>{portalStatus.client_name}</strong> ({portalStatus.client_email}). The new link will be valid for 30 days.
                </p>
              </div>
            </div>
          ) : (
            // Contract signed but no active portal (shouldn't normally happen, but handle it)
            <div className="space-y-3">
              <p className="text-xs text-gray-600 mb-3">
                Generate and send a secure portal access link to your client.
              </p>

              <button
                onClick={handleSendPortalLink}
                disabled={sendingPortalLink}
                className="w-full flex items-center justify-center px-4 py-2 text-sm font-medium email-button rounded-lg transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
              >
                {sendingPortalLink ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Generating Link...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Generate & Send Portal Link
                  </>
                )}
              </button>

              <div className="flex items-start space-x-2 p-2 bg-blue-50 rounded-lg border border-blue-100">
                <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-blue-700">
                  Link will be emailed to <strong>{portalStatus?.client_name}</strong> and expires in 30 days.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Git Repositories or Time Tracker */}
        {project.allowed_repositories && project.allowed_repositories.length > 0 ? (
          <div className="mb-8 p-4 rounded-lg border border-gray-200">
            <h4 className="text-base font-medium text-black mb-3">Git Repositories</h4>
            <div className="space-y-2">
              {project.allowed_repositories.map((repo, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <span className="text-xs text-black font-mono">{repo}</span>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    project.status === 'paused'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-green-100 text-green-800'
                  }`}>
                    {project.status === 'paused' ? 'Revoked' : 'Active'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : project.time_tracker_provider ? (
          <div className="mb-8 p-4 rounded-lg border border-gray-200">
            <h4 className="text-base font-medium text-black mb-3">Time Tracker Integration</h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-black font-medium capitalize">{project.time_tracker_provider}</span>
                  {project.time_tracker_project_name && (
                    <span className="text-xs text-gray-600">• {project.time_tracker_project_name}</span>
                  )}
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  project.status === 'paused'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-green-100 text-green-800'
                }`}>
                  {project.status === 'paused' ? 'Paused' : 'Active'}
                </span>
              </div>
            </div>
          </div>
        ) : null}

        {/* Applied Templates */}
        <div className="mb-8 p-4 rounded-lg border border-gray-200">
          <h4 className="text-base font-medium text-black mb-3">Applied Templates</h4>
          <div className="space-y-2">
            {project.applied_template_name ? (
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900">{project.applied_template_name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    project.applied_template_type === 'system'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-purple-100 text-purple-800'
                  }`}>
                    {project.applied_template_type === 'system' ? 'System' : 'Custom'}
                  </span>
                </div>
                <p className="text-xs text-gray-600">
                  {project.applied_template_type === 'system'
                    ? 'Pre-built template applied to this project'
                    : 'Custom template applied to this project'
                  }
                </p>
              </div>
            ) : (
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900">No Template Applied</span>
                  <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-800 rounded-full">
                    None
                  </span>
                </div>
                <p className="text-xs text-gray-600">No template was applied to this project</p>
              </div>
            )}
            
            <button
              onClick={() => {
                onClose();
                router.push(`/projects/${project.id}/deliverables`);
              }}
              className="w-full flex items-center justify-center px-4 py-2 mt-2 text-sm font-medium email-button rounded-lg transition-all duration-200 hover:scale-105"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Manage Deliverables
            </button>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-lg font-normal text-black">
              Recent Activity
            </h4>
            <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center">
              <Clock className="w-5 h-5 text-white" />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-start space-x-2 relative hover:scale-105 transform transition-all duration-300 ease-in-out">
              <div className="flex-shrink-0 flex flex-col items-center">
                <div className="mt-0.5">
                  {getActivityIcon('completed')}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-normal text-black truncate">
                  Project milestone completed
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  2 hours ago
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-2 relative hover:scale-105 transform transition-all duration-300 ease-in-out">
              <div className="flex-shrink-0 flex flex-col items-center">
                <div className="mt-0.5">
                  {getActivityIcon('feedback')}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-normal text-black truncate">
                  Client feedback received
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  1 day ago
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-2 relative hover:scale-105 transform transition-all duration-300 ease-in-out">
              <div className="flex-shrink-0 flex flex-col items-center">
                <div className="mt-0.5">
                  {getActivityIcon('commit')}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-normal text-black truncate">
                  Code commit pushed
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  2 days ago
                </p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
    </>
  );
}

