'use client';

import { Clock, Circle } from 'lucide-react';
import { useEffect, useState } from 'react';

interface SessionIndicatorProps {
  session: {
    id: string;
    tracking_code: string;
    status: 'active' | 'paused';
    start_time: string;
    accumulated_minutes: number;
  } | null;
}

export default function SessionIndicator({ session }: SessionIndicatorProps) {
  const [currentDuration, setCurrentDuration] = useState(0);

  useEffect(() => {
    if (!session || session.status !== 'active') {
      return;
    }

    // Calculate initial duration
    const startTime = new Date(session.start_time).getTime();
    const calculateDuration = () => {
      const now = Date.now();
      const elapsedMinutes = Math.floor((now - startTime) / 1000 / 60);
      return session.accumulated_minutes + elapsedMinutes;
    };

    setCurrentDuration(calculateDuration());

    // Update every second for live timer
    const interval = setInterval(() => {
      setCurrentDuration(calculateDuration());
    }, 1000);

    return () => clearInterval(interval);
  }, [session]);

  if (!session) {
    return null;
  }

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const isActive = session.status === 'active';

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
        isActive
          ? 'bg-green-50 text-green-700 border-2 border-green-500'
          : 'bg-yellow-50 text-yellow-700 border-2 border-yellow-500'
      }`}
      style={{
        boxShadow: isActive ? '1px 1px 0px #22c55e' : '1px 1px 0px #eab308',
      }}
    >
      <div className="flex items-center gap-1.5">
        {isActive ? (
          <>
            <Circle className="w-2 h-2 fill-green-500 animate-pulse" />
            <span className="text-xs font-semibold">TRACKING</span>
          </>
        ) : (
          <>
            <Circle className="w-2 h-2 fill-yellow-500" />
            <span className="text-xs font-semibold">PAUSED</span>
          </>
        )}
      </div>
      
      <div className="h-3 w-px bg-gray-300" />
      
      <div className="flex items-center gap-1">
        <Clock className="w-3.5 h-3.5" />
        <span className="font-mono text-xs font-bold">
          {formatDuration(isActive ? currentDuration : session.accumulated_minutes)}
        </span>
      </div>
    </div>
  );
}
