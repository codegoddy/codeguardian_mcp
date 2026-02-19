import { Loader2 } from 'lucide-react';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  label?: string;
}

const sizeClasses = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
  xl: 'w-12 h-12',
};

export default function Spinner({ size = 'md', className = '', label }: SpinnerProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2">
      <Loader2 className={`${sizeClasses[size]} animate-spin text-blue-600 ${className}`} />
      {label && <p className="text-sm text-gray-600">{label}</p>}
    </div>
  );
}

export function ButtonSpinner({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  return <Loader2 className={`${sizeClasses[size]} animate-spin`} />;
}

export function FullPageSpinner({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm z-50">
      <Spinner size="xl" label={label} />
    </div>
  );
}
