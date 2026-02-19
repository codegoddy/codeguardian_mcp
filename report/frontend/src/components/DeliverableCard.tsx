'use client';

import { Copy, Check, Activity } from 'lucide-react';
import { useState } from 'react';
import SessionIndicator from './SessionIndicator';
import { DeliverableActivityModal } from './activity/DeliverableActivityModal';

interface DeliverableCardProps {
  deliverable: {
    id: string;
    title: string;
    description?: string | null;
    status: string;
    tracking_code?: string;
    git_branch_pattern?: string;
    estimated_hours?: number | null;
    actual_hours?: number | null;
    total_cost?: number | null;
  };
  contractSigned?: boolean;
  currencySymbol?: string;
  onClick?: () => void;
  activeSession?: {
    id: string;
    tracking_code: string;
    status: 'active' | 'paused';
    start_time: string;
    accumulated_minutes: number;
  } | null;
}

export default function DeliverableCard({
  deliverable,
  contractSigned = false,
  currencySymbol = '$',
  onClick,
  activeSession = null,
}: DeliverableCardProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-[#ccff00] text-black';
      case 'in_progress':
        return 'bg-black text-white';
      case 'verified':
        return 'bg-[#ccff00] text-black';
      default:
        return 'bg-white text-black border-2 border-black';
    }
  };

  const formatStatus = (status: string) => {
    return status.replace('_', ' ').toUpperCase();
  };

  return (
    <>
      <div
        className="group relative p-4 bg-white border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
        onClick={onClick}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pr-24">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h3 className="text-base font-semibold text-gray-900 truncate">
                {deliverable.title}
              </h3>
              <div className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(deliverable.status)}`}>
                {formatStatus(deliverable.status)}
              </div>
              {deliverable.tracking_code && contractSigned && (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 font-mono border border-gray-200">
                  <span>{deliverable.tracking_code}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      copyToClipboard(deliverable.tracking_code!, 'code');
                    }}
                    className="hover:text-black"
                  >
                    {copied === 'code' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              )}
              {activeSession && activeSession.tracking_code === deliverable.tracking_code && (
                <SessionIndicator session={activeSession} />
              )}
            </div>
            
            {deliverable.description && (
              <p className="text-sm text-gray-500 truncate mb-2">
                {deliverable.description}
              </p>
            )}

            <div className="flex items-center gap-6 text-sm text-gray-500">
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-gray-900">
                  {Number(deliverable.actual_hours || 0).toFixed(1)}h
                </span>
                <span className="text-gray-400">/</span>
                <span>{Number(deliverable.estimated_hours || 0).toFixed(1)}h est</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-gray-900">
                  {currencySymbol}{Number(deliverable.total_cost || 0).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Activity Button */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsActivityModalOpen(true);
            }}
            className="email-button flex items-center gap-2 px-3 py-2 text-sm font-bold"
            title="View Activity"
          >
            <Activity className="w-4 h-4" />
            <span>View Activity</span>
          </button>
        </div>
      </div>

      <DeliverableActivityModal
        isOpen={isActivityModalOpen}
        onClose={() => setIsActivityModalOpen(false)}
        deliverableId={deliverable.id}
        deliverableTitle={deliverable.title}
      />
    </>
  );
}
