'use client';

import { useState, useRef, useEffect } from 'react';
import { Clock } from 'lucide-react';

interface TimePickerProps {
  value: string; // Format: "HH:MM"
  onChange: (time: string) => void;
  label?: string;
  className?: string;
}

export default function TimePicker({ value, onChange, label, className = '' }: TimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedHour, setSelectedHour] = useState('09');
  const [selectedMinute, setSelectedMinute] = useState('00');
  const [period, setPeriod] = useState<'AM' | 'PM'>('AM');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Parse initial value
  useEffect(() => {
    if (value) {
      const [hours, minutes] = value.split(':');
      const hour24 = parseInt(hours);
      const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
      const newPeriod = hour24 >= 12 ? 'PM' : 'AM';
      
      setSelectedHour(hour12.toString().padStart(2, '0'));
      setSelectedMinute(minutes);
      setPeriod(newPeriod);
    }
  }, [value]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleTimeChange = (hour: string, minute: string, newPeriod: 'AM' | 'PM') => {
    setSelectedHour(hour);
    setSelectedMinute(minute);
    setPeriod(newPeriod);

    // Convert to 24-hour format
    let hour24 = parseInt(hour);
    if (newPeriod === 'PM' && hour24 !== 12) {
      hour24 += 12;
    } else if (newPeriod === 'AM' && hour24 === 12) {
      hour24 = 0;
    }

    const time24 = `${hour24.toString().padStart(2, '0')}:${minute}`;
    onChange(time24);
  };

  const hours = Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0'));
  const minutes = Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0'));

  const displayTime = `${selectedHour}:${selectedMinute} ${period}`;

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {label && (
        <label className="block text-sm font-bold mb-2">
          {label}
        </label>
      )}
      
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 border-2 border-black rounded-lg focus:outline-none focus:ring-2 focus:ring-[#ccff00] bg-white text-left flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <span className="font-medium">{displayTime}</span>
        <Clock size={20} className="text-gray-500" />
      </button>

      {isOpen && (
        <div
          className="absolute z-50 mt-2 w-full bg-white rounded-lg p-4"
          style={{
            border: '2px solid #000',
            boxShadow: '4px 4px 0px 0px #000',
          }}
        >
          <div className="grid grid-cols-3 gap-3">
            {/* Hour Selection */}
            <div>
              <p className="text-xs font-bold text-gray-600 mb-2 text-center">Hour</p>
              <div className="max-h-40 overflow-y-auto space-y-1 scrollbar-thin">
                {hours.map((hour) => (
                  <button
                    key={hour}
                    type="button"
                    onClick={() => handleTimeChange(hour, selectedMinute, period)}
                    className={`w-full px-3 py-2 text-sm rounded-lg transition-all ${
                      selectedHour === hour
                        ? 'bg-[#ccff00] text-black font-bold'
                        : 'hover:bg-gray-100 text-gray-700'
                    }`}
                  >
                    {hour}
                  </button>
                ))}
              </div>
            </div>

            {/* Minute Selection */}
            <div>
              <p className="text-xs font-bold text-gray-600 mb-2 text-center">Min</p>
              <div className="max-h-40 overflow-y-auto space-y-1 scrollbar-thin">
                {minutes.map((minute) => (
                  <button
                    key={minute}
                    type="button"
                    onClick={() => handleTimeChange(selectedHour, minute, period)}
                    className={`w-full px-3 py-2 text-sm rounded-lg transition-all ${
                      selectedMinute === minute
                        ? 'bg-[#ccff00] text-black font-bold'
                        : 'hover:bg-gray-100 text-gray-700'
                    }`}
                  >
                    {minute}
                  </button>
                ))}
              </div>
            </div>

            {/* AM/PM Selection */}
            <div>
              <p className="text-xs font-bold text-gray-600 mb-2 text-center">Period</p>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => handleTimeChange(selectedHour, selectedMinute, 'AM')}
                  className={`w-full px-3 py-2 text-sm rounded-lg transition-all ${
                    period === 'AM'
                      ? 'bg-[#ccff00] text-black font-bold'
                      : 'hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  AM
                </button>
                <button
                  type="button"
                  onClick={() => handleTimeChange(selectedHour, selectedMinute, 'PM')}
                  className={`w-full px-3 py-2 text-sm rounded-lg transition-all ${
                    period === 'PM'
                      ? 'bg-[#ccff00] text-black font-bold'
                      : 'hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  PM
                </button>
              </div>
            </div>
          </div>

          {/* Done Button */}
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="w-full mt-4 px-4 py-2 text-sm font-medium email-button"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}
