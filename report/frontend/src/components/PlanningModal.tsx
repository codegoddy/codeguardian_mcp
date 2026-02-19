"use client";

import { useState, useEffect } from "react";
import { X, Calendar, Zap, Bell, AlertTriangle, Sparkles, CheckCircle, AlertCircle } from "lucide-react";
import { planningApi, googleCalendarApi, ActiveProject, ScheduledBlock, ScheduleAnalysis } from "../services/planning";
import { toast } from "../lib/toast";
import LoadingSpinner from "./LoadingSpinner";
import CalendarModal from "./ui/CalendarModal";
import TimePicker from "./ui/TimePicker";
import { Checkbox } from "./ui/Checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/Select";

interface PlanningModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDeliverableId?: string;
  initialDate?: string;
}

// Helper to parse date string (YYYY-MM-DD) without timezone offset issues
function parseLocalDate(dateString: string | null | undefined): Date {
  // Handle empty/invalid input - return today's date
  if (!dateString || typeof dateString !== 'string' || !dateString.includes('-')) {
    return new Date();
  }
  
  const parts = dateString.split('-').map(Number);
  // Validate we got 3 valid numbers
  if (parts.length !== 3 || parts.some(isNaN)) {
    return new Date();
  }
  
  const [year, month, day] = parts;
  return new Date(year, month - 1, day);
}

export default function PlanningModal({
  isOpen,
  onClose,
  initialDeliverableId,
  initialDate,
}: PlanningModalProps) {
  const [activeProjects, setActiveProjects] = useState<ActiveProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedDeliverableId, setSelectedDeliverableId] = useState<string>(
    initialDeliverableId || ""
  );
  const [plannedDate, setPlannedDate] = useState<string>(
    initialDate || new Date().toISOString().split("T")[0]
  );
  const [startTime, setStartTime] = useState<string>("09:00");
  const [endTime, setEndTime] = useState<string>("17:00");
  const [plannedHours, setPlannedHours] = useState<number>(8);
  const [description, setDescription] = useState<string>("");
  const [syncToCalendar, setSyncToCalendar] = useState<boolean>(false);
  const [googleCalendarConnected, setGoogleCalendarConnected] = useState<boolean>(false);
  const [saving, setSaving] = useState(false);
  const [showAutoSchedule, setShowAutoSchedule] = useState(false);
  const [useAIScheduling, setUseAIScheduling] = useState(false);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [showStartDateCalendar, setShowStartDateCalendar] = useState(false);
  const [showEndDateCalendar, setShowEndDateCalendar] = useState(false);
  const [autoScheduleProjectId, setAutoScheduleProjectId] = useState<string>("");
  const [autoScheduleConfig, setAutoScheduleConfig] = useState({
    startDate: new Date().toISOString().split("T")[0],
    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    hoursPerDay: 8,
    selectedDeliverables: [] as string[],
    // AI-specific preferences
    maxDailyHours: 6,
    workPattern: "balanced" as "focused" | "balanced" | "flexible",
    includeBuffer: true,
  });
  const [scheduleAnalysis, setScheduleAnalysis] = useState<{
    feasibility: string;
    total_scheduled_hours: number;
    confidence: number;
    buffer_hours: number;
    warnings: string[];
    recommendations: string[];
  } | null>(null);
  const [showAnalysisPreview, setShowAnalysisPreview] = useState(false);
  
  // Preview state for AI schedule - allows editing before applying
  const [previewBlocks, setPreviewBlocks] = useState<ScheduledBlock[]>([]);
  const [showSchedulePreview, setShowSchedulePreview] = useState(false);
  const [previewAnalysis, setPreviewAnalysis] = useState<ScheduleAnalysis | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchActiveDeliverables();
      checkGoogleCalendarStatus();
    }
  }, [isOpen]);

  useEffect(() => {
    // Calculate hours from time range
    if (startTime && endTime) {
      const start = new Date(`2000-01-01T${startTime}`);
      const end = new Date(`2000-01-01T${endTime}`);
      const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      if (hours > 0) {
        setPlannedHours(hours);
      }
    }
  }, [startTime, endTime]);

  const fetchActiveDeliverables = async () => {
    try {
      setLoading(true);
      const data = await planningApi.getActiveDeliverables();
      setActiveProjects(data.projects);
      
      if (!data.projects || data.projects.length === 0) {
        toast.info("No Active Projects", "Create projects with deliverables to start planning work");
      }
    } catch (error) {
      console.error("Failed to fetch active deliverables:", error);
      toast.error("Failed to Load", "Could not fetch active deliverables. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const checkGoogleCalendarStatus = async () => {
    try {
      const status = await googleCalendarApi.getStatus();
      setGoogleCalendarConnected(status.connected);
      setSyncToCalendar(status.connected && (status.sync_enabled || false));
    } catch (error) {
      console.error("Failed to check Google Calendar status:", error);
    }
  };

  const handleSave = async () => {
    if (!selectedDeliverableId) {
      toast.error("Validation Error", "Please select a deliverable");
      return;
    }

    if (!plannedDate) {
      toast.error("Validation Error", "Please select a date");
      return;
    }

    if (plannedHours <= 0) {
      toast.error("Validation Error", "Planned hours must be greater than 0");
      return;
    }

    try {
      setSaving(true);
      await planningApi.createPlannedBlock({
        deliverable_id: selectedDeliverableId,
        planned_date: plannedDate,
        start_time: startTime ? `${plannedDate}T${startTime}:00` : undefined,
        end_time: endTime ? `${plannedDate}T${endTime}:00` : undefined,
        planned_hours: plannedHours,
        description: description || undefined,
        sync_to_calendar: syncToCalendar,
      });

      toast.success("Planned!", "Time block has been scheduled successfully");
      onClose();
      resetForm();
    } catch (error) {
      console.error("Failed to create planned block:", error);
      toast.error("Failed to Save", "Could not create planned time block");
    } finally {
      setSaving(false);
    }
  };

  const handleAutoSchedule = async () => {
    if (autoScheduleConfig.selectedDeliverables.length === 0) {
      toast.error("Validation Error", "Please select at least one deliverable");
      return;
    }

    try {
      setSaving(true);
      
      if (useAIScheduling) {
        // Use AI-powered scheduling - show preview first
        const result = await planningApi.aiAutoSchedule({
          deliverable_ids: autoScheduleConfig.selectedDeliverables,
          start_date: autoScheduleConfig.startDate,
          end_date: autoScheduleConfig.endDate,
          preferences: {
            max_daily_hours: autoScheduleConfig.maxDailyHours,
            work_pattern: autoScheduleConfig.workPattern,
            include_buffer: autoScheduleConfig.includeBuffer,
          },
        });

        // Store blocks for preview (don't save yet)
        setPreviewBlocks(result.scheduled_blocks || []);
        setPreviewAnalysis(result.analysis);
        setShowSchedulePreview(true);
        
        toast.success(
          "AI Schedule Generated!",
          "Review and edit the schedule below, then click Apply to save."
        );
      } else {
        // Use basic algorithm - applies directly (no preview for basic)
        const result = await planningApi.autoSchedule({
          deliverable_ids: autoScheduleConfig.selectedDeliverables,
          start_date: autoScheduleConfig.startDate,
          end_date: autoScheduleConfig.endDate,
          hours_per_day: autoScheduleConfig.hoursPerDay,
        });

        toast.success(
          "Schedule Created!",
          `Created ${result.planned_blocks.length} time blocks across ${result.schedule_summary.days_scheduled} days`
        );
        
        setShowAutoSchedule(false);
        onClose();
      }
    } catch (error) {
      console.error("Failed to auto-schedule:", error);
      toast.error("Failed to Auto-Schedule", "Could not create schedule. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Apply the previewed schedule to the calendar
  const handleApplySchedule = async () => {
    if (previewBlocks.length === 0) {
      toast.error("No Schedule", "No scheduled blocks to apply.");
      return;
    }

    try {
      setSaving(true);
      
      // Create each planned block
      for (const block of previewBlocks) {
        await planningApi.createPlannedBlock({
          deliverable_id: block.deliverable_id,
          planned_date: block.planned_date,
          start_time: block.start_time,
          end_time: block.end_time,
          planned_hours: block.planned_hours,
          description: block.reasoning,
        });
      }
      
      toast.success(
        "Schedule Applied!",
        `Created ${previewBlocks.length} time blocks on your calendar.`
      );
      
      // Show analysis if there are warnings/recommendations
      if (previewAnalysis && (previewAnalysis.warnings.length > 0 || previewAnalysis.recommendations.length > 0)) {
        setScheduleAnalysis(previewAnalysis);
        setShowAnalysisPreview(true);
      }
      
      // Reset and close
      setPreviewBlocks([]);
      setShowSchedulePreview(false);
      setPreviewAnalysis(null);
      setShowAutoSchedule(false);
      onClose();
    } catch (error) {
      console.error("Failed to apply schedule:", error);
      toast.error("Failed to Apply", "Could not save schedule. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Cancel the preview and go back to configuration
  const handleCancelPreview = () => {
    setPreviewBlocks([]);
    setShowSchedulePreview(false);
    setPreviewAnalysis(null);
  };

  // Update a specific block in the preview
  const updatePreviewBlock = (index: number, updates: Partial<ScheduledBlock>) => {
    setPreviewBlocks(prev => {
      const newBlocks = [...prev];
      newBlocks[index] = { ...newBlocks[index], ...updates };
      return newBlocks;
    });
  };

  const resetForm = () => {
    setSelectedProjectId("");
    setSelectedDeliverableId("");
    setPlannedDate(new Date().toISOString().split("T")[0]);
    setStartTime("09:00");
    setEndTime("17:00");
    setPlannedHours(8);
    setDescription("");
  };

  const handleProjectChange = (projectId: string) => {
    setSelectedProjectId(projectId);
    setSelectedDeliverableId(""); // Reset deliverable when project changes
  };

  const handleAutoScheduleProjectChange = (projectId: string) => {
    setAutoScheduleProjectId(projectId);
    const project = activeProjects.find((p) => p.id === projectId);
    
    // Set dates from project if available
    if (project) {
      // Get today's date string in YYYY-MM-DD format
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      
      // Start date: use project start if it's today or in the future, otherwise use today
      let startDateStr = todayStr;
      if (project.start_date && project.start_date >= todayStr) {
        startDateStr = project.start_date;
      }
      
      // End date: use project end if valid and after start, otherwise 7 days from start
      const defaultEndDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      let endDateStr = `${defaultEndDate.getFullYear()}-${String(defaultEndDate.getMonth() + 1).padStart(2, '0')}-${String(defaultEndDate.getDate()).padStart(2, '0')}`;
      
      if (project.end_date && project.end_date > startDateStr) {
        endDateStr = project.end_date;
      }
      
      setAutoScheduleConfig({
        ...autoScheduleConfig,
        startDate: startDateStr,
        endDate: endDateStr,
        selectedDeliverables: [], // Reset selected deliverables
      });
    }
  };

  const selectedProject = activeProjects.find((p) => p.id === selectedProjectId);
  const availableDeliverables = selectedProject?.deliverables || [];
  
  const selectedDeliverable = availableDeliverables.find(
    (d) => d.id === selectedDeliverableId
  );

  const selectedInfo = selectedProject && selectedDeliverable
    ? { project: selectedProject, deliverable: selectedDeliverable }
    : null;

  const autoScheduleProject = activeProjects.find((p) => p.id === autoScheduleProjectId);
  const autoScheduleDeliverables = autoScheduleProject?.deliverables || [];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div
        className="bg-white rounded-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto"
        style={{
          border: "2px solid #000",
          boxShadow: "4px 4px 0px 0px #000",
        }}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b-2 border-black p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-black tracking-tighter">
              {showAutoSchedule ? "Auto-Schedule Deliverables" : "Plan Work Session"}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {showAutoSchedule
                ? "Automatically schedule multiple deliverables"
                : "Schedule time to work on a deliverable"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner />
              <span className="ml-3 text-gray-600">Loading deliverables...</span>
            </div>
          ) : (
            <>
              {/* Toggle between Manual and Auto-Schedule */}
              <div className="mb-6 flex gap-2">
                <button
                  onClick={() => setShowAutoSchedule(false)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                    !showAutoSchedule
                      ? "email-button"
                      : "bg-white border-2 border-black text-black hover:bg-gray-50"
                  }`}
                >
                  <Calendar className="inline mr-2" size={16} />
                  Manual Schedule
                </button>
                <button
                  onClick={() => setShowAutoSchedule(true)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                    showAutoSchedule
                      ? "email-button"
                      : "bg-white border-2 border-black text-black hover:bg-gray-50"
                  }`}
                >
                  <Zap className="inline mr-2" size={16} />
                  Auto-Schedule
                </button>
              </div>

              {!showAutoSchedule ? (
                /* Manual Schedule Form */
                <div className="space-y-6">
                  {/* Project Selection */}
                  <div>
                    <label className="block text-sm font-bold mb-2">
                      Select Project *
                    </label>
                    <Select value={selectedProjectId} onValueChange={handleProjectChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Choose a project..." />
                      </SelectTrigger>
                      <SelectContent>
                        {activeProjects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            <div className="flex items-center gap-2">
                              <span>{project.name}</span>
                              {!project.contract_signed && (
                                <span className="text-xs text-yellow-600">⚠️ No Contract</span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Deliverable Selection */}
                  {selectedProjectId && (
                    <div>
                      <label className="block text-sm font-bold mb-2">
                        Select Deliverable *
                      </label>
                      <Select 
                        value={selectedDeliverableId} 
                        onValueChange={setSelectedDeliverableId}
                        disabled={availableDeliverables.length === 0}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Choose a deliverable..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableDeliverables.map((deliverable) => (
                            <SelectItem key={deliverable.id} value={deliverable.id}>
                              <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                  {deliverable.tracking_code ? (
                                    <span className="font-mono text-xs text-gray-500">
                                      {deliverable.tracking_code}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-orange-600">⚠️ No Code</span>
                                  )}
                                  <span>{deliverable.name}</span>
                                </div>
                                <span className="text-xs text-gray-500">
                                  {deliverable.hours_remaining.toFixed(1)}h remaining
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {availableDeliverables.length === 0 && (
                        <p className="text-sm text-gray-500 mt-2">
                          No deliverables available for this project
                        </p>
                      )}
                    </div>
                  )}

                  {/* Contract Warning */}
                  {selectedInfo && !selectedInfo.project.contract_signed && (
                    <div className="bg-yellow-50 border-2 border-yellow-500 rounded-lg p-4 flex items-start gap-3">
                      <AlertTriangle className="text-yellow-600 flex-shrink-0 mt-0.5" size={20} />
                      <div>
                        <p className="text-sm font-bold text-yellow-900">
                          Contract Not Signed
                        </p>
                        <p className="text-xs text-yellow-800 mt-1">
                          This project&apos;s contract hasn&apos;t been signed yet. Please ensure your client signs the contract before starting work. You can still plan work, but tracking codes won&apos;t be generated until the contract is signed.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Tracking Code Warning */}
                  {selectedInfo && !selectedInfo.deliverable.has_tracking_code && (
                    <div className="bg-orange-50 border-2 border-orange-500 rounded-lg p-4 flex items-start gap-3">
                      <AlertTriangle className="text-orange-600 flex-shrink-0 mt-0.5" size={20} />
                      <div>
                        <p className="text-sm font-bold text-orange-900">
                          No Tracking Code
                        </p>
                        <p className="text-xs text-orange-800 mt-1">
                          This deliverable doesn&apos;t have a tracking code yet. Tracking codes are generated when the project contract is signed. Time tracking and Git integration won&apos;t work until then.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Selected Deliverable Info */}
                  {selectedInfo && (
                    <div className="email-card p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-bold text-white">
                            {selectedInfo.deliverable.name}
                          </p>
                          <p className="text-xs text-gray-300 mt-1">
                            {selectedInfo.project.name}
                          </p>
                          {selectedInfo.deliverable.tracking_code && (
                            <p className="text-xs text-[#ccff00] mt-1 font-mono">
                              {selectedInfo.deliverable.tracking_code}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-[#ccff00]">
                            {selectedInfo.deliverable.hours_remaining.toFixed(1)}h
                          </p>
                          <p className="text-xs text-gray-300">remaining</p>
                        </div>
                      </div>
                      {selectedInfo.deliverable.deadline && (
                        <p className="text-xs text-gray-300 mt-2">
                          Deadline:{" "}
                          {new Date(selectedInfo.deliverable.deadline).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Date Selection */}
                  <div>
                    <label className="block text-sm font-bold mb-2">
                      Planned Date *
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowCalendarModal(true)}
                      className="w-full px-4 py-3 border-2 border-black rounded-lg focus:outline-none focus:ring-2 focus:ring-[#ccff00] bg-white text-left flex items-center justify-between hover:bg-gray-50 transition-colors"
                    >
                      <span className="font-medium">
                        {parseLocalDate(plannedDate).toLocaleDateString('en-US', { 
                          weekday: 'short', 
                          year: 'numeric', 
                          month: 'short', 
                          day: 'numeric' 
                        })}
                      </span>
                      <Calendar size={20} className="text-gray-500" />
                    </button>
                  </div>

                  {/* Time Range */}
                  <div className="grid grid-cols-2 gap-4">
                    <TimePicker
                      label="Start Time"
                      value={startTime}
                      onChange={setStartTime}
                    />
                    <TimePicker
                      label="End Time"
                      value={endTime}
                      onChange={setEndTime}
                    />
                  </div>

                  {/* Planned Hours */}
                  <div>
                    <label className="block text-sm font-bold mb-2">
                      Planned Hours: {plannedHours.toFixed(1)}h
                    </label>
                    <input
                      type="range"
                      min="0.5"
                      max="12"
                      step="0.5"
                      value={plannedHours}
                      onChange={(e) => setPlannedHours(parseFloat(e.target.value))}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>0.5h</span>
                      <span>12h</span>
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-sm font-bold mb-2">
                      Description (Optional)
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="What will you work on?"
                      rows={3}
                      className="w-full px-4 py-3 border-2 border-black rounded-lg focus:outline-none focus:ring-2 focus:ring-[#ccff00] resize-none"
                    />
                  </div>

                  {/* Google Calendar Sync */}
                  {googleCalendarConnected && (
                    <div className="flex items-center justify-between p-4 bg-blue-50 border-2 border-blue-500 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Bell className="text-blue-600" size={20} />
                        <div>
                          <p className="text-sm font-bold text-blue-900">
                            Sync to Google Calendar
                          </p>
                          <p className="text-xs text-blue-700">
                            Get notifications before your scheduled work
                          </p>
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={syncToCalendar}
                          onChange={(e) => setSyncToCalendar(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#ccff00] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                  )}
                </div>
              ) : (
                /* Auto-Schedule Form */
                <div className="space-y-6">
                  {/* AI Toggle */}
                  <div className="bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-black rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Sparkles className="text-purple-600" size={24} />
                        <div>
                          <p className="text-sm font-bold text-gray-900">
                            AI-Powered Scheduling
                          </p>
                          <p className="text-xs text-gray-600 mt-0.5">
                            Use AI to create an intelligent, optimized schedule
                          </p>
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={useAIScheduling}
                          onChange={(e) => setUseAIScheduling(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                      </label>
                    </div>
                  </div>

                  {/* Project Selection */}
                  <div>
                    <label className="block text-sm font-bold mb-2">
                      Select Project *
                    </label>
                    <Select value={autoScheduleProjectId} onValueChange={handleAutoScheduleProjectChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Choose a project..." />
                      </SelectTrigger>
                      <SelectContent>
                        {activeProjects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            <div className="flex items-center gap-2">
                              <span>{project.name}</span>
                              {!project.contract_signed && (
                                <span className="text-xs text-yellow-600">⚠️ No Contract</span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Deliverable Selection */}
                  {autoScheduleProjectId && (
                    <div>
                      <label className="block text-sm font-bold mb-2">
                        Select Deliverables *
                      </label>
                      {autoScheduleDeliverables.length > 0 ? (
                        <div className="space-y-2 max-h-64 overflow-y-auto border-2 border-black rounded-lg p-4">
                          {autoScheduleDeliverables.map((deliverable) => (
                            <div
                              key={deliverable.id}
                              className="flex items-start gap-3 p-2 hover:bg-gray-50 rounded transition-colors"
                            >
                              <Checkbox
                                checked={autoScheduleConfig.selectedDeliverables.includes(
                                  deliverable.id
                                )}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setAutoScheduleConfig({
                                      ...autoScheduleConfig,
                                      selectedDeliverables: [
                                        ...autoScheduleConfig.selectedDeliverables,
                                        deliverable.id,
                                      ],
                                    });
                                  } else {
                                    setAutoScheduleConfig({
                                      ...autoScheduleConfig,
                                      selectedDeliverables:
                                        autoScheduleConfig.selectedDeliverables.filter(
                                          (id) => id !== deliverable.id
                                        ),
                                    });
                                  }
                                }}
                              />
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  {deliverable.tracking_code ? (
                                    <span className="font-mono text-xs text-gray-500">
                                      {deliverable.tracking_code}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-orange-600">⚠️ No Code</span>
                                  )}
                                  <p className="text-sm font-medium">{deliverable.name}</p>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                  {deliverable.hours_remaining.toFixed(1)}h remaining
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 border-2 border-gray-300 rounded-lg p-4">
                          No deliverables available for this project
                        </p>
                      )}
                    </div>
                  )}

                  {/* Date Range */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold mb-2">
                        Start Date *
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowStartDateCalendar(true)}
                        className="w-full px-4 py-3 border-2 border-black rounded-lg focus:outline-none focus:ring-2 focus:ring-[#ccff00] bg-white text-left flex items-center justify-between hover:bg-gray-50 transition-colors"
                      >
                        <span className="font-medium">
                          {parseLocalDate(autoScheduleConfig.startDate).toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </span>
                        <Calendar size={20} className="text-gray-500" />
                      </button>
                    </div>
                    <div>
                      <label className="block text-sm font-bold mb-2">
                        End Date *
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowEndDateCalendar(true)}
                        className="w-full px-4 py-3 border-2 border-black rounded-lg focus:outline-none focus:ring-2 focus:ring-[#ccff00] bg-white text-left flex items-center justify-between hover:bg-gray-50 transition-colors"
                      >
                        <span className="font-medium">
                          {parseLocalDate(autoScheduleConfig.endDate).toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </span>
                        <Calendar size={20} className="text-gray-500" />
                      </button>
                    </div>
                  </div>

                  {/* Hours Per Day */}
                  <div>
                    <label className="block text-sm font-bold mb-2">
                      {useAIScheduling ? "Max Daily Hours" : "Hours Per Day"}: {useAIScheduling ? autoScheduleConfig.maxDailyHours : autoScheduleConfig.hoursPerDay}h
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="12"
                      step="1"
                      value={useAIScheduling ? autoScheduleConfig.maxDailyHours : autoScheduleConfig.hoursPerDay}
                      onChange={(e) => {
                        const value = parseInt(e.target.value);
                        if (useAIScheduling) {
                          setAutoScheduleConfig({
                            ...autoScheduleConfig,
                            maxDailyHours: value,
                          });
                        } else {
                          setAutoScheduleConfig({
                            ...autoScheduleConfig,
                            hoursPerDay: value,
                          });
                        }
                      }}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>1h</span>
                      <span>12h</span>
                    </div>
                    {useAIScheduling && (
                      <p className="text-xs text-gray-600 mt-2">
                        💡 AI will optimize daily workload within this maximum
                      </p>
                    )}
                  </div>

                  {/* AI-Specific Options */}
                  {useAIScheduling && (
                    <>
                      {/* Work Pattern */}
                      <div>
                        <label className="block text-sm font-bold mb-2">
                          Work Pattern Preference
                        </label>
                        <Select 
                          value={autoScheduleConfig.workPattern} 
                          onValueChange={(value: "focused" | "balanced" | "flexible") =>
                            setAutoScheduleConfig({
                              ...autoScheduleConfig,
                              workPattern: value,
                            })
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="focused">
                              <div className="flex flex-col">
                                <span className="font-medium">Focused</span>
                                <span className="text-xs text-gray-500">3-4h blocks, minimal switching</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="balanced">
                              <div className="flex flex-col">
                                <span className="font-medium">Balanced</span>
                                <span className="text-xs text-gray-500">2-3h blocks, moderate variety</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="flexible">
                              <div className="flex flex-col">
                                <span className="font-medium">Flexible</span>
                                <span className="text-xs text-gray-500">1-2h blocks, more variety</span>
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Buffer Time */}
                      <div className="flex items-center justify-between p-3 bg-yellow-50 border-2 border-yellow-500 rounded-lg">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="text-yellow-600" size={18} />
                          <div>
                            <p className="text-sm font-bold text-yellow-900">
                              Include Buffer Time
                            </p>
                            <p className="text-xs text-yellow-700">
                              Add 20% extra time for unexpected issues
                            </p>
                          </div>
                        </div>
                        <Checkbox
                          checked={autoScheduleConfig.includeBuffer}
                          onChange={(e) =>
                            setAutoScheduleConfig({
                              ...autoScheduleConfig,
                              includeBuffer: e.target.checked,
                            })
                          }
                        />
                      </div>
                    </>
                  )}

                  {/* Info */}
                  <div className={`border-2 rounded-lg p-4 ${
                    useAIScheduling 
                      ? "bg-purple-50 border-purple-500" 
                      : "bg-yellow-50 border-yellow-500"
                  }`}>
                    <p className={`text-sm ${
                      useAIScheduling ? "text-purple-900" : "text-yellow-900"
                    }`}>
                      <strong>💡 {useAIScheduling ? "AI Magic" : "Note"}:</strong>{" "}
                      {useAIScheduling 
                        ? "AI will analyze task complexity, optimize work blocks, and suggest the best schedule based on your preferences and historical data."
                        : "Auto-schedule will distribute work across weekdays, prioritizing deliverables by priority and deadline."
                      }
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t-2 border-black p-6 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-6 py-2 text-sm font-medium border-2 border-black rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={showAutoSchedule ? handleAutoSchedule : handleSave}
            disabled={saving || loading}
            className="email-button px-6 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              showAutoSchedule ? "Generating..." : "Saving..."
            ) : showAutoSchedule ? (
              <>
                <Zap className="inline mr-2" size={16} />
                {useAIScheduling ? "AI Auto-Schedule" : "Auto-Schedule"}
              </>
            ) : (
              <>
                <Calendar className="inline mr-2" size={16} />
                Schedule Work
              </>
            )}
          </button>
        </div>
      </div>

      {/* Calendar Modals */}
      <CalendarModal
        isOpen={showCalendarModal}
        onClose={() => setShowCalendarModal(false)}
        mode="single"
        title="Select Planned Date"
        description="Choose the date for your work session"
        onDateSelect={(date) => {
          setPlannedDate(date.toISOString().split('T')[0]);
          setShowCalendarModal(false);
        }}
      />

      <CalendarModal
        isOpen={showStartDateCalendar}
        onClose={() => setShowStartDateCalendar(false)}
        mode="single"
        title="Select Start Date"
        description="Choose the start date for auto-scheduling"
        onDateSelect={(date) => {
          setAutoScheduleConfig({
            ...autoScheduleConfig,
            startDate: date.toISOString().split('T')[0],
          });
          setShowStartDateCalendar(false);
        }}
      />

      <CalendarModal
        isOpen={showEndDateCalendar}
        onClose={() => setShowEndDateCalendar(false)}
        mode="single"
        title="Select End Date"
        description="Choose the end date for auto-scheduling"
        onDateSelect={(date) => {
          setAutoScheduleConfig({
            ...autoScheduleConfig,
            endDate: date.toISOString().split('T')[0],
          });
          setShowEndDateCalendar(false);
        }}
      />

      {/* AI Analysis Preview Modal */}
      {showAnalysisPreview && scheduleAnalysis && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div
            className="bg-white rounded-lg w-full max-w-2xl max-h-[80vh] overflow-y-auto"
            style={{
              border: "2px solid #000",
              boxShadow: "4px 4px 0px 0px #000",
            }}
          >
            {/* Header - Black like other modals */}
            <div className="bg-black text-white p-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Sparkles size={28} className="text-[#ccff00]" />
                <div>
                  <h3 className="text-xl font-black tracking-tighter">
                    AI Schedule Analysis
                  </h3>
                  <p className="text-sm text-gray-400 mt-1">
                    Feasibility: <span className="text-[#ccff00] font-medium">{scheduleAnalysis.feasibility.toUpperCase()}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAnalysisPreview(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-black rounded-lg p-4 text-center">
                  <p className="text-2xl font-black text-[#ccff00]">
                    {scheduleAnalysis.total_scheduled_hours.toFixed(1)}h
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Total Hours</p>
                </div>
                <div className="bg-black rounded-lg p-4 text-center">
                  <p className="text-2xl font-black text-white">
                    {scheduleAnalysis.confidence}%
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Confidence</p>
                </div>
                <div className="bg-black rounded-lg p-4 text-center">
                  <p className="text-2xl font-black text-white">
                    {scheduleAnalysis.buffer_hours.toFixed(1)}h
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Buffer Time</p>
                </div>
              </div>

              {/* Warnings */}
              {scheduleAnalysis.warnings.length > 0 && (
                <div className="bg-gray-50 border-2 border-black rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="text-black flex-shrink-0 mt-0.5" size={18} />
                    <div>
                      <p className="text-sm font-bold text-black mb-2">
                        Warnings
                      </p>
                      <ul className="space-y-1">
                        {scheduleAnalysis.warnings.map((warning: string, idx: number) => (
                          <li key={idx} className="text-xs text-gray-600">
                            • {warning}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {scheduleAnalysis.recommendations.length > 0 && (
                <div className="bg-gray-50 border-2 border-black rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="text-black flex-shrink-0 mt-0.5" size={18} />
                    <div>
                      <p className="text-sm font-bold text-black mb-2">
                        Recommendations
                      </p>
                      <ul className="space-y-1">
                        {scheduleAnalysis.recommendations.map((rec: string, idx: number) => (
                          <li key={idx} className="text-xs text-gray-600">
                            • {rec}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="bg-gray-50 border-t-2 border-black p-6">
              <button
                onClick={() => setShowAnalysisPreview(false)}
                className="w-full py-3 text-sm font-bold bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
                style={{
                  border: "2px solid #000",
                  boxShadow: "2px 2px 0px 0px #000",
                }}
              >
                Got It!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Schedule Preview Modal - Review and Edit before applying */}
      {showSchedulePreview && previewBlocks.length > 0 && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div
            className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
            style={{
              border: "2px solid #000",
              boxShadow: "4px 4px 0px 0px #000",
            }}
          >
            {/* Header */}
            <div className="bg-black text-white p-6 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <Sparkles size={28} className="text-[#ccff00]" />
                <div>
                  <h3 className="text-xl font-black tracking-tighter">
                    AI Schedule Preview
                  </h3>
                  <p className="text-sm text-gray-400 mt-1">
                    Review and edit before applying to your calendar
                  </p>
                </div>
              </div>
              <button
                onClick={handleCancelPreview}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            {/* Summary Stats */}
            <div className="p-4 border-b-2 border-black bg-gray-50 flex-shrink-0">
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-black rounded-lg p-3 text-center">
                  <p className="text-xl font-black text-[#ccff00]">
                    {previewBlocks.length}
                  </p>
                  <p className="text-xs text-gray-400">Blocks</p>
                </div>
                <div className="bg-black rounded-lg p-3 text-center">
                  <p className="text-xl font-black text-white">
                    {previewBlocks.reduce((sum, b) => sum + b.planned_hours, 0).toFixed(1)}h
                  </p>
                  <p className="text-xs text-gray-400">Total Hours</p>
                </div>
                <div className="bg-black rounded-lg p-3 text-center">
                  <p className="text-xl font-black text-white">
                    {previewAnalysis?.confidence || 0}%
                  </p>
                  <p className="text-xs text-gray-400">Confidence</p>
                </div>
                <div className="bg-black rounded-lg p-3 text-center">
                  <p className="text-xl font-black text-[#ccff00]">
                    {previewAnalysis?.feasibility?.toUpperCase() || 'N/A'}
                  </p>
                  <p className="text-xs text-gray-400">Feasibility</p>
                </div>
              </div>
            </div>

            {/* Scrollable Blocks List */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-3">
                {previewBlocks.map((block, index) => (
                  <div
                    key={index}
                    className="bg-white border-2 border-black rounded-lg p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      {/* Left: Deliverable Info */}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-black truncate">
                          {block.deliverable_title}
                        </h4>
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                          {block.reasoning}
                        </p>
                      </div>

                      {/* Right: Editable Fields */}
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {/* Date */}
                        <div className="flex flex-col items-center">
                          <label className="text-[10px] text-gray-500 mb-1">Date</label>
                          <input
                            type="date"
                            value={block.planned_date}
                            onChange={(e) => updatePreviewBlock(index, { planned_date: e.target.value })}
                            className="px-2 py-1 border-2 border-black rounded text-sm font-medium w-32"
                          />
                        </div>

                        {/* Start Time */}
                        <div className="flex flex-col items-center">
                          <label className="text-[10px] text-gray-500 mb-1">Start</label>
                          <input
                            type="time"
                            value={block.start_time}
                            onChange={(e) => updatePreviewBlock(index, { start_time: e.target.value })}
                            className="px-2 py-1 border-2 border-black rounded text-sm font-medium w-24"
                          />
                        </div>

                        {/* End Time */}
                        <div className="flex flex-col items-center">
                          <label className="text-[10px] text-gray-500 mb-1">End</label>
                          <input
                            type="time"
                            value={block.end_time}
                            onChange={(e) => updatePreviewBlock(index, { end_time: e.target.value })}
                            className="px-2 py-1 border-2 border-black rounded text-sm font-medium w-24"
                          />
                        </div>

                        {/* Hours */}
                        <div className="flex flex-col items-center">
                          <label className="text-[10px] text-gray-500 mb-1">Hours</label>
                          <input
                            type="number"
                            step="0.5"
                            min="0.5"
                            max="12"
                            value={block.planned_hours}
                            onChange={(e) => updatePreviewBlock(index, { planned_hours: parseFloat(e.target.value) || 1 })}
                            className="px-2 py-1 border-2 border-black rounded text-sm font-medium w-16 text-center"
                          />
                        </div>

                        {/* Delete Button */}
                        <button
                          onClick={() => setPreviewBlocks(prev => prev.filter((_, i) => i !== index))}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors"
                          title="Remove this block"
                        >
                          <X size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {previewBlocks.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <Calendar size={48} className="mx-auto mb-3 opacity-50" />
                  <p>No scheduled blocks</p>
                </div>
              )}
            </div>

            {/* Footer with Actions */}
            <div className="bg-gray-50 border-t-2 border-black p-4 flex items-center justify-between gap-4 flex-shrink-0">
              <button
                onClick={handleCancelPreview}
                className="px-6 py-3 text-sm font-bold border-2 border-black rounded-lg hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleApplySchedule}
                disabled={saving || previewBlocks.length === 0}
                className="flex-1 max-w-xs py-3 text-sm font-bold bg-[#ccff00] text-black rounded-lg hover:bg-[#b8e600] transition-colors disabled:opacity-50"
                style={{
                  border: "2px solid #000",
                  boxShadow: "2px 2px 0px 0px #000",
                }}
              >
                {saving ? (
                  <span className="flex items-center justify-center gap-2">
                    <LoadingSpinner size="sm" />
                    Applying...
                  </span>
                ) : (
                  `Apply ${previewBlocks.length} Blocks to Calendar`
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
