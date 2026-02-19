'use client';

import { useEffect, useState } from 'react';
import { milestonesApi, Milestone } from '@/services/milestones';
import { CheckCircle, Clock, Target, TrendingUp, AlertCircle } from 'lucide-react';
import LoadingSpinner from '@/components/LoadingSpinner';

interface MilestoneSectionProps {
  projectId: string;
}

export default function MilestoneSection({ projectId }: MilestoneSectionProps) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMilestones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const loadMilestones = async () => {
    try {
      setLoading(true);
      const data = await milestonesApi.listMilestones(projectId);
      setMilestones(data || []);
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to load milestones');
      console.error(err);
      setMilestones([]);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { color: string; text: string; icon: React.ReactNode }> = {
      pending: { 
        color: 'bg-gray-100 text-gray-800', 
        text: 'Pending',
        icon: <Clock className="h-3 w-3" />
      },
      in_progress: { 
        color: 'bg-blue-100 text-blue-800', 
        text: 'In Progress',
        icon: <TrendingUp className="h-3 w-3" />
      },
      completed: { 
        color: 'bg-green-100 text-green-800', 
        text: 'Completed',
        icon: <CheckCircle className="h-3 w-3" />
      },
      billed: { 
        color: 'bg-purple-100 text-purple-800', 
        text: 'Billed',
        icon: <CheckCircle className="h-3 w-3" />
      },
    };
    const badge = badges[status] || badges.pending;
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
        {badge.icon}
        {badge.text}
      </span>
    );
  };

  const getProgressPercentage = (milestone: Milestone) => {
    if (milestone.total_deliverables === 0) return 0;
    return Math.round((milestone.completed_deliverables / milestone.total_deliverables) * 100);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'No target date';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const isOverdue = (targetDate: string | null, status: string) => {
    if (!targetDate || status === 'completed' || status === 'billed') return false;
    return new Date(targetDate) < new Date();
  };

  if (loading) {
    return (
      <div className="email-section p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Milestones</h3>
        <div className="flex items-center justify-center py-8">
          <LoadingSpinner size="md" color="black" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="email-section p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Milestones</h3>
        <div className="flex items-center justify-center py-8 text-red-600">
          <AlertCircle className="h-5 w-5 mr-2" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (!milestones || milestones.length === 0) {
    return (
      <div className="email-section p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Milestones</h3>
        <div className="text-center py-8">
          <Target className="h-12 w-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600">No milestones yet</p>
          <p className="text-sm text-gray-500 mt-1">Create milestones to track project progress</p>
        </div>
      </div>
    );
  }

  return (
    <div className="email-section p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Milestones</h3>
        <div className="text-sm text-gray-600">
          {milestones.filter(m => m.status === 'completed').length} of {milestones.length} completed
        </div>
      </div>

      <div className="space-y-4">
        {milestones.map((milestone) => {
          const progress = getProgressPercentage(milestone);
          const overdue = isOverdue(milestone.target_date, milestone.status);

          return (
            <div key={milestone.id} className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
              {/* Milestone Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold text-gray-900">{milestone.name}</h4>
                    {getStatusBadge(milestone.status)}
                  </div>
                  {milestone.description && (
                    <p className="text-sm text-gray-600 mt-1">{milestone.description}</p>
                  )}
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mb-3">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-gray-600">Progress</span>
                  <span className="font-medium text-gray-900">{progress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      milestone.status === 'completed' 
                        ? 'bg-green-500' 
                        : milestone.status === 'in_progress'
                        ? 'bg-blue-500'
                        : 'bg-gray-400'
                    }`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              {/* Milestone Stats */}
              <div className="grid grid-cols-3 gap-4 mb-3">
                <div>
                  <p className="text-xs text-gray-500">Total</p>
                  <p className="text-sm font-semibold text-gray-900">{milestone.total_deliverables}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Completed</p>
                  <p className="text-sm font-semibold text-green-600">{milestone.completed_deliverables}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Ready to Bill</p>
                  <p className="text-sm font-semibold text-purple-600">{milestone.ready_to_bill_deliverables}</p>
                </div>
              </div>

              {/* Target Date */}
              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <div className="flex items-center text-sm">
                  <Target className="h-4 w-4 text-gray-400 mr-1" />
                  <span className={overdue ? 'text-red-600 font-medium' : 'text-gray-600'}>
                    {formatDate(milestone.target_date)}
                    {overdue && ' (Overdue)'}
                  </span>
                </div>
                {milestone.completed_at && (
                  <div className="flex items-center text-sm text-green-600">
                    <CheckCircle className="h-4 w-4 mr-1" />
                    <span>Completed {formatDate(milestone.completed_at)}</span>
                  </div>
                )}
              </div>

              {/* Ready to Bill Indicator */}
              {milestone.status === 'completed' && milestone.ready_to_bill_deliverables === milestone.total_deliverables && (
                <div className="mt-3 p-2 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-800 font-medium flex items-center">
                    <CheckCircle className="h-4 w-4 mr-2" />
                    All deliverables ready to bill - Invoice can be generated
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Milestone Timeline Visualization */}
      {milestones.length > 1 && (
        <div className="mt-6 pt-6 border-t border-gray-200">
          <h4 className="text-sm font-semibold text-gray-900 mb-4">Timeline</h4>
          <div className="relative">
            {/* Timeline Line */}
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />
            
            {/* Timeline Items */}
            <div className="space-y-4">
              {milestones.map((milestone, index) => (
                <div key={milestone.id} className="relative flex items-start">
                  {/* Timeline Dot */}
                  <div className={`relative z-10 flex items-center justify-center w-8 h-8 rounded-full border-2 ${
                    milestone.status === 'completed' 
                      ? 'bg-green-500 border-green-500' 
                      : milestone.status === 'in_progress'
                      ? 'bg-blue-500 border-blue-500'
                      : 'bg-white border-gray-300'
                  }`}>
                    {milestone.status === 'completed' ? (
                      <CheckCircle className="h-4 w-4 text-white" />
                    ) : (
                      <span className="text-xs font-semibold text-gray-600">{index + 1}</span>
                    )}
                  </div>
                  
                  {/* Timeline Content */}
                  <div className="ml-4 flex-1">
                    <p className="text-sm font-medium text-gray-900">{milestone.name}</p>
                    <p className="text-xs text-gray-500">
                      {milestone.completed_deliverables}/{milestone.total_deliverables} deliverables
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
