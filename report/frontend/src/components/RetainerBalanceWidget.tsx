'use client';

import { useMemo } from 'react';

interface RetainerBalanceWidgetProps {
  projectBudget: number;
  currentBudgetRemaining: number;
  autoPauseThreshold: number;
  currency?: string;
}

export default function RetainerBalanceWidget({
  projectBudget,
  currentBudgetRemaining,
  autoPauseThreshold,
  currency = 'USD'
}: RetainerBalanceWidgetProps) {
  const budgetPercentage = useMemo(() => {
    if (projectBudget <= 0) return 0;
    return (currentBudgetRemaining / projectBudget) * 100;
  }, [projectBudget, currentBudgetRemaining]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const getStatusColor = () => {
    if (budgetPercentage <= 0) return 'bg-red-500';
    if (budgetPercentage <= autoPauseThreshold) return 'bg-red-500';
    if (budgetPercentage <= 20) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getStatusText = () => {
    if (budgetPercentage <= 0) return 'Budget Depleted';
    if (budgetPercentage <= autoPauseThreshold) return 'Critical - Auto-Pause Active';
    if (budgetPercentage <= 20) return 'Low Budget Warning';
    return 'Budget Healthy';
  };

  const getTextColor = () => {
    if (budgetPercentage <= autoPauseThreshold) return 'text-red-600';
    if (budgetPercentage <= 20) return 'text-yellow-600';
    return 'text-green-600';
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Budget Status</h3>
        <span className={`text-sm font-medium ${getTextColor()}`}>
          {getStatusText()}
        </span>
      </div>

      {/* Budget Progress Bar */}
      <div className="mb-4">
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>Remaining</span>
          <span>{budgetPercentage.toFixed(1)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${getStatusColor()}`}
            style={{ width: `${Math.max(0, Math.min(100, budgetPercentage))}%` }}
          />
        </div>
      </div>

      {/* Budget Details */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Budget Remaining:</span>
          <span className="text-lg font-bold text-gray-900">
            {formatCurrency(currentBudgetRemaining)}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Total Budget:</span>
          <span className="text-sm font-medium text-gray-700">
            {formatCurrency(projectBudget)}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Budget Used:</span>
          <span className="text-sm font-medium text-gray-700">
            {formatCurrency(projectBudget - currentBudgetRemaining)}
          </span>
        </div>
      </div>

      {/* Auto-Pause Threshold Indicator */}
      {budgetPercentage > autoPauseThreshold && budgetPercentage <= 20 && (
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
          <p className="text-sm text-yellow-800">
            <span className="font-semibold">Warning:</span> Budget is running low. 
            Auto-Pause will trigger at {autoPauseThreshold}% remaining.
          </p>
        </div>
      )}

      {budgetPercentage <= autoPauseThreshold && budgetPercentage > 0 && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-800">
            <span className="font-semibold">Critical:</span> Budget has reached the 
            auto-pause threshold. Repository access may be restricted.
          </p>
        </div>
      )}

      {budgetPercentage <= 0 && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-800">
            <span className="font-semibold">Budget Depleted:</span> All work has been 
            paused. Please replenish the budget to continue.
          </p>
        </div>
      )}
    </div>
  );
}
