'use client';

import { useState, useRef } from 'react';
import { Check, X, Edit2, Paperclip, Link as LinkIcon, Upload, Trash2, ExternalLink } from 'lucide-react';
import type { PendingTimeEntry, AttachmentInfo, PreviewLinkInfo } from '@/services/timeEntries';
import { timeEntriesApi } from '@/services/timeEntries';

interface TimeEntryCardProps {
  entry: PendingTimeEntry;
  onApprove: (sessionId: string, adjustedHours?: number, notes?: string, attachments?: AttachmentInfo[], previewLinks?: PreviewLinkInfo[]) => void;
  onReject: (sessionId: string, reason?: string) => void;
  isLoading?: boolean;
}

export default function TimeEntryCard({
  entry,
  onApprove,
  onReject,
  isLoading = false,
}: TimeEntryCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [adjustedHours, setAdjustedHours] = useState(entry.duration_hours);
  const [notes, setNotes] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  
  // File attachments
  const [attachments, setAttachments] = useState<AttachmentInfo[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Preview links
  const [previewLinks, setPreviewLinks] = useState<PreviewLinkInfo[]>([]);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkDescription, setLinkDescription] = useState('');

  const handleApprove = () => {
    const hours = isEditing ? adjustedHours : undefined;
    onApprove(
      entry.session_id, 
      hours, 
      notes || undefined,
      attachments.length > 0 ? attachments : undefined,
      previewLinks.length > 0 ? previewLinks : undefined
    );
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        const attachment = await timeEntriesApi.uploadAttachment(file);
        setAttachments(prev => [...prev, attachment]);
      }
    } catch (error) {
      console.error('Failed to upload file:', error);
      alert('Failed to upload file. Please try again.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddLink = () => {
    if (!linkUrl) return;
    
    setPreviewLinks(prev => [...prev, {
      url: linkUrl,
      title: linkTitle || undefined,
      description: linkDescription || undefined
    }]);
    
    setLinkUrl('');
    setLinkTitle('');
    setLinkDescription('');
    setShowLinkInput(false);
  };

  const handleRemoveLink = (index: number) => {
    setPreviewLinks(prev => prev.filter((_, i) => i !== index));
  };

  const handleReject = () => {
    onReject(entry.session_id, rejectReason || undefined);
    setShowRejectInput(false);
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

  return (
    <div className="email-card p-6 mb-4">
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-black tracking-tighter">
            {entry.deliverable_title}
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            {formatDate(entry.start_time)} → {formatDate(entry.end_time)}
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-black tracking-tighter">
            {isEditing ? (
              <input
                type="number"
                step="0.25"
                value={adjustedHours}
                onChange={(e) => setAdjustedHours(parseFloat(e.target.value))}
                className="w-20 px-2 py-1 border-2 border-black text-right"
                disabled={isLoading}
              />
            ) : (
              entry.duration_hours.toFixed(2)
            )}
            <span className="text-sm ml-1">hrs</span>
          </div>
          <p className="text-sm text-gray-600">
            {entry.duration_minutes} minutes
          </p>
        </div>
      </div>

      {/* Commit Stats */}
      <div className="grid grid-cols-3 gap-4 mb-4 p-4 bg-black text-white">
        <div>
          <div className="text-xs uppercase tracking-wider mb-1">Commits</div>
          <div className="text-xl font-black">{entry.commit_count}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider mb-1">Changes</div>
          <div className="text-xl font-black">
            <span className="text-[#ccff00]">+{entry.total_insertions}</span>
            {' / '}
            <span className="text-red-400">-{entry.total_deletions}</span>
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider mb-1">Files</div>
          <div className="text-xl font-black">{entry.total_files_changed}</div>
        </div>
      </div>

      {/* Commit Summary */}
      <div className="mb-4">
        <div className="text-xs uppercase tracking-wider font-bold mb-2">
          Commits
        </div>
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {entry.commits.slice(0, 5).map((commit, idx) => (
            <div key={idx} className="text-sm border-l-2 border-black pl-3">
              <div className="font-mono text-xs text-gray-500">
                {commit.sha.substring(0, 7)}
              </div>
              <div className="font-medium">
                {commit.message.split('\n')[0].substring(0, 80)}
              </div>
            </div>
          ))}
          {entry.commits.length > 5 && (
            <div className="text-xs text-gray-500 pl-3">
              +{entry.commits.length - 5} more commits
            </div>
          )}
        </div>
      </div>

      {/* Edit Notes */}
      {isEditing && (
        <div className="mb-4">
          <label className="text-xs uppercase tracking-wider font-bold mb-2 block">
            Notes (Optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 border-2 border-black"
            rows={2}
            placeholder="Add any notes about this time entry..."
            disabled={isLoading}
          />
        </div>
      )}

      {/* Attachments Section */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs uppercase tracking-wider font-bold">
            Attachments ({attachments.length})
          </label>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || isUploading}
            className="email-button px-3 py-1 text-xs flex items-center gap-1"
          >
            <Upload className="w-3 h-3" />
            {isUploading ? 'Uploading...' : 'Add Files'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.txt"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
        {attachments.length > 0 && (
          <div className="space-y-2">
            {attachments.map((att, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 border-2 border-black bg-white">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Paperclip className="w-4 h-4 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{att.filename}</div>
                    <div className="text-xs text-gray-500">
                      {(att.size / 1024).toFixed(1)} KB
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveAttachment(idx)}
                  className="p-1 hover:bg-red-100 border-2 border-black ml-2"
                  disabled={isLoading}
                >
                  <Trash2 className="w-4 h-4 text-red-600" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preview Links Section */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs uppercase tracking-wider font-bold">
            Preview Links ({previewLinks.length})
          </label>
          <button
            onClick={() => setShowLinkInput(!showLinkInput)}
            disabled={isLoading}
            className="email-button px-3 py-1 text-xs flex items-center gap-1"
          >
            <LinkIcon className="w-3 h-3" />
            Add Link
          </button>
        </div>

        {showLinkInput && (
          <div className="p-3 border-2 border-black bg-gray-50 mb-2 space-y-2">
            <input
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://preview.example.com"
              className="w-full px-3 py-2 border-2 border-black"
              disabled={isLoading}
            />
            <input
              type="text"
              value={linkTitle}
              onChange={(e) => setLinkTitle(e.target.value)}
              placeholder="Title (optional)"
              className="w-full px-3 py-2 border-2 border-black"
              disabled={isLoading}
            />
            <textarea
              value={linkDescription}
              onChange={(e) => setLinkDescription(e.target.value)}
              placeholder="Description (optional)"
              className="w-full px-3 py-2 border-2 border-black"
              rows={2}
              disabled={isLoading}
            />
            <div className="flex gap-2">
              <button
                onClick={handleAddLink}
                disabled={!linkUrl || isLoading}
                className="email-button px-4 py-2 text-sm"
              >
                Add Link
              </button>
              <button
                onClick={() => {
                  setShowLinkInput(false);
                  setLinkUrl('');
                  setLinkTitle('');
                  setLinkDescription('');
                }}
                className="px-4 py-2 text-sm border-2 border-black bg-white hover:bg-gray-100"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {previewLinks.length > 0 && (
          <div className="space-y-2">
            {previewLinks.map((link, idx) => (
              <div key={idx} className="flex items-start justify-between p-3 border-2 border-black bg-white">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <ExternalLink className="w-4 h-4 flex-shrink-0" />
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-blue-600 hover:underline truncate"
                    >
                      {link.title || link.url}
                    </a>
                  </div>
                  {link.description && (
                    <p className="text-xs text-gray-600 mt-1 ml-6">{link.description}</p>
                  )}
                </div>
                <button
                  onClick={() => handleRemoveLink(idx)}
                  className="p-1 hover:bg-red-100 border-2 border-black ml-2 flex-shrink-0"
                  disabled={isLoading}
                >
                  <Trash2 className="w-4 h-4 text-red-600" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reject Reason */}
      {showRejectInput && (
        <div className="mb-4">
          <label className="text-xs uppercase tracking-wider font-bold mb-2 block">
            Rejection Reason
          </label>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className="w-full px-3 py-2 border-2 border-black"
            rows={2}
            placeholder="Why are you rejecting this time entry?"
            disabled={isLoading}
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {!showRejectInput && (
          <>
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="email-button flex-1 bg-white text-black"
              disabled={isLoading}
            >
              <Edit2 className="w-4 h-4 mr-2" />
              {isEditing ? 'Cancel Edit' : 'Adjust Hours'}
            </button>
            <button
              onClick={handleApprove}
              className="email-button flex-1 bg-[#ccff00] text-black"
              disabled={isLoading}
            >
              <Check className="w-4 h-4 mr-2" />
              {isEditing ? 'Approve Adjusted' : 'Approve'}
            </button>
            <button
              onClick={() => setShowRejectInput(true)}
              className="email-button bg-black text-white"
              disabled={isLoading}
            >
              <X className="w-4 h-4" />
            </button>
          </>
        )}
        {showRejectInput && (
          <>
            <button
              onClick={() => setShowRejectInput(false)}
              className="email-button flex-1 bg-white text-black"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              onClick={handleReject}
              className="email-button flex-1 bg-red-600 text-white"
              disabled={isLoading}
            >
              <X className="w-4 h-4 mr-2" />
              Confirm Reject
            </button>
          </>
        )}
      </div>

      {/* Estimated Cost */}
      {entry.estimated_cost && (
        <div className="mt-4 pt-4 border-t-2 border-black">
          <div className="flex justify-between items-center">
            <span className="text-sm font-bold">Estimated Cost:</span>
            <span className="text-lg font-black tracking-tighter">
              ${entry.estimated_cost.toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
