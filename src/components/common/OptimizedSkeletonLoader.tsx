import React, { memo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

interface OptimizedSkeletonLoaderProps {
  type: 'message' | 'list' | 'card' | 'custom';
  count?: number;
  className?: string;
  children?: React.ReactNode;
}

// PERFORMANCE: Pre-built skeleton patterns for common use cases
const MessageSkeleton = memo(() => (
  <div className="flex gap-3 mb-4">
    <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
    <div className="flex-1 space-y-2">
      <Skeleton className="h-4 w-1/4" />
      <Skeleton className="h-20 w-full rounded-lg" />
      <Skeleton className="h-3 w-3/4" />
    </div>
  </div>
));

const ListItemSkeleton = memo(() => (
  <div className="flex items-center gap-3 p-3 border rounded-lg">
    <Skeleton className="h-10 w-10 rounded" />
    <div className="flex-1 space-y-2">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
    </div>
    <Skeleton className="h-8 w-20" />
  </div>
));

const CardSkeleton = memo(() => (
  <div className="border rounded-lg p-4 space-y-3">
    <Skeleton className="h-6 w-1/2" />
    <Skeleton className="h-4 w-full" />
    <Skeleton className="h-4 w-3/4" />
    <div className="flex gap-2 pt-2">
      <Skeleton className="h-8 w-16" />
      <Skeleton className="h-8 w-20" />
    </div>
  </div>
));

export const OptimizedSkeletonLoader = memo(({ 
  type, 
  count = 3, 
  className = "",
  children 
}: OptimizedSkeletonLoaderProps) => {
  // PERFORMANCE: Memoized skeleton components prevent re-renders
  const skeletonComponents = {
    message: MessageSkeleton,
    list: ListItemSkeleton,
    card: CardSkeleton,
    custom: () => children || <Skeleton className="h-20 w-full" />
  };

  const SkeletonComponent = skeletonComponents[type];

  return (
    <div className={`space-y-4 ${className}`}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonComponent key={`skeleton-${i}`} />
      ))}
    </div>
  );
});

OptimizedSkeletonLoader.displayName = 'OptimizedSkeletonLoader';
MessageSkeleton.displayName = 'MessageSkeleton';
ListItemSkeleton.displayName = 'ListItemSkeleton';
CardSkeleton.displayName = 'CardSkeleton';