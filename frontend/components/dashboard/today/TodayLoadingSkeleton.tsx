/**
 * TodayLoadingSkeleton — Loading placeholder per UI-SPEC § Loading State.
 *
 * Greeting skeleton (text, 60% width, 28px) + 5 row skeletons (rectangular, 48px).
 */

'use client';

import { Box, Skeleton } from '@mui/material';

export function TodayLoadingSkeleton() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Skeleton variant="text" width="60%" height={28} />
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton
            key={i}
            variant="rectangular"
            height={48}
            sx={{ borderRadius: 1, mb: 0.5 }}
          />
        ))}
      </Box>
    </Box>
  );
}
