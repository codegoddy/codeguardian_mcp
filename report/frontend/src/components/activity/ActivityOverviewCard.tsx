import React from 'react';
import { Activity, GitCommit, Clock, FileCode } from 'lucide-react';
import { DeliverableActivity } from '@/services/deliverables';

interface ActivityOverviewCardProps {
  activity: DeliverableActivity;
}

export const ActivityOverviewCard: React.FC<ActivityOverviewCardProps> = ({ activity }) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div className="email-card p-4">
        <div className="flex items-center gap-2 text-white/70 mb-1">
          <GitCommit className="w-4 h-4" />
          <span className="text-xs font-bold tracking-tighter uppercase">Commits</span>
        </div>
        <div className="text-2xl font-black tracking-tighter text-white">{activity.activity_metrics.total_commits}</div>
      </div>

      <div className="email-card p-4">
        <div className="flex items-center gap-2 text-white/70 mb-1">
          <Clock className="w-4 h-4" />
          <span className="text-xs font-bold tracking-tighter uppercase">Hours Logged</span>
        </div>
        <div className="text-2xl font-black tracking-tighter text-white">{activity.deliverable.actual_hours.toFixed(1)}h</div>
      </div>

      <div className="email-card p-4">
        <div className="flex items-center gap-2 text-white/70 mb-1">
          <FileCode className="w-4 h-4" />
          <span className="text-xs font-bold tracking-tighter uppercase">Files Changed</span>
        </div>
        <div className="text-2xl font-black tracking-tighter text-white">{activity.activity_metrics.total_files_changed}</div>
      </div>

      <div className="email-card p-4">
        <div className="flex items-center gap-2 text-white/70 mb-1">
          <Activity className="w-4 h-4" />
          <span className="text-xs font-bold tracking-tighter uppercase">Impact</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-black tracking-tighter text-[#ccff00]">+{activity.activity_metrics.total_insertions}</span>
          <span className="text-sm font-bold text-red-400">-{activity.activity_metrics.total_deletions}</span>
        </div>
      </div>
    </div>
  );
};
