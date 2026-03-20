'use client';

import React from 'react';
import { Box, Skeleton, alpha, useTheme } from '@mui/material';

interface KanbanSkeletonProps {
  columns?: number;
  cardsPerColumn?: number;
}

export function KanbanSkeleton({ columns = 4, cardsPerColumn = 3 }: KanbanSkeletonProps) {
  const theme = useTheme();

  return (
    <Box
      sx={{
        display: 'flex',
        gap: 2,
        overflowX: 'auto',
        px: 2,
        py: 2,
        minHeight: 500,
      }}
    >
      {Array.from({ length: columns }).map((_, colIndex) => (
        <Box
          key={colIndex}
          sx={{
            minWidth: 310,
            maxWidth: 360,
            flex: '1 1 310px',
            bgcolor: alpha(theme.palette.grey[50], 0.7),
            borderRadius: 3,
            border: `1px solid ${alpha(theme.palette.divider, 0.4)}`,
            p: 1.5,
          }}
        >
          {/* Header skeleton */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, px: 0.75 }}>
            <Skeleton variant="rounded" width={28} height={28} sx={{ borderRadius: 1.5 }} />
            <Skeleton variant="text" width={80} height={20} />
            <Skeleton variant="rounded" width={32} height={24} sx={{ ml: 'auto', borderRadius: 1.5 }} />
          </Box>

          {/* Cards skeleton */}
          {Array.from({ length: cardsPerColumn }).map((_, cardIndex) => (
            <Box
              key={cardIndex}
              sx={{
                borderRadius: 2.5,
                border: `1px solid ${alpha(theme.palette.divider, 0.3)}`,
                p: 2,
                mb: 1,
                bgcolor: 'background.paper',
              }}
            >
              <Skeleton variant="text" width="80%" height={18} sx={{ mb: 0.5 }} />
              <Skeleton variant="text" width="50%" height={14} sx={{ mb: 1 }} />
              <Box sx={{ display: 'flex', gap: 0.75 }}>
                <Skeleton variant="rounded" width={60} height={22} sx={{ borderRadius: 1 }} />
                <Box sx={{ flex: 1 }} />
                <Skeleton variant="text" width={48} height={14} />
              </Box>
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  );
}

export default KanbanSkeleton;
