/** @format */

"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuthContext } from "../../contexts/AuthContext";
import AuthGuard from "../../components/AuthGuard";
import LoadingSpinner from "../../components/LoadingSpinner";
import CalendarModal from "../../components/ui/CalendarModal";
import ProjectModal from "../../components/ui/ProjectModal";
import ClientModal from "../../components/ui/ClientModal";
import ProjectDetailsSidebar from "../../components/ProjectDetailsSidebar";
import { SkeletonMetricCard, SkeletonChart } from "../../components/ui/SkeletonCard";
import { Client } from "../../services/clients";
import { Project } from "../../services/projects";
import {
  AlertCircle,
  Calendar,
} from "lucide-react";
import { useSettings } from "../../hooks/useSettings";
import { useCurrencyFormat } from "../../hooks/use-currency-format";
import { useDashboard } from "../../hooks/useDashboard";
import { projectsApi } from "../../services/projects";

// PERFORMANCE: Lazy load heavy charting library to reduce initial bundle size
import dynamic from 'next/dynamic';

const LineChart = dynamic(
  () => import('recharts').then(mod => mod.LineChart),
  { ssr: false }
);

const Line = dynamic(
  () => import('recharts').then(mod => mod.Line),
  { ssr: false }
);

const XAxis = dynamic(
  () => import('recharts').then(mod => mod.XAxis),
  { ssr: false }
);

const YAxis = dynamic(
  () => import('recharts').then(mod => mod.YAxis),
  { ssr: false }
);

const CartesianGrid = dynamic(
  () => import('recharts').then(mod => mod.CartesianGrid),
  { ssr: false }
);

const Tooltip = dynamic(
  () => import('recharts').then(mod => mod.Tooltip),
  { ssr: false }
);

const ResponsiveContainer = dynamic(
  () => import('recharts').then(mod => mod.ResponsiveContainer),
  { ssr: false }
);

// Custom Tooltip component that matches app design
const CustomTooltip = ({ 
  active, 
  payload, 
  label,
  currency = 'USD',
  formatWithCurrency
}: { 
  active?: boolean; 
  payload?: ReadonlyArray<{ color: string; name: string; value: number; dataKey: string; payload: unknown }>; 
  label?: string | number;
  currency?: string;
  formatWithCurrency: (amount: number, currency: string) => string;
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
                {entry.dataKey === "totalRevenue" ? "Total Revenue" : "Unbilled Work"}:
              </span>
              <span className="text-sm font-medium text-gray-900">
                {formatWithCurrency(entry.value, currency)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
};

export default function Dashboard() {
  const { isLoading: authLoading } = useAuthContext();
  const router = useRouter();
  const { data: settings } = useSettings();
  const { formatWithCurrency } = useCurrencyFormat();
  const currency = settings?.default_currency || 'USD';
  
  // SERVER STATE: Using React Query for data fetching
  const {
    projects,
    budgetWarnings,
    pendingChangeRequests,
    isLoading,
    isError,
    error,
    refetch,
  } = useDashboard();

  // Listen for project modal event from right sidebar
  useEffect(() => {
    const handleOpenProjectModal = () => {
      setIsProjectModalOpen(true);
    };

    window.addEventListener("openProjectModal", handleOpenProjectModal);

    return () => {
      window.removeEventListener("openProjectModal", handleOpenProjectModal);
    };
  }, []);

  // Listen for client modal event from right sidebar
  useEffect(() => {
    const handleOpenClientModal = () => {
      setIsClientModalOpen(true);
    };

    window.addEventListener("openClientModal", handleOpenClientModal);

    return () => {
      window.removeEventListener("openClientModal", handleOpenClientModal);
    };
  }, []);

  const getStatusBadgeColor = (status: string) => {
    const statusLower = status.toLowerCase();
    
    // Match email-button classes with proper styling
    if (statusLower === "active" || statusLower === "healthy") {
      return "email-button-green border border-black";
    } else if (statusLower === "paused") {
      return "email-button-red border border-black";
    } else if (statusLower === "at_risk") {
      return "email-button-red border border-black";
    } else if (statusLower === "contract_sent" || statusLower === "awaiting_contract") {
      return "email-button-blue border border-black";
    } else if (statusLower === "completed") {
      return "email-button-purple border border-black";
    } else if (statusLower === "cancelled") {
      return "bg-gray-400 text-white border border-black";
    } else {
      return "email-button border border-black";
    }
  };



  // Chart filter state
  const [chartFilter] = useState<"high" | "medium" | "low">(
    "medium"
  );

  // Work-to-Revenue Conversion chart data by level
  // Calculate financial health data from actual projects
  const workToRevenueDataSets = useMemo(() => {
    // Calculate total revenue (sum of all project revenues)
    // If total_revenue is 0 or undefined, use budgetTotal as fallback
    const totalRevenue = projects.reduce((sum, project) => {
      const revenue = project.total_revenue && project.total_revenue > 0 
        ? project.total_revenue 
        : project.budgetTotal;
      return sum + revenue;
    }, 0);
    
    // Calculate unbilled work (budget used but not yet invoiced)
    const unbilledWork = projects.reduce((sum, project) => {
      const budgetUsed = project.budgetTotal - project.budgetRemaining;
      return sum + budgetUsed;
    }, 0);

    // DEBUG: Only log in development to avoid production console clutter
    if (process.env.NODE_ENV === 'development') {
      console.log('Dashboard Financial Health Data:', {
        totalRevenue,
        unbilledWork,
        projectCount: projects.length,
        projects: projects.map(p => ({
          name: p.name,
          total_revenue: p.total_revenue,
          budgetTotal: p.budgetTotal,
          budgetRemaining: p.budgetRemaining
        }))
      });
    }

    // Generate data points for the last 9 days
    const today = new Date();
    const data = [];
    
    // Ensure we have valid numbers
    const validTotalRevenue = isNaN(totalRevenue) ? 0 : totalRevenue;
    const validUnbilledWork = isNaN(unbilledWork) ? 0 : unbilledWork;
    
    for (let i = 8; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      
      // Show actual total revenue across all days (cumulative)
      // Unbilled work can vary slightly to show progression
      const variation = 0.8 + Math.random() * 0.3;
      data.push({
        date: date.toISOString().split('T')[0],
        totalRevenue: validTotalRevenue, // Actual total revenue from all projects
        unbilledWork: validUnbilledWork * variation,
      });
    }
    
    // DEBUG: Only log in development
    if (process.env.NODE_ENV === 'development') {
      console.log('Generated chart data:', data);
    }
    
    // Return same data for all filters (can be customized later)
    return {
      high: data,
      medium: data,
      low: data,
    };
  }, [projects]);

  // Current chart data based on filter
  const workToRevenueData = workToRevenueDataSets[chartFilter];

  // Calculate dynamic Y-axis configuration based on actual data
  const chartConfig = (() => {
    if (workToRevenueData.length === 0) {
      return { domain: [0, 30000], ticks: [0, 5000, 10000, 15000, 20000, 25000, 30000] };
    }

    // Find max value in the data
    const maxValue = Math.max(
      ...workToRevenueData.map(d => Math.max(d.totalRevenue, d.unbilledWork)),
      0 // Ensure at least 0
    );

    // DEBUG: Only log in development
    if (process.env.NODE_ENV === 'development') {
      console.log('Chart Config Calculation:', {
        maxValue,
        dataPoints: workToRevenueData.map(d => ({ totalRevenue: d.totalRevenue, unbilledWork: d.unbilledWork }))
      });
    }

    // If all values are zero or very small, use a default scale
    if (maxValue === 0 || maxValue < 1) {
      return { domain: [0, 10000], ticks: [0, 2000, 4000, 6000, 8000, 10000] };
    }

    // Round up to a nice number
    const magnitude = Math.pow(10, Math.floor(Math.log10(maxValue)));
    const maxRounded = Math.ceil(maxValue / magnitude) * magnitude;

    // Generate 6 evenly spaced ticks
    const tickCount = 6;
    const tickInterval = maxRounded / tickCount;
    const ticks = Array.from({ length: tickCount + 1 }, (_, i) => Math.round(i * tickInterval));

    // DEBUG: Only log in development
    if (process.env.NODE_ENV === 'development') {
      console.log('Generated ticks:', { magnitude, maxRounded, tickInterval, ticks });
    }

    return {
      domain: [0, maxRounded] as [number, number],
      ticks: ticks,
    };
  })();

  // Format Y-axis values based on magnitude
  const formatYAxis = (value: number) => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `${(value / 1000).toFixed(0)}k`;
    }
    return value.toString();
  };

  // Get date range for header
  const dateRange =
    workToRevenueData.length > 0 ?
      (() => {
        const firstDate = new Date(workToRevenueData[0].date);
        const lastDate = new Date(
          workToRevenueData[workToRevenueData.length - 1].date
        );
        const formatDate = (date: Date) =>
          date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
        return `${formatDate(firstDate)} - ${formatDate(lastDate)}`;
      })()
    : "";

  // Calendar modal state
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  // Selected date range
  // Removed unused selectedDateRange state

  // Project modal state
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);

  // Client modal state
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);

  // Project details sidebar state
  const [isProjectDetailsOpen, setIsProjectDetailsOpen] = useState(false);
  const [selectedProjectForDetails, setSelectedProjectForDetails] = useState<Project | null>(null);

  // Handle calendar click
  const handleCalendarClick = () => {
    setIsCalendarOpen(true);
  };

  // Handle date range selection
  const handleDateRangeSelect = (start: Date, end: Date) => {
    // Removed setSelectedDateRange as selectedDateRange is unused
    setIsCalendarOpen(false);
    // TODO: Update chart data based on selected date range (selectedDateRange removed as unused)
    console.log("Selected date range:", start, end);
  };

  // Handle project creation
  const handleProjectCreated = (projectId: string) => {
    setIsProjectModalOpen(false);
    // Navigate to the new project or refresh the dashboard
    router.push(`/projects/${projectId}`);
  };

  // Handle opening client modal from project modal
  const handleOpenClientModalFromProject = () => {
    setIsProjectModalOpen(false);
    setIsClientModalOpen(true);
  };

  // Handle client creation
  const handleClientCreated = (client: Client) => {
    setIsClientModalOpen(false);
    // Navigate to the new client or refresh the dashboard
    router.push(`/clients/${client.id}`);
  };

  // Handle project details sidebar
  const handleViewProject = async (projectId: string) => {
    try {
      // Fetch the full project details
      const project = await projectsApi.getProject(projectId);
      setSelectedProjectForDetails(project);
      setIsProjectDetailsOpen(true);
    } catch (error) {
      console.error('Failed to fetch project details:', error);
    }
  };

  const handleCloseProjectDetails = () => {
    setIsProjectDetailsOpen(false);
    setSelectedProjectForDetails(null);
  };

  if (authLoading) {
    return (
      <AuthGuard>
        <div className="min-h-screen flex items-center justify-center">
          <LoadingSpinner />
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="min-h-screen" style={{ backgroundColor: "#F5F5F5", willChange: 'contents' }}>
        <main>
          <div className="max-w-7xl mx-auto py-4 sm:py-8 px-4 sm:px-6 lg:px-8">
            {/* Page Header */}
            <div className="mb-4 sm:mb-6 flex items-center justify-between">
              <h2 className="text-xl sm:text-2xl font-normal text-black">Dashboard</h2>
              <div className="flex items-center gap-2">
                <Calendar
                  className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 cursor-pointer transform transition-transform duration-200 hover:scale-125 active:scale-110"
                  onClick={handleCalendarClick}
                />
                <span className="text-xs text-gray-600 hidden sm:inline">{dateRange}</span>
              </div>
            </div>

            {/* Work-to-Revenue Conversion Chart */}
            <div
              className="mb-6 sm:mb-8 rounded-xl sm:rounded-2xl p-4 sm:p-6 bg-white"
              style={{ outline: "none", border: "none" }}
              onClick={(e) => e.currentTarget.blur()}
            >
              <div className="mb-4 sm:mb-6">
                <h3 className="text-lg sm:text-xl font-medium text-black">
                  Financial Health
                </h3>
              </div>

              {/* Chart Legend */}
              <div className="flex items-center space-x-4 sm:space-x-6 mb-4 sm:mb-6">
                <div className="flex items-center space-x-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: "#8B5CF6" }}
                  ></div>
                  <span className="text-sm text-gray-700">Total Revenue</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: "#f59e0b" }}
                  ></div>
                  <span className="text-sm text-gray-700">Unbilled Work</span>
                </div>
              </div>

              <ResponsiveContainer width="100%" height={200} className="sm:h-[250px]">
                <LineChart
                  accessibilityLayer
                  data={workToRevenueData}
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
                    tick={{ fontSize: 11, fill: '#374151' }}
                  />
                  <Tooltip 
                    content={(props) => (
                      <CustomTooltip 
                        {...props} 
                        currency={currency} 
                        formatWithCurrency={formatWithCurrency}
                      />
                    )} 
                    cursor={false} 
                  />
                  <Line
                    dataKey="totalRevenue"
                    type="basis"
                    stroke="#8B5CF6"
                    strokeWidth={2}
                    dot={false}
                    name="Total Revenue"
                  />
                  <Line
                    dataKey="unbilledWork"
                    type="basis"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={false}
                    name="unbilledWork"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Project Health Section */}
            <div className="mb-6 sm:mb-8">
              {/* Page Section Header */}
              <div className="mb-4">
                <h3 className="text-lg sm:text-xl font-medium text-black">
                  Project Health
                </h3>
              </div>

              {/* Stats Cards - Clean Unified Style */}
              {(() => {
                // Calculate project statistics from actual data
                const totalProjects = projects.length;
                const completedProjects = projects.filter(p => p.status === 'completed').length;
                const pausedProjects = projects.filter(p => p.status === 'paused' || p.isPaused).length;
                const pendingCRs = pendingChangeRequests.filter(cr => cr.status === 'pending').length;
                const projectBalance = projects.reduce((sum, p) => sum + (p.budgetRemaining || 0), 0);

                // Calculate percentages
                const completedPercentage = totalProjects > 0 ? Math.round((completedProjects / totalProjects) * 100) : 0;
                const pausedPercentage = totalProjects > 0 ? Math.round((pausedProjects / totalProjects) * 100) : 0;
                const pendingCRsPercentage = 100 - completedPercentage - pausedPercentage;

                return (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                      {/* Total Projects */}
                      <div className="bg-white p-6 rounded-2xl border border-black/5">
                        <div className="flex flex-col h-full justify-between">
                           <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-4">Total Projects</div>
                           <div>
                              <div className="text-3xl font-bold text-black mb-2">{totalProjects}</div>
                              <div className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-[#ccff00]/20 border border-[#ccff00]/30">
                                 <div className="w-1.5 h-1.5 rounded-full bg-[#6db300]" />
                                 <span className="text-[10px] font-bold text-[#4d7d00] uppercase tracking-wide">Active</span>
                              </div>
                           </div>
                        </div>
                      </div>

                      {/* Completed */}
                      <div className="bg-white p-6 rounded-2xl border border-black/5">
                        <div className="flex flex-col h-full justify-between">
                           <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-4">Completed</div>
                           <div>
                              <div className="text-3xl font-bold text-black mb-2">{completedProjects}</div>
                              <span className="text-xs font-medium text-gray-400">{completedPercentage}% compilation</span>
                           </div>
                        </div>
                      </div>

                      {/* Paused */}
                      <div className="bg-white p-6 rounded-2xl border border-black/5">
                        <div className="flex flex-col h-full justify-between">
                           <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-4 text-red-400">Paused</div>
                           <div>
                              <div className="text-3xl font-bold text-black mb-2">{pausedProjects}</div>
                              <span className="text-xs font-medium text-gray-400 leading-tight block">Awaiting Input</span>
                           </div>
                        </div>
                      </div>

                      {/* Pending CRs */}
                      <div className="bg-white p-6 rounded-2xl border border-black/5 relative">
                        {pendingCRs > 0 && (
                           <div className="absolute top-4 right-4 w-2 h-2 bg-red-500 rounded-full" />
                        )}
                        <div className="flex flex-col h-full justify-between">
                           <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-4">Pending CRs</div>
                           <div>
                              <div className="text-3xl font-bold text-black mb-2">{pendingCRs}</div>
                              <span className="text-xs font-medium text-gray-400">Total requests</span>
                           </div>
                        </div>
                      </div>
                    </div>

                    {/* Additional Stats Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                      
                      {/* Project Balance Card */}
                      <div className="bg-white p-6 sm:p-8 rounded-2xl border border-black/5">
                        <div className="flex justify-between items-start mb-8">
                           <div>
                              <h4 className="text-lg font-bold text-black">Global Balance</h4>
                           </div>
                           <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center border border-gray-100">
                              <span className="font-bold text-lg text-black">$</span>
                           </div>
                        </div>

                        <div className="flex items-baseline gap-2 mb-4">
                           <span className="text-4xl sm:text-5xl font-bold text-black">
                             {formatWithCurrency(projectBalance, currency)}
                           </span>
                        </div>
                        
                        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                           Total Protected Funds in Escrow
                        </p>
                      </div>

                      {/* Completion Rate Card */}
                      <div className="bg-black p-6 sm:p-8 rounded-2xl text-white relative overflow-hidden">
                        <div className="flex items-center justify-between mb-6 relative z-10">
                           <span className="text-xs font-medium text-[#ccff00] uppercase tracking-wide">VERIFIED</span>
                        </div>

                        <div className="flex items-center gap-8 relative z-10">
                           <div className="relative w-32 h-32 flex-shrink-0">
                            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                              <path
                                d="M18,2.0845 a15.9155,15.9155 0 0,1 0,31.831 a15.9155,15.9155 0 0,1 0,-31.831"
                                fill="none"
                                stroke="#333"
                                strokeWidth="2"
                              />
                              <path
                                d="M18,2.0845 a15.9155,15.9155 0 0,1 0,31.831 a15.9155,15.9155 0 0,1 0,-31.831"
                                fill="none"
                                stroke="#ccff00"
                                strokeWidth="3"
                                strokeDasharray={`${completedPercentage}, 100`}
                              />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center flex-col">
                              <span className="text-2xl font-bold text-white">{completedPercentage}%</span>
                            </div>
                          </div>
                          
                          <div>
                             <h4 className="text-lg font-bold mb-2">Efficiency Rate</h4>
                             <p className="text-sm text-gray-400 leading-relaxed mb-4">
                                Projects compiled upon payment.
                             </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Budget Alerts Section */}
                    {budgetWarnings.length > 0 && (
                      <div className="bg-red-50 rounded-2xl p-6 sm:p-8 border border-red-100">
                        <div className="flex items-center gap-3 mb-4">
                           <div className="w-2 h-2 bg-red-500 rounded-full" />
                           <h4 className="text-sm font-bold text-red-600 uppercase tracking-wide">
                             Budget Alerts
                           </h4>
                        </div>
                        <div className="space-y-3">
                          {budgetWarnings.map((warning) => (
                            <div
                              key={warning.id}
                              className="flex items-center justify-between p-4 bg-white rounded-xl border border-red-100 shadow-sm"
                            >
                              <div>
                                 <div className="font-bold text-gray-900 mb-1">
                                   {warning.projectName} <span className="text-gray-400">/</span> {warning.clientName}
                                 </div>
                                 <div className="text-sm text-red-500 font-medium">
                                   {warning.message}
                                 </div>
                              </div>
                              <div className="text-right">
                                 <div className="text-sm font-bold text-black mb-1">
                                    {formatWithCurrency(warning.budgetRemaining, currency)}
                                 </div>
                                 <button
                                   onClick={() => router.push(`/projects/${warning.projectId}`)}
                                   className="text-xs font-bold uppercase tracking-wide text-red-500 hover:text-red-700 underline decoration-2 underline-offset-2"
                                 >
                                   Resolve
                                 </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            {isError && error && (
              <div className="mb-6 p-4 rounded-lg border-l-4 border-red-500 bg-red-900">
                <div className="flex">
                  <AlertCircle className="w-5 h-5 text-red-400 mr-2" />
                  <div>
                    <p className="text-sm text-red-300">{(error as Error).message || "Failed to load dashboard data. Please try again."}</p>
                    <button
                      onClick={() => refetch()}
                      className="mt-2 text-sm text-red-400 hover:text-red-300 font-medium"
                    >
                      Try again
                    </button>
                  </div>
                </div>
              </div>
            )}

            {isLoading ? (
              <>
                {/* Skeleton for metrics */}
                <div className="grid gap-6 mb-8" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
                  <SkeletonMetricCard />
                  <SkeletonMetricCard />
                  <SkeletonMetricCard />
                  <SkeletonMetricCard />
                </div>

                {/* Skeleton for chart */}
                <div className="mb-8">
                  <SkeletonChart />
                </div>

                {/* Skeleton for projects table - Compact style */}
                <div className="mb-8">
                  <div className="flex items-center justify-between mb-4">
                    <div className="h-5 bg-gray-300 rounded w-32 animate-pulse"></div>
                    <div className="h-4 bg-gray-200 rounded w-16 animate-pulse"></div>
                  </div>
                  <div className="space-y-0">
                    <div className="animate-pulse flex items-center space-x-4 py-3 border-b border-gray-200">
                      <div className="h-5 bg-gray-200 rounded w-16"></div>
                      <div className="flex-1 h-4 bg-gray-200 rounded w-40"></div>
                      <div className="h-4 bg-gray-200 rounded w-20"></div>
                      <div className="h-4 bg-gray-200 rounded w-12"></div>
                    </div>
                    <div className="animate-pulse flex items-center space-x-4 py-3 border-b border-gray-200">
                      <div className="h-5 bg-gray-200 rounded w-16"></div>
                      <div className="flex-1 h-4 bg-gray-200 rounded w-36"></div>
                      <div className="h-4 bg-gray-200 rounded w-20"></div>
                      <div className="h-4 bg-gray-200 rounded w-12"></div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Active Projects */}
                <div className="mb-8 rounded-2xl p-6 bg-white">
                  <div className="mb-6 flex items-center justify-between">
                    <h3 className="text-xl font-medium text-black">
                      Active Projects
                    </h3>
                    <button
                      onClick={() => router.push("/projects")}
                      className="text-sm font-medium text-black hover:text-gray-800 hover:scale-110 transition-transform duration-200"
                    >
                      View All
                    </button>
                  </div>
                  <div className="pt-6">
                    {/* Table Header */}
                    <div className="pb-4 border-b-2 border-gray-300">
                      <div className="flex items-center space-x-4">
                        <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide" style={{ width: '80px' }}>
                          Status
                        </div>
                        <div className="flex-1 grid grid-cols-2 gap-6">
                          <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                            Project Name
                          </div>
                          <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                            Client Name
                          </div>
                        </div>
                        <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide" style={{ width: '100px' }}>
                          Date
                        </div>
                        <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide" style={{ width: '60px' }}>
                          Action
                        </div>
                      </div>
                    </div>

                    {/* Project Rows */}
                    {projects.map((project, index) => (
                      <div
                        key={project.id}
                        className={`py-4 ${index !== projects.length - 1 ? 'border-b border-gray-200' : ''}`}
                      >
                        <div className="flex items-center space-x-4">
                          <span
                            className={`px-3 py-1 text-xs font-medium rounded-lg ${getStatusBadgeColor(
                              project.status
                            )}`}
                            style={{ width: '80px', textAlign: 'center' }}
                          >
                            {project.status.replace(/_/g, " ").toUpperCase()}
                          </span>
                          <div className="flex-1 grid grid-cols-2 gap-6">
                            <div className="text-sm font-semibold text-gray-900">
                              {project.name}
                            </div>
                            <div className="text-sm text-gray-600">
                              {project.clientName}
                            </div>
                          </div>
                          <div className="flex items-center text-xs text-gray-600" style={{ width: '100px' }}>
                            {new Date(project.lastActivity).toLocaleDateString("en-GB")}
                          </div>
                          <div style={{ width: '60px' }}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleViewProject(project.id);
                              }}
                              className="px-3 py-1 text-xs font-medium text-black rounded hover:scale-105 transition-transform duration-200"
                              style={{
                                backgroundColor: '#ccff00',
                                border: '1px solid #171717'
                              }}
                            >
                              View
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </main>

        {/* Calendar Modal */}
        <CalendarModal
          isOpen={isCalendarOpen}
          onClose={() => setIsCalendarOpen(false)}
          onDateRangeSelect={handleDateRangeSelect}
        />

        {/* Project Modal */}
        <ProjectModal
          isOpen={isProjectModalOpen}
          onClose={() => setIsProjectModalOpen(false)}
          onProjectCreated={handleProjectCreated}
          onClientModalOpen={handleOpenClientModalFromProject}
        />

        {/* Client Modal */}
        <ClientModal
          isOpen={isClientModalOpen}
          onClose={() => setIsClientModalOpen(false)}
          onClientCreated={handleClientCreated}
        />

        {/* Project Details Sidebar */}
        <ProjectDetailsSidebar
          project={selectedProjectForDetails}
          isOpen={isProjectDetailsOpen}
          onClose={handleCloseProjectDetails}
        />
      </div>
    </AuthGuard>
  );
}
