import React, { useEffect, useState, useCallback } from 'react';
import { X, Paperclip, ExternalLink, Download } from 'lucide-react';
import { deliverablesApi, DeliverableActivity } from '@/services/deliverables';
import { CommitTimeline } from './CommitTimeline';
import { ActivityOverviewCard } from './ActivityOverviewCard';

interface DeliverableActivityModalProps {
  isOpen: boolean;
  onClose: () => void;
  deliverableId: string;
  deliverableTitle: string;
  fetchActivity?: (id: string) => Promise<DeliverableActivity>;
}

export const DeliverableActivityModal: React.FC<DeliverableActivityModalProps> = ({
  isOpen,
  onClose,
  deliverableId,
  deliverableTitle,
  fetchActivity,
}) => {
  const [activity, setActivity] = useState<DeliverableActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadActivity = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = fetchActivity 
        ? await fetchActivity(deliverableId)
        : await deliverablesApi.getDeliverableActivity(deliverableId);
      setActivity(data);
    } catch (err) {
      // Check if it's a 404 error
      const error = err as { message?: string; status?: number };
      if (error?.message?.includes('404') || error?.status === 404) {
        setError('This deliverable no longer exists. Please refresh the page.');
      } else {
        setError('Failed to load activity data');
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [deliverableId, fetchActivity]);

  useEffect(() => {
    if (isOpen && deliverableId) {
      loadActivity();
    }
  }, [isOpen, deliverableId, loadActivity]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div 
        className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col relative"
        style={{
          border: "2px solid #000",
          boxShadow: "4px 4px 0px 0px #000",
        }}
      >
        {/* Header */}
        <div className="flex-shrink-0 bg-white border-b-2 border-black p-6 flex items-center justify-between z-10 rounded-t-lg">
          <div>
            <h2 className="text-2xl font-black tracking-tighter text-black">Developer Activity</h2>
            <p className="text-sm text-gray-600 mt-1">
              {deliverableTitle}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-white">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-4 border-black"></div>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-black font-bold mb-4">{error}</p>
              <button
                onClick={loadActivity}
                className="email-button px-6 py-2 text-sm font-bold"
              >
                Try Again
              </button>
            </div>
          ) : activity ? (
            <>
              <ActivityOverviewCard activity={activity} />
              
              <div className="mt-8">
                <h3 className="text-xl font-black tracking-tighter text-black mb-4">Commit History</h3>
                <CommitTimeline commits={activity.commits} />
              </div>

              {activity.time_entries.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-xl font-black tracking-tighter text-black mb-4">Time Logs</h3>
                  <div className="email-card p-4 space-y-3">
                    {activity.time_entries.map((entry) => (
                      <div key={entry.id} className="border-b-2 border-white/20 last:border-0 pb-3 last:pb-0">
                        <div className="flex justify-between items-center text-sm">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-[#ccff00]"></span>
                            <span className="text-white font-medium">
                              {new Date(entry.start_time).toLocaleDateString()}
                            </span>
                            <span className="text-white/70">
                              {new Date(entry.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <div className="font-bold text-white">
                            {Math.round(entry.duration_hours * 60)} mins
                          </div>
                        </div>
                        {entry.developer_notes && entry.notes_visible_to_client && (
                          <div className="mt-2 ml-4 p-3 bg-[#ccff00] border-2 border-black">
                            <p className="text-xs font-black tracking-tighter text-black mb-1">📝 Developer Note:</p>
                            <p className="text-sm font-medium text-black">{entry.developer_notes}</p>
                          </div>
                        )}
                        
                        {/* Attachments */}
                        {entry.attachments && entry.attachments.length > 0 && (
                          <div className="mt-2 ml-4 space-y-2">
                            <p className="text-xs font-black tracking-tighter text-white mb-1">📎 Attachments:</p>
                            {entry.attachments.map((att, idx) => (
                              <a
                                key={idx}
                                href={att.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 p-2 bg-white border-2 border-black hover:bg-[#ccff00] transition-colors"
                              >
                                <Paperclip className="w-4 h-4 text-black flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium text-black truncate">{att.filename}</div>
                                  <div className="text-xs text-gray-600">{(att.size / 1024).toFixed(1)} KB</div>
                                </div>
                                <Download className="w-4 h-4 text-black flex-shrink-0" />
                              </a>
                            ))}
                          </div>
                        )}

                        {/* Preview Links */}
                        {entry.preview_links && entry.preview_links.length > 0 && (
                          <div className="mt-2 ml-4 space-y-2">
                            <p className="text-xs font-black tracking-tighter text-white mb-1">🔗 Preview Links:</p>
                            {entry.preview_links.map((link, idx) => (
                              <a
                                key={idx}
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-start gap-2 p-2 bg-white border-2 border-black hover:bg-[#ccff00] transition-colors"
                              >
                                <ExternalLink className="w-4 h-4 text-black flex-shrink-0 mt-0.5" />
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium text-black">{link.title || link.url}</div>
                                  {link.description && (
                                    <div className="text-xs text-gray-600 mt-1">{link.description}</div>
                                  )}
                                </div>
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
