interface ProgressBarProps {
  progress: number; // 0-100
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'success' | 'warning' | 'danger';
  showLabel?: boolean;
  label?: string;
  className?: string;
}

const sizeClasses = {
  sm: 'h-1',
  md: 'h-2',
  lg: 'h-3',
};

const variantClasses = {
  default: 'bg-blue-600',
  success: 'bg-green-600',
  warning: 'bg-yellow-600',
  danger: 'bg-red-600',
};

export default function ProgressBar({
  progress,
  size = 'md',
  variant = 'default',
  showLabel = false,
  label,
  className = '',
}: ProgressBarProps) {
  const clampedProgress = Math.min(Math.max(progress, 0), 100);

  return (
    <div className={`w-full ${className}`}>
      {(showLabel || label) && (
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-700">{label || 'Progress'}</span>
          <span className="text-sm font-medium text-gray-900">{clampedProgress}%</span>
        </div>
      )}
      <div className={`w-full bg-gray-200 rounded-full overflow-hidden ${sizeClasses[size]}`}>
        <div
          className={`${sizeClasses[size]} ${variantClasses[variant]} transition-all duration-300 ease-out rounded-full`}
          style={{ width: `${clampedProgress}%` }}
        />
      </div>
    </div>
  );
}

export function FileUploadProgress({
  fileName,
  progress,
  onCancel,
}: {
  fileName: string;
  progress: number;
  onCancel?: () => void;
}) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-gray-900 truncate flex-1">{fileName}</p>
        {onCancel && progress < 100 && (
          <button
            onClick={onCancel}
            className="text-sm text-red-600 hover:text-red-700 ml-2"
          >
            Cancel
          </button>
        )}
      </div>
      <ProgressBar progress={progress} size="sm" />
    </div>
  );
}
