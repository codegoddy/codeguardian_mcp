import * as React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: 'black' | 'white' | 'gray';
  className?: string;
}

export default function LoadingSpinner({
  size = 'md',
  color = 'black',
  className = ''
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  };

  const colorClasses = {
    black: 'text-black',
    white: 'text-white',
    gray: 'text-gray-400'
  };

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <Loader2 
        className={`${sizeClasses[size]} ${colorClasses[color]} animate-spin-gpu`}
        style={{
          willChange: 'transform',
        }}
      />
    </div>
  );
}
