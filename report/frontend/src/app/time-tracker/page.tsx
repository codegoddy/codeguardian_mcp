/** @format */

"use client";

import React, { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  GitCommit,
  FileText,
  Plus,
} from "lucide-react";
import AuthGuard from "../../components/AuthGuard";
import { useTimeTracker } from "@/hooks/useTimeTracker";
import PlanningModal from "../../components/PlanningModal";
import PlannedBlockCard from "../../components/PlannedBlockCard";
import DeleteConfirmationModal from "../../components/ui/DeleteConfirmationModal";
import { planningApi, PlannedTimeBlock } from "@/services/planning";
import { toast } from "@/lib/toast";

export default function TimeTrackerPage() {
  const {
    viewMode,
    setViewMode,
    daysToDisplay,
    isLoading,
    totalHours,
    totalCost,
    defaultCurrency,
    totalEntries,
    navigatePrevious,
    navigateNext,
    goToToday,
    formatTime,
    getCurrencySymbol,
    viewLabel,
    refetchPlannedBlocks,
  } = useTimeTracker();

  const [showPlanningModal, setShowPlanningModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [blockToDelete, setBlockToDelete] = useState<PlannedTimeBlock | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeletePlannedBlock = async (block: PlannedTimeBlock) => {
    setBlockToDelete(block);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!blockToDelete) return;

    try {
      setIsDeleting(true);
      await planningApi.deletePlannedBlock(blockToDelete.id);
      toast.success("Deleted", "Planned block has been removed");
      setShowDeleteModal(false);
      setBlockToDelete(null);
      refetchPlannedBlocks();
    } catch (error) {
      console.error("Failed to delete planned block:", error);
      toast.error("Failed", "Could not delete planned block");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleStartTracking = () => {
    // TODO: Implement start tracking from planned block
    toast.info("Coming Soon", "Start tracking from planned blocks will be available soon");
  };

  return (
    <AuthGuard>
      <div className="min-h-screen" style={{ backgroundColor: "#F5F5F5" }}>
        <main>
          <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
            {/* Page Header */}
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-normal text-black">Time Tracker</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Track and manage your time entries across projects
                </p>
              </div>
              <button
                onClick={() => setShowPlanningModal(true)}
                className="px-4 py-2 text-sm font-medium rounded-lg flex items-center gap-2 hover:scale-105 transition-transform duration-200"
                style={{ backgroundColor: "#ccff00", color: "#000" }}
              >
                <Plus size={16} />
                Plan Work
              </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="email-card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="text-[#ccff00]" size={20} />
                  <span className="text-sm font-bold text-white uppercase tracking-wide">
                    Total Hours
                  </span>
                </div>
                <div className="text-3xl font-black text-white">
                  {isLoading ? (
                    <div className="h-8 w-24 bg-white/20 rounded animate-pulse"></div>
                  ) : (
                    `${totalHours.toFixed(1)}h`
                  )}
                </div>
              </div>

              <div className="email-card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="text-[#ccff00]" size={20} />
                  <span className="text-sm font-bold text-white uppercase tracking-wide">
                    Total Cost
                  </span>
                </div>
                <div className="text-3xl font-black text-white">
                  {isLoading ? (
                    <div className="h-8 w-24 bg-white/20 rounded animate-pulse"></div>
                  ) : (
                    `${getCurrencySymbol(defaultCurrency)}${totalCost.toFixed(2)}`
                  )}
                </div>
              </div>

              <div className="email-card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <GitCommit className="text-[#ccff00]" size={20} />
                  <span className="text-sm font-bold text-white uppercase tracking-wide">
                    Entries
                  </span>
                </div>
                <div className="text-3xl font-black text-white">
                  {isLoading ? (
                    <div className="h-8 w-16 bg-white/20 rounded animate-pulse"></div>
                  ) : (
                    totalEntries
                  )}
                </div>
              </div>
            </div>

            {/* Main Card */}
            <div className="rounded-2xl p-6 bg-white">
              {/* Toolbar */}
              <div className="flex items-center justify-between mb-6 pb-4 border-b-2 border-gray-300">
                <div className="flex items-center gap-4">
                  <button
                    onClick={navigatePrevious}
                    className="p-2 hover:bg-gray-100 rounded transition-colors"
                  >
                    <ChevronLeft size={20} className="text-gray-700" />
                  </button>
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="text-gray-700" size={20} />
                    <span className="text-gray-900 font-medium">{viewLabel}</span>
                  </div>
                  <button
                    onClick={navigateNext}
                    className="p-2 hover:bg-gray-100 rounded transition-colors"
                  >
                    <ChevronRight size={20} className="text-gray-700" />
                  </button>
                  <button
                    onClick={goToToday}
                    className="px-4 py-2 text-sm font-medium rounded-lg hover:scale-105 transition-transform duration-200"
                    style={{ backgroundColor: "#ccff00", color: "#000" }}
                  >
                    Today
                  </button>
                </div>

                {/* View Mode Switcher */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setViewMode("day")}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                      viewMode === "day"
                        ? "bg-[#ccff00] text-black border border-black"
                        : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    Day
                  </button>
                  <button
                    onClick={() => setViewMode("week")}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                      viewMode === "week"
                        ? "bg-[#ccff00] text-black border border-black"
                        : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    Week
                  </button>
                  <button
                    onClick={() => setViewMode("month")}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                      viewMode === "month"
                        ? "bg-[#ccff00] text-black border border-black"
                        : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    Month
                  </button>
                </div>
              </div>

              {/* Calendar View */}
              {isLoading ? (
                <div className="text-center py-12">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-300 border-t-black"></div>
                  <p className="text-gray-600 mt-4">Loading time entries...</p>
                </div>
              ) : viewMode === "month" ? (
                <div className="grid grid-cols-7 gap-2">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                    <div
                      key={day}
                      className="text-center text-xs font-semibold text-gray-700 uppercase tracking-wide py-2"
                    >
                      {day}
                    </div>
                  ))}
                  {daysToDisplay.map((day) => (
                    <div
                      key={day.dateStr}
                      className={`border rounded-lg p-2 min-h-[100px] ${
                        day.isToday 
                          ? "bg-[#ccff00]/20 border-[#ccff00]" 
                          : "border-gray-200 hover:border-gray-300 hover:shadow-sm"
                      } transition-all`}
                    >
                      <div className="text-gray-900 font-semibold mb-1">{day.dayNum}</div>
                      {day.entries.length > 0 && (
                        <div className="space-y-1">
                          <div className="text-xs text-black font-semibold">
                            {formatTime(day.totalMinutes)}
                          </div>
                          <div className="text-xs text-gray-500">
                            {day.entries.length} {day.entries.length === 1 ? "entry" : "entries"}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {daysToDisplay.map((day) => (
                    <div
                      key={day.dateStr}
                      className={`border rounded-lg p-4 ${
                        day.isToday 
                          ? "bg-[#ccff00]/10 border-[#ccff00]" 
                          : "border-gray-200 hover:shadow-sm"
                      } transition-all`}
                    >
                      <div className="flex items-center justify-between mb-3 pb-3 border-b-2 border-gray-200">
                        <div className="flex items-center gap-3">
                          <div className="text-2xl font-semibold text-gray-900">
                            {day.dayNum}
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-gray-900 uppercase">
                              {day.dayName}
                            </div>
                            <div className="text-xs text-gray-500">
                              {day.date.toLocaleDateString("en-US", {
                                month: "long",
                                year: "numeric",
                              })}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xl font-semibold text-gray-900">
                            {formatTime(day.totalMinutes)}
                          </div>
                          <div className="text-xs text-gray-500">
                            {day.entries.length} {day.entries.length === 1 ? "entry" : "entries"}
                          </div>
                        </div>
                      </div>

                      {/* Planned Blocks */}
                      {day.plannedBlocks && day.plannedBlocks.length > 0 && (
                        <div className="mb-4">
                          <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">
                            Planned Work
                          </h4>
                          <div className="space-y-2">
                            {day.plannedBlocks.map((block) => (
                              <PlannedBlockCard
                                key={block.id}
                                block={block}
                                onStartTracking={handleStartTracking}
                                onDelete={handleDeletePlannedBlock}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Time Entries */}
                      {day.entries.length === 0 && (!day.plannedBlocks || day.plannedBlocks.length === 0) ? (
                        <div className="text-center py-6 text-gray-400">
                          No time entries or planned work for this day
                        </div>
                      ) : day.entries.length > 0 ? (
                        <div>
                          <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">
                            Time Entries
                          </h4>
                          <div className="space-y-2">
                          {day.entries.map((entry) => (
                            <div
                              key={entry.id}
                              className="bg-gray-50 border border-gray-200 rounded-lg p-3 hover:bg-gray-100 transition-colors"
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    {entry.source === "cli" && (
                                      <span className="px-2 py-0.5 bg-[#ccff00] text-black text-xs font-semibold rounded border border-black">
                                        CLI
                                      </span>
                                    )}
                                    {entry.git_commit_sha && (
                                      <span className="flex items-center gap-1 text-xs text-gray-500">
                                        <GitCommit size={12} />
                                        {entry.git_commit_sha.substring(0, 7)}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-gray-900 font-medium">
                                    {entry.description || entry.git_commit_message || "No description"}
                                  </div>
                                  {entry.start_time && entry.end_time && (
                                    <div className="text-xs text-gray-500 mt-1">
                                      {new Date(entry.start_time).toLocaleTimeString("en-US", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}{" "}
                                      -{" "}
                                      {new Date(entry.end_time).toLocaleTimeString("en-US", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                    </div>
                                  )}
                                </div>
                                <div className="text-right ml-4">
                                  <div className="text-lg font-semibold text-gray-900">
                                    {formatTime(entry.duration_minutes || 0)}
                                  </div>
                                  {entry.cost && (
                                    <div className="text-xs text-gray-500">
                                      {getCurrencySymbol(entry.currency || defaultCurrency)}{entry.cost.toFixed(2)}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Planning Modal */}
      <PlanningModal
        isOpen={showPlanningModal}
        onClose={() => {
          setShowPlanningModal(false);
          refetchPlannedBlocks();
        }}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setBlockToDelete(null);
        }}
        onConfirm={confirmDelete}
        title="Delete Planned Block"
        description="Are you sure you want to delete this planned work block? This action cannot be undone."
        itemName={blockToDelete ? `${blockToDelete.deliverable_name} - ${new Date(blockToDelete.planned_date).toLocaleDateString()}` : undefined}
        isLoading={isDeleting}
      />
    </AuthGuard>
  );
}
