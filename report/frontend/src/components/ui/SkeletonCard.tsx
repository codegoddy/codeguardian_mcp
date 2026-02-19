/** @format */

/**
 * Skeleton Card Component
 * 
 * A placeholder component that shows a loading skeleton while content is being fetched.
 * Improves perceived performance and provides better UX than blank screens or spinners.
 */

export const SkeletonCard = () => (
  <div className="animate-pulse rounded-2xl bg-white p-6 border border-gray-200">
    <div className="flex items-center justify-between mb-4">
      <div className="h-6 bg-gray-200 rounded w-1/3"></div>
      <div className="h-4 bg-gray-200 rounded w-16"></div>
    </div>
    <div className="space-y-3">
      <div className="h-4 bg-gray-200 rounded w-full"></div>
      <div className="h-4 bg-gray-200 rounded w-5/6"></div>
      <div className="h-4 bg-gray-200 rounded w-4/6"></div>
    </div>
  </div>
);

export const SkeletonProjectRow = () => (
  <div className="animate-pulse flex items-center space-x-4 py-4 border-b border-gray-200">
    <div className="h-6 bg-gray-200 rounded w-20"></div>
    <div className="flex-1">
      <div className="h-5 bg-gray-200 rounded w-48 mb-2"></div>
      <div className="h-4 bg-gray-200 rounded w-32"></div>
    </div>
    <div className="h-4 bg-gray-200 rounded w-24"></div>
    <div className="h-4 bg-gray-200 rounded w-32"></div>
  </div>
);

export const SkeletonMetricCard = () => (
  <div className="animate-pulse rounded-xl bg-white p-6 border border-gray-200">
    <div className="h-4 bg-gray-200 rounded w-24 mb-3"></div>
    <div className="h-8 bg-gray-200 rounded w-32 mb-2"></div>
    <div className="h-3 bg-gray-200 rounded w-20"></div>
  </div>
);

export const SkeletonChart = () => (
  <div className="animate-pulse rounded-2xl bg-white p-6 border border-gray-200">
    <div className="h-6 bg-gray-200 rounded w-40 mb-6"></div>
    <div className="space-y-4">
      <div className="flex items-end justify-between h-32">
        {[...Array(7)].map((_, i) => (
          <div
            key={i}
            className="bg-gray-200 rounded-t"
            style={{
              width: '12%',
              height: `${Math.random() * 60 + 40}%`,
            }}
          ></div>
        ))}
      </div>
      <div className="flex justify-between">
        {[...Array(7)].map((_, i) => (
          <div key={i} className="h-3 bg-gray-200 rounded w-8"></div>
        ))}
      </div>
    </div>
  </div>
);
