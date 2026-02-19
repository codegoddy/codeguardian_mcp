'use client';

import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  CheckCircle,
  Clock
} from 'lucide-react';
import { BudgetHealth, getBudgetHealth } from '@/services/paymentMilestones';

interface BudgetHealthWidgetProps {
  projectId: string;
  currency: string;
  onOverBudget?: (health: BudgetHealth) => void;
  compact?: boolean;
}

export default function BudgetHealthWidget({ 
  projectId, 
  currency,
  onOverBudget,
  compact = false 
}: BudgetHealthWidgetProps) {
  const [health, setHealth] = useState<BudgetHealth | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHealth();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const loadHealth = async () => {
    try {
      const data = await getBudgetHealth(projectId);
      setHealth(data);
      
      // Trigger callback if over budget
      if (data.status === 'over_budget' && onOverBudget) {
        onOverBudget(data);
      }
    } catch (error) {
      console.error('Failed to load budget health:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={`bg-[#1a1f2e]/60 rounded-xl border border-white/5 ${compact ? 'p-3' : 'p-4'}`}>
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-white/10 rounded w-1/2"></div>
          <div className="h-6 bg-white/10 rounded w-3/4"></div>
        </div>
      </div>
    );
  }

  if (!health || health.status === 'unknown') {
    return null;
  }

  const statusConfigs = {
    healthy: {
      icon: CheckCircle,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      barColor: 'bg-emerald-500',
      label: 'On Track'
    },
    at_risk: {
      icon: AlertTriangle,
      color: 'text-yellow-400',
      bg: 'bg-yellow-500/10',
      border: 'border-yellow-500/20',
      barColor: 'bg-yellow-500',
      label: 'At Risk'
    },
    over_budget: {
      icon: TrendingDown,
      color: 'text-red-400',
      bg: 'bg-red-500/10',
      border: 'border-red-500/20',
      barColor: 'bg-red-500',
      label: 'Over Budget'
    }
  };

  const config = statusConfigs[health.status] || statusConfigs.healthy;
  const StatusIcon = config.icon;

  const formatHours = (hours: number) => `${hours.toFixed(1)}h`;
  const formatCurrency = (amount: number) => `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  if (compact) {
    return (
      <div className={`${config.bg} rounded-lg px-3 py-2 border ${config.border}`}>
        <div className="flex items-center gap-2">
          <StatusIcon className={`w-4 h-4 ${config.color}`} />
          <span className={`text-sm font-medium ${config.color}`}>{config.label}</span>
          <span className="text-xs text-gray-400">
            {formatHours(health.actual_hours)} / {formatHours(health.budget_hours)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`${config.bg} rounded-xl border ${config.border} p-4`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <StatusIcon className={`w-5 h-5 ${config.color}`} />
          <span className="font-medium text-white">Budget Health</span>
        </div>
        <span className={`text-sm font-semibold ${config.color}`}>{config.label}</span>
      </div>

      {/* Hours Progress */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
          <span>Hours Used</span>
          <span>
            {formatHours(health.actual_hours)} / {formatHours(health.budget_hours)} ({health.budget_used_percent.toFixed(0)}%)
          </span>
        </div>
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <div 
            className={`h-full ${config.barColor} transition-all duration-500`}
            style={{ width: `${Math.min(health.budget_used_percent, 100)}%` }}
          />
        </div>
      </div>

      {/* Progress Comparison */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
          <span>Deliverables Complete</span>
          <span>{health.progress_percent.toFixed(0)}%</span>
        </div>
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <div 
            className="h-full bg-blue-500 transition-all duration-500"
            style={{ width: `${health.progress_percent}%` }}
          />
        </div>
      </div>

      {/* Pace Indicator */}
      <div className="flex items-center gap-3 text-xs">
        {health.budget_used_percent <= health.progress_percent ? (
          <div className="flex items-center gap-1 text-emerald-400">
            <TrendingUp className="w-3 h-3" />
            <span>Ahead of pace</span>
          </div>
        ) : health.budget_used_percent <= health.progress_percent + 15 ? (
          <div className="flex items-center gap-1 text-yellow-400">
            <Clock className="w-3 h-3" />
            <span>Slightly behind pace</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-red-400">
            <TrendingDown className="w-3 h-3" />
            <span>Behind pace</span>
          </div>
        )}
      </div>

      {/* Overage Info */}
      {health.overage_hours && health.overage_hours > 0 && (
        <div className="mt-4 pt-4 border-t border-white/10">
          <div className="flex items-center justify-between text-sm">
            <span className="text-red-400">Projected Overage</span>
            <div className="text-right">
              <span className="text-red-400 font-medium">+{formatHours(health.overage_hours)}</span>
              {health.overage_cost && (
                <span className="text-gray-400 ml-2">({formatCurrency(health.overage_cost)})</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-white/10">
        <div>
          <p className="text-xs text-gray-400">Remaining Est.</p>
          <p className="text-sm font-medium text-white">{formatHours(health.remaining_estimated)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Projected Total</p>
          <p className={`text-sm font-medium ${health.projected_total > health.budget_hours ? 'text-red-400' : 'text-white'}`}>
            {formatHours(health.projected_total)}
          </p>
        </div>
      </div>
    </div>
  );
}
