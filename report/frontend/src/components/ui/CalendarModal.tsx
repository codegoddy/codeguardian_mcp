'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useEffect } from 'react';

interface CalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDateRangeSelect?: (start: Date, end: Date) => void;
  onDateSelect?: (date: Date) => void;
  mode?: 'single' | 'range';
  title?: string;
  description?: string;
}

const DAYS_OF_WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function CalendarModal({
  isOpen,
  onClose,
  onDateRangeSelect,
  onDateSelect,
  mode = 'range',
  title = 'Select Date Range',
  description = 'Choose a date range with 9-day intervals for analysis',
}: CalendarModalProps) {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedRange, setSelectedRange] = useState<{ start: Date | null; end: Date | null }>({
    start: null,
    end: null,
  });
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [hoveredDate, setHoveredDate] = useState<Date | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      const now = new Date();
      setSelectedRange({ start: null, end: null });
      setSelectedDate(null);
      setHoveredDate(null);
      setCurrentMonth(now.getMonth());
      setCurrentYear(now.getFullYear());
    }
  }, [isOpen]);

  // Generate calendar days for the current month
  const getDaysInMonth = (month: number, year: number) => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];

    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }

    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }

    return days;
  };

  const days = getDaysInMonth(currentMonth, currentYear);

  const navigateMonth = (direction: 'prev' | 'next') => {
    if (direction === 'prev') {
      if (currentMonth === 0) {
        setCurrentMonth(11);
        setCurrentYear(currentYear - 1);
      } else {
        setCurrentMonth(currentMonth - 1);
      }
    } else {
      if (currentMonth === 11) {
        setCurrentMonth(0);
        setCurrentYear(currentYear + 1);
      } else {
        setCurrentMonth(currentMonth + 1);
      }
    }
  };

  const handleDateClick = (date: Date) => {
    if (mode === 'single') {
      setSelectedDate(date);
      if (onDateSelect) {
        onDateSelect(date);
      }
    } else {
      if (!selectedRange.start || (selectedRange.start && selectedRange.end)) {
        // Start new selection
        setSelectedRange({ start: date, end: null });
      } else {
        // Complete the range
        const start = selectedRange.start;
        const end = date;
        if (start <= end) {
          setSelectedRange({ start, end });
        } else {
          setSelectedRange({ start: end, end: start });
        }
      }
    }
  };

  const handleApplyDates = () => {
    if (mode === 'single' && selectedDate && onDateSelect) {
      console.log('[CalendarModal] Applying single date:', selectedDate);
      onDateSelect(selectedDate);
      onClose();
    } else if (mode === 'range' && selectedRange.start && selectedRange.end && onDateRangeSelect) {
      console.log('[CalendarModal] Applying date range:', {
        start: selectedRange.start,
        end: selectedRange.end
      });
      onDateRangeSelect(selectedRange.start, selectedRange.end);
      onClose();
    }
  };

  const isDateInRange = (date: Date) => {
    if (mode === 'single') return false;

    if (!selectedRange.start) return false;

    if (selectedRange.start && !selectedRange.end) {
      if (hoveredDate) {
        const start = selectedRange.start <= hoveredDate ? selectedRange.start : hoveredDate;
        const end = selectedRange.start <= hoveredDate ? hoveredDate : selectedRange.start;
        return date >= start && date <= end;
      }
      return false;
    }

    return date >= selectedRange.start && selectedRange.end && date <= selectedRange.end;
  };

  const isDateSelected = (date: Date) => {
    if (mode === 'single') {
      return selectedDate && date.toDateString() === selectedDate.toDateString();
    }
    return (selectedRange.start && date.toDateString() === selectedRange.start.toDateString()) ||
           (selectedRange.end && date.toDateString() === selectedRange.end.toDateString());
  };

  const getDayClassName = (date: Date | null) => {
    if (!date) return 'text-gray-400';

    const isToday = date.toDateString() === today.toDateString();
    const inRange = isDateInRange(date);
    const selected = isDateSelected(date);

    let className = 'relative w-8 h-8 flex items-center justify-center text-sm rounded-lg cursor-pointer transition-all duration-200 ';

    if (selected) {
      className += 'text-black font-semibold shadow-lg ';
      return className + 'bg-[#ccff00]';
    } else if (inRange) {
      className += 'bg-blue-100 text-blue-800 ';
    } else if (isToday) {
      className += 'bg-orange-100 text-orange-800 ';
    } else {
      className += 'hover:bg-gray-100 text-gray-700 ';
    }

    return className;
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl p-6 w-full max-w-md z-50 max-h-[90vh] overflow-y-auto"
          style={{
            border: '1px solid #171717',
            boxShadow: '2px 2px 0px #171717'
          }}
        >
          <div className="flex items-start justify-between mb-4">
            <div>
              <Dialog.Title className="text-xl font-semibold text-gray-900">
                {title}
              </Dialog.Title>
              <Dialog.Description className="text-sm text-gray-600 mt-1">
                {description}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </Dialog.Close>
          </div>

          {/* Calendar */}
          <div className="mb-6">
            {/* Month/Year Navigation */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => navigateMonth('prev')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronLeft size={20} />
              </button>
              <h3 className="text-lg font-semibold text-gray-900">
                {MONTHS[currentMonth]} {currentYear}
              </h3>
              <button
                onClick={() => navigateMonth('next')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronRight size={20} />
              </button>
            </div>

            {/* Days of Week Header */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {DAYS_OF_WEEK.map((day) => (
                <div key={day} className="w-8 h-8 flex items-center justify-center text-xs font-medium text-gray-500">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1">
              {days.map((date, index) => (
                <div
                  key={index}
                  className={getDayClassName(date)}
                  onClick={() => date && handleDateClick(date)}
                  onMouseEnter={() => date && setHoveredDate(date)}
                  onMouseLeave={() => setHoveredDate(null)}
                >
                  {date && date.getDate()}
                </div>
              ))}
            </div>
          </div>

          {/* Selected Date/Range Display */}
          {mode === 'single' && selectedDate && (
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <div className="text-sm text-gray-600">
                Selected Date:
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-medium">
                  {selectedDate.toLocaleDateString('en-GB')}
                </span>
              </div>
            </div>
          )}

          {mode === 'range' && selectedRange.start && (
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <div className="text-sm text-gray-600">
                Selected Range:
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-medium">
                  {selectedRange.start.toLocaleDateString('en-GB')}
                </span>
                {selectedRange.end && (
                  <>
                    <span className="text-gray-400">-</span>
                    <span className="font-medium">
                      {selectedRange.end.toLocaleDateString('en-GB')}
                    </span>
                  </>
                )}
                {selectedRange.start && selectedRange.end && (
                  <span className="text-xs text-gray-500 ml-2">
                    ({Math.ceil((selectedRange.end.getTime() - selectedRange.start.getTime()) / (1000 * 60 * 60 * 24)) + 1} days)
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm font-medium black-button"
            >
              Cancel
            </button>
            <button
              onClick={handleApplyDates}
              disabled={mode === 'single' ? !selectedDate : (!selectedRange.start || !selectedRange.end)}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                (mode === 'single' && selectedDate) || (mode === 'range' && selectedRange.start && selectedRange.end)
                  ? 'email-button shadow-lg transform hover:-translate-y-0.5'
                  : 'bg-gray-200 cursor-not-allowed text-gray-500'
              }`}
            >
              {mode === 'single' ? 'Select Date' : 'Apply Dates'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
