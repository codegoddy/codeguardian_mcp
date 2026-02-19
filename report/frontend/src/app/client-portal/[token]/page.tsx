'use client';

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import LoadingSpinner from '../../../components/LoadingSpinner';
import { useCurrencyFormat } from '../../../hooks/use-currency-format';
import { useClientPortalBundle } from '../../../hooks/useClientPortal';
import { 
  AlertCircle, 
  FileText, 
  Package,
  Clock,
  X,
  Maximize2,
  Minimize2
} from 'lucide-react';
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
} from "recharts";

interface Activity {
  id: string;
  type: string;
  title: string;
  description: string;
  time: string;
  projectName?: string;
}

// Custom Tooltip component that matches app design
const CustomTooltip = ({ 
  active, 
  payload, 
  label,
  currency,
  formatCurrency
}: { 
  active?: boolean; 
  payload?: ReadonlyArray<{ color: string; name: string; value: number; dataKey: string; payload: unknown }>; 
  label?: string | number;
  currency: string;
  formatCurrency: (amount: number, currency: string) => string;
}) => {
  if (active && payload && payload.length) {
    const date = label ? new Date(label).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }) : '';

    return (
      <div
        className="rounded-lg bg-white p-3 shadow-lg"
        style={{
          border: '1px solid #171717',
          boxShadow: '2px 2px 0px #171717'
        }}
      >
        <p className="text-sm font-medium text-gray-900 mb-2">{date}</p>
        <div className="space-y-1">
          {payload.map((entry: { color: string; name: string; value: number; dataKey: string; payload: unknown }, index: number) => (
            <div key={index} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-sm text-gray-700">
                {entry.name}:
              </span>
              <span className="text-sm font-medium text-gray-900">
                {formatCurrency(entry.value, currency)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
};

export default function ClientPortalPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const { formatWithCurrency } = useCurrencyFormat();
  
  // Use the client portal bundle hook (React Query)
  const {
    isValid,
    clientData,
    dashboard,
    error,
    isValidating,
    isLoadingDashboard
  } = useClientPortalBundle(token);
  
  const [isActivitiesSidebarOpen, setIsActivitiesSidebarOpen] = useState(false);
  const [isActivitiesSidebarExpanded, setIsActivitiesSidebarExpanded] = useState(false);
  
  // Calculate financial health data from actual projects
  const financialHealthData = useMemo(() => {
    if (!dashboard || dashboard.projects.length === 0) {
      return [];
    }

    // Calculate total budget from all projects
    const totalBudget = dashboard.projects.reduce((sum, project) => sum + project.project_budget, 0);
    
    // Calculate unbilled work (budget used but not yet invoiced)
    const unbilledWork = dashboard.projects.reduce((sum, project) => {
      const budgetUsed = project.project_budget - project.current_budget_remaining;
      return sum + budgetUsed;
    }, 0);

    // Generate data points for the last 9 days
    const today = new Date();
    const data = [];
    for (let i = 8; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      
      // For now, use static values - in production, this would come from historical data
      data.push({
        date: date.toISOString().split('T')[0],
        totalBudget: totalBudget,
        unbilledWork: unbilledWork * (0.8 + Math.random() * 0.3), // Add some variation
      });
    }
    
    return data;
  }, [dashboard]);

  // Calculate dynamic Y-axis configuration
  const chartConfig = useMemo(() => {
    if (financialHealthData.length === 0) {
      return { domain: [0, 30000], ticks: [5000, 10000, 15000, 20000, 25000, 30000] };
    }

    // Find max value in the data
    const maxValue = Math.max(
      ...financialHealthData.map(d => Math.max(d.totalBudget, d.unbilledWork))
    );

    // Round up to a nice number
    const magnitude = Math.pow(10, Math.floor(Math.log10(maxValue)));
    const maxRounded = Math.ceil(maxValue / magnitude) * magnitude;

    // Generate 6 evenly spaced ticks
    const tickCount = 6;
    const tickInterval = maxRounded / tickCount;
    const ticks = Array.from({ length: tickCount + 1 }, (_, i) => i * tickInterval);

    return {
      domain: [0, maxRounded],
      ticks: ticks,
    };
  }, [financialHealthData]);

  // Format Y-axis values based on magnitude
  const formatYAxis = (value: number) => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `${(value / 1000).toFixed(0)}k`;
    }
    return value.toString();
  };
  
  // Get error message as string
  const errorMessage = error instanceof Error ? error.message : (typeof error === 'string' ? error : 'Invalid access link');
  
  // Mock activities for right sidebar (in production, fetch from API)
  const activities: Activity[] = [
    {
      id: "1",
      type: "deliverable",
      title: "Deliverable Completed",
      description: "User dashboard completed",
      time: "2h ago",
      projectName: dashboard?.projects[0]?.name,
    },
    {
      id: "2",
      type: "invoice",
      title: "Invoice Sent",
      description: "Invoice #INV-001 sent",
      time: "1d ago",
      projectName: dashboard?.projects[0]?.name,
    },
    {
      id: "3",
      type: "change_request",
      title: "Change Request Approved",
      description: "Additional features approved",
      time: "2d ago",
      projectName: dashboard?.projects[0]?.name,
    },
    {
      id: "4",
      type: "deliverable",
      title: "Deliverable Started",
      description: "Payment integration started",
      time: "3d ago",
      projectName: dashboard?.projects[0]?.name,
    },
    {
      id: "5",
      type: "invoice",
      title: "Invoice Paid",
      description: "Invoice #INV-002 marked as paid",
      time: "5d ago",
      projectName: dashboard?.projects[0]?.name,
    },
    {
      id: "6",
      type: "change_request",
      title: "Change Request Submitted",
      description: "New feature request submitted",
      time: "1w ago",
      projectName: dashboard?.projects[0]?.name,
    },
    {
      id: "7",
      type: "deliverable",
      title: "Deliverable Verified",
      description: "Authentication module verified",
      time: "1w ago",
      projectName: dashboard?.projects[0]?.name,
    },
    {
      id: "8",
      type: "invoice",
      title: "Invoice Generated",
      description: "Invoice #INV-003 generated",
      time: "2w ago",
      projectName: dashboard?.projects[0]?.name,
    },
  ];

  // React Query automatically handles data fetching based on the token parameter

  const getStatusBadgeColor = (status: string) => {
    const statusLower = status.toLowerCase();
    
    // Clean pill-shaped badges matching the main projects table
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

  const getActivityIcon = (type: string) => {
    const borderColorClass = {
      deliverable: "border-purple-400",
      invoice: "border-green-400",
      change_request: "border-blue-400",
      default: "border-gray-400",
    };
    const borderColor = borderColorClass[type as keyof typeof borderColorClass] || borderColorClass.default;
    return <div className={`w-3 h-3 bg-white rounded-full border-2 ${borderColor}`}></div>;
  };

  const calculateTotalStats = () => {
    if (!dashboard) return { totalDeliverables: 0, completedDeliverables: 0, pendingInvoices: 0, totalBudget: 0 };
    
    const stats = dashboard.projects.reduce((acc, project) => ({
      totalDeliverables: acc.totalDeliverables + project.total_deliverables,
      completedDeliverables: acc.completedDeliverables + project.completed_deliverables,
      pendingInvoices: acc.pendingInvoices + project.pending_invoices,
      totalBudget: acc.totalBudget + project.project_budget,
    }), { totalDeliverables: 0, completedDeliverables: 0, pendingInvoices: 0, totalBudget: 0 });
    
    return stats;
  };

  const stats = calculateTotalStats();

  if (isValidating) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#F5F5F5" }}>
        <div className="flex items-center">
          <LoadingSpinner />
          <span className="ml-3 text-gray-600">Validating access...</span>
        </div>
      </div>
    );
  }

  if (error || !isValid) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#F5F5F5" }}>
        <div className="max-w-md w-full mx-4">
          <div className="p-6 rounded-lg bg-white" style={{ border: '1px solid #ef4444' }}>
            <div className="flex items-center mb-4">
              <svg className="w-6 h-6 text-red-600 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h2 className="text-lg font-semibold text-gray-900">Access Denied</h2>
            </div>
            <p className="text-gray-600 mb-4">{errorMessage}</p>
            <p className="text-sm text-gray-500">
              If you need access to your client portal, please contact your developer or request a new magic link.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (isLoadingDashboard || !dashboard) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#F5F5F5" }}>
        <div className="flex items-center">
          <LoadingSpinner />
          <span className="ml-3 text-gray-600">Loading your portal...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen" style={{ backgroundColor: "#F5F5F5" }}>
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <div className="lg:pr-96">
            <div className="px-4 sm:px-6 lg:px-8 py-8">
              {/* Header */}
              <div className="mb-8">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-normal text-black mb-1">
                      Welcome back, {dashboard.client_name}
                    </h2>
                    <p className="text-sm text-gray-600">{dashboard.client_email}</p>
                  </div>
                </div>
              </div>

              {/* Financial Health Chart */}
              {financialHealthData.length > 0 && (
                <div
                  className="mb-8 rounded-2xl p-6 bg-white"
                  style={{ outline: "none", border: "none" }}
                  onClick={(e) => e.currentTarget.blur()}
                >
                  <div className="mb-6 flex items-center justify-between">
                    <h3 className="text-xl font-medium text-black">
                      Financial Health
                    </h3>
                  </div>

                  {/* Chart Legend */}
                  <div className="flex items-center space-x-6 mb-6">
                    <div className="flex items-center space-x-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: "#8884d8" }}
                      ></div>
                      <span className="text-sm text-gray-700">Total Budget</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: "#f59e0b" }}
                      ></div>
                      <span className="text-sm text-gray-700">Unbilled Work</span>
                    </div>
                  </div>

                  <ResponsiveContainer width="100%" height={250}>
                  <LineChart
                    accessibilityLayer
                    data={financialHealthData}
                    margin={{
                      left: -20,
                      right: 12,
                    }}
                  >
                    <CartesianGrid
                      vertical={true}
                      horizontal={false}
                      stroke="rgba(0,0,0,0.3)"
                      strokeWidth={0.5}
                    />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      interval={0}
                      tick={{ fontSize: 11 }}
                      tickFormatter={(value) =>
                        new Date(value).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                        })
                      }
                    />
                    <YAxis
                      domain={chartConfig.domain}
                      ticks={chartConfig.ticks}
                      tickFormatter={formatYAxis}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip 
                      content={(props) => (
                        <CustomTooltip 
                          {...props} 
                          currency={dashboard?.currency || 'USD'} 
                          formatCurrency={formatWithCurrency}
                        />
                      )} 
                      cursor={false} 
                    />
                    <Line
                      dataKey="totalBudget"
                      type="basis"
                      stroke="#8884d8"
                      strokeWidth={2}
                      dot={false}
                      name="Total Budget"
                    />
                    <Line
                      dataKey="unbilledWork"
                      type="basis"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={false}
                      name="Unbilled Work"
                    />
                  </LineChart>
                </ResponsiveContainer>
                </div>
              )}

              {/* Portfolio Overview */}
              <div className="mb-8">
                {/* Section Header */}
                <div className="mb-4">
                  <h3 className="text-xl font-medium text-black">
                    Portfolio Overview
                  </h3>
                </div>

                {/* Stats Cards - Row 1 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="email-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: "#ccff00" }}
                      />
                      <span className="text-sm font-bold text-white uppercase tracking-wide">
                        Total Projects
                      </span>
                    </div>
                    <div className="text-2xl font-black text-white">
                      {dashboard.projects.length}
                    </div>
                  </div>

                  <div className="email-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: "#22c55e" }}
                      />
                      <span className="text-sm font-bold text-white uppercase tracking-wide">
                        Deliverables
                      </span>
                    </div>
                    <div className="text-2xl font-black text-white">
                      {stats.completedDeliverables}/{stats.totalDeliverables}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {stats.totalDeliverables > 0 
                        ? Math.round((stats.completedDeliverables / stats.totalDeliverables) * 100) 
                        : 0}% complete
                    </div>
                  </div>

                  <div className="email-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: "#f59e0b" }}
                      />
                      <span className="text-sm font-bold text-white uppercase tracking-wide">
                        Pending Invoices
                      </span>
                    </div>
                    <div className="text-2xl font-black text-white">
                      {stats.pendingInvoices}
                    </div>
                  </div>
                </div>

                {/* Stats Cards - Row 2 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="email-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: "#3b82f6" }}
                      />
                      <span className="text-sm font-bold text-white uppercase tracking-wide">
                        Active Projects
                      </span>
                    </div>
                    <div className="text-2xl font-black text-white">
                      {dashboard.projects.filter(p => p.status === 'active' || p.status === 'in_progress').length}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {dashboard.projects.length > 0 
                        ? Math.round((dashboard.projects.filter(p => p.status === 'active' || p.status === 'in_progress').length / dashboard.projects.length) * 100) 
                        : 0}% of total
                    </div>
                  </div>

                  <div className="email-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: "#10b981" }}
                      />
                      <span className="text-sm font-bold text-white uppercase tracking-wide">
                        Total Budget
                      </span>
                    </div>
                    <div className="text-2xl font-black text-white">
                      {formatWithCurrency(stats.totalBudget, dashboard?.currency || 'USD')}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      Across all projects
                    </div>
                  </div>
                </div>
              </div>

              {/* Projects Section */}
              <div className="mb-8 rounded-2xl p-6 bg-white">
                <div className="mb-6 flex items-center justify-between">
                  <h3 className="text-xl font-medium text-black">Your Projects</h3>
                </div>
                
                {dashboard.projects.length === 0 ? (
                  <div className="text-center py-12">
                    <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No projects yet</h3>
                    <p className="text-gray-500">
                      Your projects will appear here once they are available.
                    </p>
                  </div>
                ) : (
                  <div className="pt-6">
                    {/* Table Header */}
                    <div className="pb-4 border-b-2 border-gray-300">
                      <div className="flex items-center space-x-4">
                        <div
                          className="text-xs font-semibold text-gray-700 uppercase tracking-wide"
                          style={{ width: "80px" }}
                        >
                          Status
                        </div>
                        <div className="flex-1 grid grid-cols-3 gap-6">
                          <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                            Project Name
                          </div>
                          <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                            Budget
                          </div>
                          <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                            Deliverables
                          </div>
                        </div>
                        <div
                          className="text-xs font-semibold text-gray-700 uppercase tracking-wide"
                          style={{ width: "100px" }}
                        >
                          Date
                        </div>
                        <div
                          className="text-xs font-semibold text-gray-700 uppercase tracking-wide"
                          style={{ width: "60px" }}
                        >
                          Action
                        </div>
                      </div>
                    </div>

                    {/* Project Rows */}
                    {dashboard.projects.map((project, index) => (
                      <div
                        key={project.id}
                        className={`py-4 ${index !== dashboard.projects.length - 1 ? "border-b border-gray-200" : ""}`}
                      >
                        <div className="flex items-center space-x-4">
                          <span
                            className={`px-3 py-1 text-xs font-medium rounded-full ${getStatusBadgeColor(project.status)}`}
                            style={{ minWidth: "80px", textAlign: "center", display: "inline-block" }}
                          >
                            {project.status.replace(/_/g, " ").toUpperCase()}
                          </span>
                          <div className="flex-1 grid grid-cols-3 gap-6">
                            <div className="text-sm font-semibold text-gray-900">
                              {project.name}
                            </div>
                            <div className="text-sm text-gray-600">
                              <div className="font-semibold text-gray-900">
                                {formatWithCurrency(project.current_budget_remaining, dashboard?.currency || 'USD')}
                              </div>
                              <div className="text-xs text-gray-500">
                                of {formatWithCurrency(project.project_budget, dashboard?.currency || 'USD')} ({(project.budget_percentage_remaining || 0).toFixed(0)}%)
                              </div>
                            </div>
                            <div className="text-sm text-gray-600">
                              <div className="font-semibold text-gray-900">
                                {project.completed_deliverables}/{project.total_deliverables}
                              </div>
                              <div className="text-xs text-gray-500">
                                {project.pending_change_requests} Change Requests
                              </div>
                            </div>
                          </div>
                          <div
                            className="flex items-center text-xs text-gray-600"
                            style={{ width: "100px" }}
                          >
                            {new Date(project.created_at || Date.now()).toLocaleDateString("en-GB")}
                          </div>
                          <div style={{ width: "60px" }}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/client-portal/${token}/project/${project.id}`);
                              }}
                              className="px-3 py-1 text-xs font-medium text-black rounded-full hover:scale-105 transition-transform duration-200"
                              style={{
                                backgroundColor: "#ccff00",
                              }}
                            >
                              View
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
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
                {dashboard.client_name}
              </span>
              <div className="w-8 h-8 rounded-full bg-gray-500 flex items-center justify-center" style={{ border: '1px solid #171717' }}>
                <span className="text-white font-semibold text-xs">
                  {dashboard.client_name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)}
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
                  onClick={() => {
                    const firstProject = dashboard.projects[0];
                    if (firstProject) {
                      router.push(`/client-portal/${token}/project/${firstProject.id}`);
                    }
                  }}
                  disabled={dashboard.projects.length === 0}
                  className="flex items-center px-4 py-2 text-sm font-medium email-button w-full disabled:opacity-50"
                >
                  <Package className="h-4 w-4 mr-2" />
                  View Project Details
                </button>
                <button
                  onClick={() => router.push(`/client-portal/${token}/invoices`)}
                  className="flex items-center px-4 py-2 text-sm font-medium purple-button w-full"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  View Invoices
                </button>
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
                  Expires: {clientData?.expires_at ? new Date(clientData.expires_at).toLocaleDateString('en-US', { 
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
    </div>
  );
}

