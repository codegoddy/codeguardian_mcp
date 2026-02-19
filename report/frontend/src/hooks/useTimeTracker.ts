import { useState, useCallback, useMemo } from 'react';
import { TimeEntry, UserTimeEntries } from '@/services/timeEntries';
import { PlannedTimeBlock } from '@/services/planning';
import { useTimeTrackerBundle, PlannedBlockResponse } from './useTimeTrackerBundle';

export type ViewMode = 'day' | 'week' | 'month';

export interface DayData {
  date: Date;
  dateStr: string;
  dayName: string;
  dayNum: string;
  entries: TimeEntry[];
  plannedBlocks: PlannedTimeBlock[];
  totalMinutes: number;
  totalPlannedHours: number;
  isToday: boolean;
  isCurrentMonth: boolean;
}

interface UseTimeTrackerOptions {
  initialViewMode?: ViewMode;
  initialDate?: Date;
}

export const useTimeTracker = (options: UseTimeTrackerOptions = {}) => {
  const { initialViewMode = 'week', initialDate = new Date() } = options;

  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const [currentDate, setCurrentDate] = useState<Date>(initialDate);

  // Calculate date range based on view mode and current date
  const dateRange = useMemo(() => {
    const start = new Date(currentDate);
    const end = new Date(currentDate);

    if (viewMode === 'day') {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (viewMode === 'week') {
      const day = start.getDay();
      const diff = start.getDate() - day + (day === 0 ? -6 : 1);
      start.setDate(diff);
      start.setHours(0, 0, 0, 0);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    } else {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(start.getMonth() + 1);
      end.setDate(0);
      end.setHours(23, 59, 59, 999);
    }

    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
    };
  }, [viewMode, currentDate]);

  // Use the bundle endpoint for both time entries and planned blocks
  const { data: bundleData, isLoading, error, refetch } = useTimeTrackerBundle(
    dateRange.startDate,
    dateRange.endDate
  );

  // Convert bundle data to the format expected by the component
  const timeEntriesData: UserTimeEntries | undefined = useMemo(() => {
    if (!bundleData) return undefined;
    return {
      user_id: '',
      start_date: dateRange.startDate,
      end_date: dateRange.endDate,
      total_entries: bundleData.total_entries,
      total_hours: bundleData.total_hours,
      total_cost: bundleData.total_cost,
      default_currency: bundleData.default_currency,
      entries_by_date: bundleData.time_entries,
    };
  }, [bundleData, dateRange.startDate, dateRange.endDate]);

  const plannedBlocksData = useMemo(() => {
    if (!bundleData) return undefined;
    return {
      planned_blocks: bundleData.planned_blocks.map((block: PlannedBlockResponse) => ({
        id: block.id,
        user_id: '', // Will be filled from context or API
        project_id: '', // Will be filled from context or API
        deliverable_id: block.deliverable_id,
        project_name: block.project_name || '',
        deliverable_name: block.deliverable_title || '',
        tracking_code: '', // Not available in bundle response
        planned_date: block.planned_date,
        start_time: block.start_time,
        end_time: block.end_time,
        planned_hours: block.planned_hours,
        description: block.description || undefined,
        status: block.status as 'planned' | 'in_progress' | 'completed' | 'missed',
        created_at: new Date().toISOString(), // Not available in bundle response
        updated_at: new Date().toISOString(), // Not available in bundle response
      })),
      total_planned_hours: bundleData.total_planned_hours,
    };
  }, [bundleData]);

  // Helper to format date as YYYY-MM-DD in local timezone
  const formatLocalDate = useCallback((date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  // Generate days to display based on view mode
  const daysToDisplay = useMemo((): DayData[] => {
    const days: DayData[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const timeEntries = timeEntriesData?.entries_by_date || {};
    const plannedBlocks = plannedBlocksData?.planned_blocks || [];

    // Group planned blocks by date
    const plannedBlocksByDate: Record<string, PlannedTimeBlock[]> = {};
    plannedBlocks.forEach((block) => {
      if (!plannedBlocksByDate[block.planned_date]) {
        plannedBlocksByDate[block.planned_date] = [];
      }
      plannedBlocksByDate[block.planned_date].push(block);
    });

    if (viewMode === 'day') {
      const date = new Date(currentDate);
      date.setHours(0, 0, 0, 0);
      const dateStr = formatLocalDate(date);
      const dayPlannedBlocks = plannedBlocksByDate[dateStr] || [];
      days.push({
        date,
        dateStr,
        dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
        dayNum: date.getDate().toString(),
        entries: timeEntries[dateStr] || [],
        plannedBlocks: dayPlannedBlocks,
        totalMinutes: (timeEntries[dateStr] || []).reduce(
          (sum, e) => sum + (e.duration_minutes || 0),
          0
        ),
        totalPlannedHours: dayPlannedBlocks.reduce(
          (sum, b) => sum + b.planned_hours,
          0
        ),
        isToday: date.getTime() === today.getTime(),
        isCurrentMonth: date.getMonth() === currentDate.getMonth(),
      });
    } else if (viewMode === 'week') {
      const startOfWeek = new Date(currentDate);
      const day = startOfWeek.getDay();
      const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
      startOfWeek.setDate(diff);
      startOfWeek.setHours(0, 0, 0, 0);

      for (let i = 0; i < 7; i++) {
        const date = new Date(startOfWeek);
        date.setDate(startOfWeek.getDate() + i);
        const dateStr = formatLocalDate(date);
        const dayPlannedBlocks = plannedBlocksByDate[dateStr] || [];
        days.push({
          date,
          dateStr,
          dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
          dayNum: date.getDate().toString(),
          entries: timeEntries[dateStr] || [],
          plannedBlocks: dayPlannedBlocks,
          totalMinutes: (timeEntries[dateStr] || []).reduce(
            (sum, e) => sum + (e.duration_minutes || 0),
            0
          ),
          totalPlannedHours: dayPlannedBlocks.reduce(
            (sum, b) => sum + b.planned_hours,
            0
          ),
          isToday: date.getTime() === today.getTime(),
          isCurrentMonth: date.getMonth() === currentDate.getMonth(),
        });
      }
    } else {
      // Month view
      const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

      for (let d = 1; d <= lastDay.getDate(); d++) {
        const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), d);
        const dateStr = formatLocalDate(date);
        const dayPlannedBlocks = plannedBlocksByDate[dateStr] || [];
        days.push({
          date,
          dateStr,
          dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
          dayNum: date.getDate().toString(),
          entries: timeEntries[dateStr] || [],
          plannedBlocks: dayPlannedBlocks,
          totalMinutes: (timeEntries[dateStr] || []).reduce(
            (sum, e) => sum + (e.duration_minutes || 0),
            0
          ),
          totalPlannedHours: dayPlannedBlocks.reduce(
            (sum, b) => sum + b.planned_hours,
            0
          ),
          isToday: date.getTime() === today.getTime(),
          isCurrentMonth: true,
        });
      }
    }

    return days;
  }, [viewMode, currentDate, timeEntriesData, plannedBlocksData, formatLocalDate]);

  // Navigation functions
  const navigatePrevious = useCallback(() => {
    const newDate = new Date(currentDate);
    if (viewMode === 'day') {
      newDate.setDate(newDate.getDate() - 1);
    } else if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() - 7);
    } else {
      newDate.setMonth(newDate.getMonth() - 1);
    }
    setCurrentDate(newDate);
  }, [currentDate, viewMode]);

  const navigateNext = useCallback(() => {
    const newDate = new Date(currentDate);
    if (viewMode === 'day') {
      newDate.setDate(newDate.getDate() + 1);
    } else if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() + 7);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setCurrentDate(newDate);
  }, [currentDate, viewMode]);

  const goToToday = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  // Format time helper
  const formatTime = useCallback((minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}:${mins.toString().padStart(2, '0')}`;
  }, []);

  // Currency symbol helper
  const getCurrencySymbol = useCallback((currency: string): string => {
    const symbols: Record<string, string> = {
      USD: '$',
      EUR: '€',
      GBP: '£',
      JPY: '¥',
      CAD: 'C$',
      AUD: 'A$',
      CHF: 'CHF',
      CNY: '¥',
      INR: '₹',
    };
    return symbols[currency] || currency;
  }, []);

  // View label helper
  const viewLabel = useMemo(() => {
    if (viewMode === 'day') {
      return currentDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } else if (viewMode === 'week') {
      const startOfWeek = new Date(currentDate);
      const day = startOfWeek.getDay();
      const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
      startOfWeek.setDate(diff);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      return `${startOfWeek.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })} - ${endOfWeek.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })}`;
    } else {
      return currentDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
      });
    }
  }, [viewMode, currentDate]);

  return {
    // State
    viewMode,
    currentDate,
    daysToDisplay,
    isLoading,
    error,

    // Data
    totalHours: bundleData?.total_hours || 0,
    totalCost: bundleData?.total_cost || 0,
    defaultCurrency: bundleData?.default_currency || 'USD',
    totalEntries: bundleData?.total_entries || 0,
    timeEntries: bundleData?.time_entries || {},
    plannedBlocks: plannedBlocksData?.planned_blocks || [],
    totalPlannedHours: bundleData?.total_planned_hours || 0,

    // Actions
    setViewMode,
    navigatePrevious,
    navigateNext,
    goToToday,
    refetch,
    refetchPlannedBlocks: refetch,

    // Helpers
    formatTime,
    getCurrencySymbol,
    viewLabel,
  };
};

export type { TimeEntry, UserTimeEntries };
