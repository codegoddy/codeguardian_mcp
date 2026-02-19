'use client';

import { useMemo } from 'react';

interface AutoPauseBannerProps {
  projectBudget: number;
  currentBudgetRemaining: number;
  autoPauseThreshold: number;
  projectStatus: string;
  projectName: string;
  onReplenishBudget?: () => void;
}

export default function AutoPauseBanner({
  projectBudget,
  currentBudgetRemaining,
  autoPauseThreshold,
  projectStatus,
  projectName,
  onReplenishBudget
}: AutoPauseBannerProps) {
  const budgetPercentage = useMemo(() => {
    if (projectBudget <= 0) return 0;
    return (currentBudgetRemaining / projectBudget) * 100;
  }, [projectBudget, currentBudgetRemaining]);

  // Don't show banner if budget is healthy (above 20%)
  if (budgetPercentage > 20) {
    return null;
  }

  // Yellow warning banner (20% - auto-pause threshold)
  if (budgetPercentage > autoPauseThreshold && budgetPercentage <= 20) {
    return (
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <svg
              className="h-5 w-5 text-yellow-400"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="ml-3 flex-1">
            <h3 className="text-sm font-medium text-yellow-800">
              Low Budget Warning
            </h3>
            <div className="mt-2 text-sm text-yellow-700">
              <p>
                Project <span className="font-semibold">{projectName}</span> has only{' '}
                <span className="font-semibold">{budgetPercentage.toFixed(1)}%</span> of 
                budget remaining. Auto-Pause will trigger at{' '}
                <span className="font-semibold">{autoPauseThreshold}%</span>.
              </p>
              <p className="mt-1">
                Consider replenishing the budget to avoid work interruption.
              </p>
            </div>
            {onReplenishBudget && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={onReplenishBudget}
                  className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-yellow-700 bg-yellow-100 hover:bg-yellow-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
                >
                  Replenish Budget
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Red critical banner (at or below auto-pause threshold or paused)
  if (budgetPercentage <= autoPauseThreshold || projectStatus === 'paused') {
    return (
      <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <svg
              className="h-5 w-5 text-red-400"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="ml-3 flex-1">
            <h3 className="text-sm font-medium text-red-800">
              {projectStatus === 'paused' ? 'Auto-Pause Active' : 'Critical Budget Alert'}
            </h3>
            <div className="mt-2 text-sm text-red-700">
              {projectStatus === 'paused' ? (
                <>
                  <p>
                    Project <span className="font-semibold">{projectName}</span> has been 
                    automatically paused due to depleted budget.
                  </p>
                  <p className="mt-1">
                    <span className="font-semibold">Repository access has been restricted.</span>{' '}
                    All work is on hold until the budget is replenished.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    Project <span className="font-semibold">{projectName}</span> has reached 
                    the auto-pause threshold with only{' '}
                    <span className="font-semibold">{budgetPercentage.toFixed(1)}%</span> remaining.
                  </p>
                  <p className="mt-1">
                    <span className="font-semibold">Work will be paused automatically</span> if 
                    the budget is not replenished immediately.
                  </p>
                </>
              )}
            </div>
            {onReplenishBudget && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={onReplenishBudget}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                >
                  Replenish Budget Now
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
