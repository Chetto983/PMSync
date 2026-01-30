'use client';

import React from 'react';
import { Box, Skeleton } from '@mui/material';

interface KanbanSkeletonProps {
  columns?: number;
  cardsPerColumn?: number;
}

export function KanbanSkeleton({ columns = 4, cardsPerColumn = 3 }: KanbanSkeletonProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        gap: 2,
        overflowX: 'auto',
        p: 2,
        minHeight: 500,
      }}
    >
      {Array.from({ length: columns }).map((_, colIndex) => (
        <Box
          key={colIndex}
          sx={{
            minWidth: 300,
            maxWidth: 300,
            bgcolor: 'background.default',
            borderRadius: 2,
            p: 1.5,
          }}
        >
          {/* Column header skeleton */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Skeleton variant="circular" width={8} height={8} />
            <Skeleton variant="text" width={100} height={24} />
            <Skeleton variant="rounded" width={24} height={20} sx={{ ml: 'auto' }} />
          </Box>

          {/* Card skeletons */}
          {Array.from({ length: cardsPerColumn }).map((_, cardIndex) => (
            <Skeleton
              key={cardIndex}
              variant="rounded"
              height={120}
              sx={{ borderRadius: 2, mb: 1.5 }}
            />
          ))}
        </Box>
      ))}
    </Box>
  );
}

export default KanbanSkeleton;
