/**
 * WidgetSkeleton - Loading placeholder for dashboard widgets
 */

import { Box, Skeleton } from '@mui/material';

export function WidgetSkeleton() {
  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Skeleton variant="rounded" width={44} height={44} sx={{ borderRadius: 2.5 }} />
        <Box sx={{ flex: 1 }}>
          <Skeleton width="40%" height={24} />
          <Skeleton width="60%" height={16} sx={{ mt: 0.5 }} />
        </Box>
      </Box>
      <Skeleton variant="rounded" height={120} sx={{ borderRadius: 3 }} />
    </Box>
  );
}
