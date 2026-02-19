import React from 'react';
import { GitCommit, FileCode, Clock } from 'lucide-react';
import { format } from 'date-fns';

interface Commit {
  sha: string;
  message: string;
  author: string;
  committed_at: string;
  files_changed: number;
  insertions: number;
  deletions: number;
}

interface CommitTimelineProps {
  commits: Commit[];
}

export const CommitTimeline: React.FC<CommitTimelineProps> = ({ commits }) => {
  if (!commits || commits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-black">
        <GitCommit className="w-12 h-12 mb-2 opacity-20" />
        <p className="font-medium">No commits linked to this deliverable yet.</p>
      </div>
    );
  }

  return (
    <div className="relative pl-6 border-l-2 border-black space-y-6">
      {commits.map((commit) => (
        <div key={commit.sha} className="relative">
          {/* Timeline dot */}
          <div className="absolute -left-[31px] top-1 w-4 h-4 bg-[#ccff00] border-2 border-black" />
          
          <div className="bg-white p-4 border-2 border-black" style={{ boxShadow: '4px 4px 0px 0px #000' }}>
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs bg-black text-[#ccff00] px-2 py-1 font-bold">
                  {commit.sha.substring(0, 7)}
                </span>
              </div>
              <div className="text-xs font-medium text-black/70 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {format(new Date(commit.committed_at), 'MMM d, yyyy HH:mm')}
              </div>
            </div>
            
            <p className="text-black font-bold mb-3">{commit.message}</p>
            
            <div className="flex items-center gap-4 text-sm text-black">
              <div className="flex items-center gap-1 font-medium">
                <FileCode className="w-4 h-4" />
                <span>{commit.files_changed} files</span>
              </div>
              <div className="flex items-center gap-3 font-mono text-xs font-bold">
                <span className="text-green-600">+{commit.insertions}</span>
                <span className="text-red-600">-{commit.deletions}</span>
              </div>
              <div className="ml-auto text-xs font-medium text-black/70">
                by {commit.author}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
