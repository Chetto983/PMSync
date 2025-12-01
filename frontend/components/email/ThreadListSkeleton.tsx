import React from 'react';
import { Box, Skeleton, Divider } from '@mui/material';

/**
 * Props for ThreadListSkeleton component
 */
interface ThreadListSkeletonProps {
  /**
   * Number of skeleton items to display
   * @default 8
   */
  count?: number;

  /**
   * Whether to show checkbox skeleton
   * @default true
   */
  showCheckbox?: boolean;
}

/**
 * Skeleton item that mirrors ThreadListItem structure exactly
 *
 * Based on 2025 best practices:
 * - Match skeleton shapes to actual content for cohesive experience
 * - Use subtle animations (MUI default pulse animation)
 * - Keep skeletons lightweight for instant loading
 *
 * @see https://www.getfishtank.com/insights/best-practices-for-loading-states-in-nextjs
 * @see https://medium.com/@pysquad/enhancing-user-experience-with-skeleton-loaders-in-react-js-and-next-js-86b80b89e59d
 */
const ThreadListSkeletonItem = React.memo<{ showCheckbox?: boolean }>(
  ({ showCheckbox = true }) => {
    return (
      <>
        <Box
          sx={{
            py: 1.5,
            px: 2,
            display: 'flex',
            gap: 2,
            alignItems: 'flex-start',
          }}
        >
          {/* Checkbox skeleton */}
          {showCheckbox && (
            <Box sx={{ mt: 0.5 }}>
              <Skeleton
                variant="rectangular"
                width={20}
                height={20}
                sx={{ borderRadius: 0.5 }}
              />
            </Box>
          )}

          {/* Avatar skeleton */}
          <Box sx={{ mt: 0.5 }}>
            <Skeleton variant="circular" width={40} height={40} />
          </Box>

          {/* Content skeleton */}
          <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {/* From & Date row */}
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
              <Skeleton variant="text" width="40%" height={20} />
              <Box sx={{ flex: 1 }} />
              <Skeleton variant="text" width={60} height={16} />
            </Box>

            {/* Subject */}
            <Skeleton variant="text" width="70%" height={20} />

            {/* Snippet */}
            <Skeleton variant="text" width="90%" height={16} />

            {/* Metadata (labels, attachments) */}
            <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
              <Skeleton variant="rounded" width={50} height={18} />
              <Skeleton variant="rounded" width={40} height={18} />
            </Box>
          </Box>
        </Box>
        <Divider />
      </>
    );
  }
);

ThreadListSkeletonItem.displayName = 'ThreadListSkeletonItem';

/**
 * ThreadListSkeleton - Loading state for ThreadList
 *
 * Renders skeleton placeholders that match the exact structure of ThreadListItem
 * to prevent layout shift and provide a smooth loading experience.
 *
 * @example
 * ```tsx
 * // In ThreadList loading state
 * if (isLoading && threads.length === 0) {
 *   return <ThreadListSkeleton count={10} />;
 * }
 * ```
 */
export const ThreadListSkeleton: React.FC<ThreadListSkeletonProps> = ({
  count = 8,
  showCheckbox = true,
}) => {
  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
      role="status"
      aria-label="Loading emails"
    >
      {Array.from({ length: count }).map((_, index) => (
        <ThreadListSkeletonItem key={index} showCheckbox={showCheckbox} />
      ))}
    </Box>
  );
};

export default React.memo(ThreadListSkeleton);
