import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Box, Button, Paper, Skeleton, Typography, useTheme } from '@mui/material';
import { BarChart3 } from 'lucide-react';
import { useEmailTrends } from '@/hooks/queries/use-dashboard';
import { useConsent } from '@/hooks/queries/use-consent';
import { useTranslations } from '@/lib/hooks/use-translations';
import { QueryErrorAlert } from '@/components/common/QueryErrorAlert';
import { EmptyState } from '@/components/common/EmptyState';

export function AnalyticsChart() {
  const t = useTranslations();
  const theme = useTheme();
  const { data: consentList, isLoading: consentLoading } = useConsent();
  const hasEmailAnalyticsConsent =
    consentList?.some((consent) => consent.feature === 'email_analytics' && consent.granted) ??
    false;
  const { data, isLoading, error, refetch } = useEmailTrends();

  const loading = consentLoading || isLoading;
  const chartData = data?.trends ?? [];
  const consentDescription =
    t.settings?.consentPanel?.features?.email_analytics?.description ||
    'Enable email analytics consent to see activity trends.';

  if (loading) {
    return (
      <Paper sx={{ p: { xs: 3, sm: 4 }, minHeight: 320 }}>
        <Skeleton variant="text" width={180} height={32} sx={{ mb: 2 }} />
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="rounded" height={240} />
          ))}
        </Box>
      </Paper>
    );
  }

  if (!hasEmailAnalyticsConsent) {
    return (
      <Paper
        sx={{
          p: { xs: 3, sm: 4 },
          minHeight: 320,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Box sx={{ maxWidth: 420, textAlign: 'center' }}>
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: 3,
              mx: 'auto',
              mb: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'action.hover',
              color: 'primary.main',
            }}
          >
            <BarChart3 size={24} />
          </Box>
          <Typography variant="h6" sx={{ mb: 1 }}>
            {t.dashboard.widgets.trendCharts.title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
            {consentDescription}
          </Typography>
          <Button
            variant="contained"
            href="/dashboard/settings?section=consent"
            sx={{ textTransform: 'none' }}
          >
            {t.settings?.consentPanel?.title || t.nav.settings}
          </Button>
        </Box>
      </Paper>
    );
  }

  if (error) {
    return (
      <Paper sx={{ p: { xs: 3, sm: 4 }, minHeight: 320 }}>
        <QueryErrorAlert error={error} onRetry={() => refetch()} />
      </Paper>
    );
  }

  if (chartData.length === 0) {
    return (
      <Paper sx={{ p: { xs: 3, sm: 4 }, minHeight: 320 }}>
        <EmptyState
          icon={BarChart3}
          color="#f59e0b"
          title={t.analytics?.emptyTitle ?? 'No analytics data'}
          description={t.analytics?.emptyDescription ?? 'Analytics will appear once you start using PMSync'}
        />
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: { xs: 2, sm: 4 } }}>
      <Typography variant="h6" gutterBottom>
        {t.dashboard.widgets.trendCharts.title}
      </Typography>
      <Box sx={{ height: { xs: 280, sm: 360 } }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              formatter={(value, name) => {
                const labels: Record<string, string> = {
                  sent: t.dashboard.widgets.trendCharts.sent,
                  received: t.dashboard.widgets.trendCharts.received,
                };
                return [value, labels[name as string] || name];
              }}
            />
            <Legend
              formatter={(value: string) => {
                const labels: Record<string, string> = {
                  sent: t.dashboard.widgets.trendCharts.sent,
                  received: t.dashboard.widgets.trendCharts.received,
                };
                return labels[value] || value;
              }}
            />
            <Line
              type="monotone"
              dataKey="sent"
              stroke={theme.palette.primary.main}
              strokeWidth={2}
              dot={false}
              name="sent"
            />
            <Line
              type="monotone"
              dataKey="received"
              stroke={theme.palette.success.main}
              strokeWidth={2}
              dot={false}
              name="received"
            />
          </LineChart>
        </ResponsiveContainer>
      </Box>
    </Paper>
  );
}
