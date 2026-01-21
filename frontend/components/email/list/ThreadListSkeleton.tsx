/**
 * Thread List Skeleton Component
 *
 * Loading skeleton that mimics ThreadListItem 3-line layout:
 * Line 1: Avatar + Sender + Date
 * Line 2: Subject
 * Line 3: Snippet
 *
 * Provides smooth visual loading experience per Phase 10 requirements.
 */

import { memo } from 'react';
import { Box, Skeleton } from '@mui/material';

interface ThreadItemSkeletonProps {
  /** Animation variant - wave for initial load, pulse for refresh */
  animation?: 'wave' | 'pulse' | false;
}

/**
 * Single skeleton row matching ThreadListItem structure
 */
export const ThreadItemSkeleton = memo(function ThreadItemSkeleton({
  animation = 'wave',
}: ThreadItemSkeletonProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: 2,
        py: 1.5,
        minHeight: 96,
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      {/* Checkbox area */}
      <Box sx={{ width: 40, flexShrink: 0 }}>
        <Skeleton
          animation={animation}
          variant="circular"
          width={20}
          height={20}
          sx={{ ml: 0.5 }}
        />
      </Box>

      {/* Avatar */}
      <Skeleton
        animation={animation}
        variant="circular"
        width={28}
        height={28}
        sx={{ flexShrink: 0 }}
      />

      {/* Content - 3 lines */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {/* Line 1: Sender + Date */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            mb: 0.5,
          }}
        >
          <Skeleton
            animation={animation}
            variant="text"
            width="35%"
            height={20}
            sx={{ fontSize: '0.875rem' }}
          />
          <Box sx={{ flex: 1 }} />
          <Skeleton
            animation={animation}
            variant="text"
            width={60}
            height={16}
          />
        </Box>

        {/* Line 2: Subject */}
        <Skeleton
          animation={animation}
          variant="text"
          width="75%"
          height={18}
          sx={{ mb: 0.25, fontSize: '0.8125rem' }}
        />

        {/* Line 3: Snippet */}
        <Skeleton
          animation={animation}
          variant="text"
          width="90%"
          height={18}
          sx={{ fontSize: '0.8125rem' }}
        />
      </Box>
    </Box>
  );
});

interface ThreadListSkeletonProps {
  /** Number of skeleton items to render */
  count?: number;
  /** Animation variant */
  animation?: 'wave' | 'pulse' | false;
}

/**
 * Full list skeleton with configurable count
 *
 * Default 8 items fills typical viewport
 */
export const ThreadListSkeleton = memo(function ThreadListSkeleton({
  count = 8,
  animation = 'wave',
}: ThreadListSkeletonProps) {
  return (
    <Box data-testid="thread-list-skeleton" sx={{ width: '100%' }}>
      {Array.from({ length: count }).map((_, index) => (
        <ThreadItemSkeleton key={index} animation={animation} />
      ))}
    </Box>
  );
});

export default ThreadListSkeleton;
