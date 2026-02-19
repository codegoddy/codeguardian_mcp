'use client';

import { useEffect, useState } from 'react';
import { Clock, TrendingUp, TrendingDown, GitCommit, AlertTriangle, CheckCircle } from 'lucide-react';
import ApiService from '@/services/api';

interface TimeEntry {
  id: string;
  deliverable_id: string;
  commit_hash: string | null;
  commit_message: string | null;
  commit_timestamp: string | null;
  calculated_hours: number | null;
  manual_hours: number | null;
  final_hours: number | null;
  developer_email: string | null;
  auto_tracked: boolean;
  verified: boolean;
  notes: string | null;
  created_at: string;
}

interface DeliverableTimeStats {
  deliverable_id: string;
  deliverable_title: string;
  estimated_hours: number | null;
  actual_hours: number | null;
  calculated_hours: number | null;
  hours_remaining: number | null;
  usage_percentage: number | null;
  variance_hours: number | null;
  variance_percentage: number | null;
  commit_count: number;
  entry_count: number;
  entries: TimeEntry[];
}

interface TimeTrackingDisplayProps {
  deliverableId: number;
  onRefresh?: () => void;
}

export default function TimeTrackingDisplay({
  deliverableId,
  onRefresh,
}: TimeTrackingDisplayProps) {
  const [stats, setStats] = useState<DeliverableTimeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTimeStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliverableId]);

  const loadTimeStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await ApiService.get<DeliverableTimeStats>(
        `/time-entries/deliverable/${deliverableId}`
      );
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load time tracking data');
      console.error('Error loading time stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const getProgressColor = (percentage: number | null) => {
    if (!percentage) return 'bg-gray-400';
    if (percentage <= 75) return 'bg-green-500';
    if (percentage <= 90) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getProgressBgColor = (percentage: number | null) => {
    if (!percentage) return 'bg-gray-100';
    if (percentage <= 75) return 'bg-green-100';
    if (percentage <= 90) return 'bg-yellow-100';
    return 'bg-red-100';
  };

  const getVarianceColor = (variance: number | null) => {
    if (!variance) return 'text-gray-600';
    if (variance <= 0) return 'text-green-600';
    if (variance <= 2) return 'text-yellow-600';
    return 'text-red-600';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  if (loading) {
    return (
      <div className="border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          <span className="ml-3 text-gray-600">Loading time tracking...</span>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="border border-gray-200 rounded-lg p-6">
        <div className="text-center py-8">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <p className="text-red-600 mb-4">{error || 'Failed to load time tracking data'}</p>
          <button
            onClick={loadTimeStats}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const usagePercentage = stats.usage_percentage || 0;
  const estimatedHours = stats.estimated_hours || 0;
  const actualHours = stats.actual_hours || 0;
  const hoursRemaining = stats.hours_remaining || 0;
  const varianceHours = stats.variance_hours || 0;

  return (
    <div className="border border-gray-200 rounded-lg p-6 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
          <Clock className="w-5 h-5 mr-2" />
          Time Tracking
        </h3>
        <button
          onClick={() => {
            loadTimeStats();
            onRefresh?.();
          }}
          className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Budget Progress */}
      <div className={`p-4 rounded-lg mb-6 ${getProgressBgColor(usagePercentage)}`}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-medium text-gray-900">Budget Progress</p>
            <p className="text-xs text-gray-600 mt-1">
              {actualHours.toFixed(1)}h of {estimatedHours.toFixed(1)}h used
            </p>
          </div>
          <div className="text-right">
            <p className={`text-2xl font-bold ${getVarianceColor(varianceHours)}`}>
              {usagePercentage.toFixed(0)}%
            </p>
            <p className="text-xs text-gray-600">
              {hoursRemaining.toFixed(1)}h remaining
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
          <div
            className={`h-3 rounded-full transition-all duration-300 ${getProgressColor(usagePercentage)}`}
            style={{ width: `${Math.min(usagePercentage, 100)}%` }}
          ></div>
        </div>

        {/* Budget Alert */}
        {usagePercentage > 90 && (
          <div className="mt-3 flex items-start space-x-2">
            <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-red-700">
              <strong>Budget Alert:</strong> This deliverable is approaching its time budget. Consider reviewing scope or requesting additional hours.
            </p>
          </div>
        )}

        {usagePercentage > 75 && usagePercentage <= 90 && (
          <div className="mt-3 flex items-start space-x-2">
            <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-yellow-700">
              <strong>Warning:</strong> This deliverable has used over 75% of its time budget.
            </p>
          </div>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-50 p-3 rounded-lg">
          <div className="flex items-center space-x-2 mb-1">
            <GitCommit className="w-4 h-4 text-gray-500" />
            <p className="text-xs text-gray-600">Commits</p>
          </div>
          <p className="text-xl font-bold text-gray-900">{stats.commit_count}</p>
        </div>

        <div className="bg-gray-50 p-3 rounded-lg">
          <div className="flex items-center space-x-2 mb-1">
            <Clock className="w-4 h-4 text-gray-500" />
            <p className="text-xs text-gray-600">Time Entries</p>
          </div>
          <p className="text-xl font-bold text-gray-900">{stats.entry_count}</p>
        </div>

        <div className="bg-gray-50 p-3 rounded-lg">
          <div className="flex items-center space-x-2 mb-1">
            {varianceHours <= 0 ? (
              <TrendingDown className="w-4 h-4 text-green-500" />
            ) : (
              <TrendingUp className="w-4 h-4 text-red-500" />
            )}
            <p className="text-xs text-gray-600">Variance</p>
          </div>
          <p className={`text-xl font-bold ${getVarianceColor(varianceHours)}`}>
            {varianceHours > 0 ? '+' : ''}{varianceHours.toFixed(1)}h
          </p>
        </div>

        <div className="bg-gray-50 p-3 rounded-lg">
          <div className="flex items-center space-x-2 mb-1">
            <CheckCircle className="w-4 h-4 text-gray-500" />
            <p className="text-xs text-gray-600">Status</p>
          </div>
          <p className={`text-sm font-semibold ${
            usagePercentage <= 75 ? 'text-green-600' : 
            usagePercentage <= 90 ? 'text-yellow-600' : 
            'text-red-600'
          }`}>
            {usagePercentage <= 75 ? 'On Track' : 
             usagePercentage <= 90 ? 'Monitor' : 
             'Over Budget'}
          </p>
        </div>
      </div>

      {/* Time Entries List */}
      <div>
        <h4 className="text-sm font-semibold text-gray-900 mb-3">Recent Activity</h4>
        {stats.entries.length === 0 ? (
          <div className="text-center py-6 bg-gray-50 rounded-lg">
            <Clock className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No time entries yet</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {stats.entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-1">
                    {entry.auto_tracked ? (
                      <GitCommit className="w-3 h-3 text-purple-500 flex-shrink-0" />
                    ) : (
                      <Clock className="w-3 h-3 text-blue-500 flex-shrink-0" />
                    )}
                    <p className="text-xs font-medium text-gray-900 truncate">
                      {entry.commit_message || entry.notes || 'Manual time entry'}
                    </p>
                  </div>
                  <div className="flex items-center space-x-3 text-xs text-gray-500">
                    <span>{formatDate(entry.created_at)}</span>
                    {entry.developer_email && (
                      <span className="truncate">{entry.developer_email}</span>
                    )}
                  </div>
                </div>
                <div className="text-right ml-3 flex-shrink-0">
                  <p className="text-sm font-bold text-gray-900">
                    {(entry.final_hours || 0).toFixed(1)}h
                  </p>
                  <p className="text-xs text-gray-500">
                    {entry.auto_tracked ? 'Auto' : 'Manual'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
