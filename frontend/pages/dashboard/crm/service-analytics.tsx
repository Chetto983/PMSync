import dynamic from 'next/dynamic';
import { Skeleton, Box } from '@mui/material';

const ServiceAnalyticsDashboard = dynamic(
  () =>
    import('@/components/dashboard/crm-analytics/ServiceAnalyticsDashboard').then(
      (m) => m.ServiceAnalyticsDashboard,
    ),
  {
    loading: () => (
      <Box sx={{ p: 3 }}>
        <Skeleton variant="text" width="30%" height={40} />
        <Skeleton variant="rectangular" height={400} sx={{ mt: 2 }} />
      </Box>
    ),
    ssr: false,
  },
);

export default function ServiceAnalyticsPage() {
  return <ServiceAnalyticsDashboard />;
}
