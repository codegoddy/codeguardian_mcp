'use client';

import { useState } from 'react';

interface TimeEntry {
  id: string;
  description: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  cost: number;
  source: 'manual' | 'git_commit' | 'git_pr';
  git_commit_sha?: string;
  git_commit_message?: string;
  auto_generated: boolean;
  created_at: string;
}

interface CommitHistoryProps {
  timeEntries: TimeEntry[];
}

export default function CommitHistory({ timeEntries }: CommitHistoryProps) {
  const [filter, setFilter] = useState<'all' | 'auto' | 'manual'>('all');

  const filteredEntries = timeEntries.filter((entry) => {
    if (filter === 'auto') return entry.auto_generated;
    if (filter === 'manual') return !entry.auto_generated;
    return true;
  });

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getSourceIcon = (source: string) => {
    if (source === 'git_commit') {
      return (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z"
            clipRule="evenodd"
          />
        </svg>
      );
    }
    return (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
      </svg>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Time Tracking History</h3>
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 text-sm rounded-md ${
              filter === 'all'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('auto')}
            className={`px-3 py-1 text-sm rounded-md ${
              filter === 'auto'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Auto-tracked
          </button>
          <button
            onClick={() => setFilter('manual')}
            className={`px-3 py-1 text-sm rounded-md ${
              filter === 'manual'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Manual
          </button>
        </div>
      </div>

      {filteredEntries.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No time entries</h3>
          <p className="mt-1 text-sm text-gray-500">
            {filter === 'auto'
              ? 'Make commits with task references to auto-track time'
              : 'Get started by tracking your time'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEntries.map((entry) => (
            <div
              key={entry.id}
              className="border border-gray-200 rounded-lg p-4 hover:border-indigo-300 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                        entry.auto_generated
                          ? 'bg-green-100 text-green-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {getSourceIcon(entry.source)}
                      {entry.auto_generated ? 'Auto-tracked' : 'Manual'}
                    </span>
                    <span className="text-sm text-gray-500">
                      {formatDate(entry.start_time)}
                    </span>
                  </div>

                  <p className="text-sm font-medium text-gray-900 mb-1">
                    {entry.description}
                  </p>

                  {entry.git_commit_message && (
                    <div className="mt-2 p-2 bg-gray-50 rounded text-xs font-mono text-gray-700">
                      {entry.git_commit_message}
                    </div>
                  )}

                  {entry.git_commit_sha && (
                    <p className="mt-2 text-xs text-gray-500">
                      Commit: <code className="font-mono">{entry.git_commit_sha.substring(0, 7)}</code>
                    </p>
                  )}
                </div>

                <div className="text-right ml-4">
                  <p className="text-lg font-semibold text-gray-900">
                    {formatDuration(entry.duration_minutes)}
                  </p>
                  <p className="text-sm text-gray-600">${entry.cost.toFixed(2)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
