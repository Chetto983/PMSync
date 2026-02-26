/**
 * Thread List Skeleton — matches compact 2-line ThreadListItem layout
 *
 * Line 1: Avatar + Sender + Date
 * Line 2: Subject — snippet
 */

import { memo } from 'react';
import { Box, Skeleton } from '@mui/material';

interface ThreadItemSkeletonProps {
  animation?: 'wave' | 'pulse' | false;
}

/** Single skeleton row matching compact ThreadListItem */
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
        py: 1,
        minHeight: 52,
        borderLeft: 3,
        borderLeftColor: 'transparent',
        borderBottom: '1px solid',
        borderBottomColor: 'divider',
      }}
    >
      {/* Checkbox area */}
      <Box sx={{ width: 36, flexShrink: 0 }}>
        <Skeleton
          animation={animation}
          variant="circular"
          width={18}
          height={18}
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

      {/* Content — 2 lines */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {/* Line 1: Sender + Date */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Skeleton
            animation={animation}
            variant="text"
            width="30%"
            height={18}
          />
          <Box sx={{ flex: 1 }} />
          <Skeleton
            animation={animation}
            variant="text"
            width={55}
            height={14}
          />
        </Box>

        {/* Line 2: Subject — snippet */}
        <Skeleton
          animation={animation}
          variant="text"
          width="80%"
          height={18}
        />
      </Box>
    </Box>
  );
});

interface ThreadListSkeletonProps {
  count?: number;
  animation?: 'wave' | 'pulse' | false;
}

/** Full list skeleton — default 10 items fills compact viewport */
export const ThreadListSkeleton = memo(function ThreadListSkeleton({
  count = 10,
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
