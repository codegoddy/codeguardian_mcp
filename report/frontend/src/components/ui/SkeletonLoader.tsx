interface SkeletonLoaderProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
  count?: number;
}

export default function SkeletonLoader({
  className = '',
  variant = 'rectangular',
  width,
  height,
  count = 1,
}: SkeletonLoaderProps) {
  const baseClasses = 'animate-pulse bg-gray-200';
  
  const variantClasses = {
    text: 'rounded h-4',
    circular: 'rounded-full',
    rectangular: 'rounded-md',
  };

  const style = {
    width: width ? (typeof width === 'number' ? `${width}px` : width) : undefined,
    height: height ? (typeof height === 'number' ? `${height}px` : height) : undefined,
  };

  const skeletons = Array.from({ length: count }, (_, i) => (
    <div
      key={i}
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      style={style}
    />
  ));

  return count > 1 ? <div className="space-y-2">{skeletons}</div> : skeletons[0];
}

// Preset skeleton components for common use cases
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex gap-4">
          <SkeletonLoader width={40} height={40} variant="circular" />
          <div className="flex-1 space-y-2">
            <SkeletonLoader width="60%" height={16} />
            <SkeletonLoader width="40%" height={12} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="border border-gray-200 rounded-lg p-6 space-y-4">
      <SkeletonLoader width="70%" height={24} />
      <SkeletonLoader count={3} height={16} />
      <div className="flex gap-2 pt-4">
        <SkeletonLoader width={100} height={36} />
        <SkeletonLoader width={100} height={36} />
      </div>
    </div>
  );
}

export function ListSkeleton({ items = 5 }: { items?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: items }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <SkeletonLoader width={24} height={24} variant="circular" />
          <SkeletonLoader width="100%" height={20} />
        </div>
      ))}
    </div>
  );
}
