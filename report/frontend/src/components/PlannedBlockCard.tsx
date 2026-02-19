"use client";

import { Calendar, Clock, Bell, Trash2, Edit2, Play } from "lucide-react";
import { PlannedTimeBlock } from "../services/planning";

interface PlannedBlockCardProps {
  block: PlannedTimeBlock;
  onStartTracking?: (block: PlannedTimeBlock) => void;
  onEdit?: (block: PlannedTimeBlock) => void;
  onDelete?: (block: PlannedTimeBlock) => void;
}

export default function PlannedBlockCard({
  block,
  onStartTracking,
  onEdit,
  onDelete,
}: PlannedBlockCardProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "planned":
        return "bg-blue-50 border-blue-400 text-blue-600";
      case "in_progress":
        return "bg-green-50 border-green-400 text-green-600";
      case "completed":
        return "bg-gray-50 border-gray-400 text-gray-600";
      case "missed":
        return "bg-red-50 border-red-400 text-red-600";
      default:
        return "bg-blue-50 border-blue-400 text-blue-600";
    }
  };

  const statusColors = getStatusColor(block.status);

  return (
    <div
      className={`border-2 border-dashed rounded-lg p-3 ${statusColors}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Calendar size={16} />
          <span className="text-xs font-bold uppercase tracking-wide">
            {block.status === "planned" && "PLANNED"}
            {block.status === "in_progress" && "IN PROGRESS"}
            {block.status === "completed" && "COMPLETED"}
            {block.status === "missed" && "MISSED"}
          </span>
          {block.google_calendar_event_id && (
            <span title="Synced to Google Calendar">
              <Bell size={14} />
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs">
          {block.start_time && block.end_time && (
            <>
              <Clock size={12} />
              <span>
                {block.start_time.substring(0, 5)} - {block.end_time.substring(0, 5)}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="mb-2">
        <div className="text-sm font-bold">
          {block.deliverable_name}
        </div>
        <div className="text-xs opacity-80">
          {block.project_name} • {block.tracking_code}
        </div>
        <div className="text-xs font-bold mt-1">
          {block.planned_hours}h planned
        </div>
      </div>

      {block.description && (
        <div className="text-xs opacity-75 mb-2 italic">
          {block.description}
        </div>
      )}

      <div className="flex gap-2 mt-3">
        {block.status === "planned" && onStartTracking && (
          <button
            onClick={() => onStartTracking(block)}
            className="flex-1 px-3 py-1.5 text-xs font-medium bg-white border-2 border-black rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-1"
          >
            <Play size={12} />
            Start Tracking
          </button>
        )}
        {onEdit && (
          <button
            onClick={() => onEdit(block)}
            className="px-3 py-1.5 text-xs font-medium bg-white border-2 border-black rounded-lg hover:bg-gray-50 transition-colors"
          >
            <span title="Edit">
              <Edit2 size={12} />
            </span>
          </button>
        )}
        {onDelete && (
          <button
            onClick={() => onDelete(block)}
            className="px-3 py-1.5 text-xs font-medium bg-white border-2 border-red-600 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
          >
            <span title="Delete">
              <Trash2 size={12} />
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
