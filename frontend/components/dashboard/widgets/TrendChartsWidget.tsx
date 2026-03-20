/**
 * TrendChartsWidget - Email activity trends chart
 *
 * Shows sent/received email trends over the last 7 days
 * using recharts for visualization
 */

'use client';

import { useEmailTrends } from '@/hooks/queries/use-dashboard';
import { useTranslations } from '@/lib/hooks/use-translations';
import { BaseWidget } from './BaseWidget';
import { Box, Typography, useTheme } from '@mui/material';
import { TrendingUp, BarChart3 } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

export function TrendChartsWidget() {
  const t = useTranslations();
  const theme = useTheme();
  const { data, isLoading, error, refetch } = useEmailTrends();

  const receivedColor = theme.palette.primary.main;
  const sentColor = theme.palette.success.main;

  return (
    <BaseWidget
      id="trend-charts"
      title={t.dashboard.widgets.trendCharts.title}
      subtitle={t.dashboard.widgets.trendCharts.subtitle}
      loading={isLoading}
      error={error?.message}
      rawError={error}
      onRefresh={() => refetch()}
      icon={<TrendingUp size={18} />}
    >
      {data && data.trends.length > 0 ? (
        <Box sx={{ width: '100%', height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data.trends}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorReceived" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={receivedColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={receivedColor} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorSent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={sentColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={sentColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={theme.palette.divider}
                vertical={false}
              />
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
                contentStyle={{
                  backgroundColor: theme.palette.background.paper,
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: theme.palette.text.primary, fontWeight: 600 }}
                formatter={(value, name) => [
                  value,
                  name === 'received'
                    ? t.dashboard.widgets.trendCharts.received
                    : t.dashboard.widgets.trendCharts.sent,
                ]}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                formatter={(value) => (
                  <span style={{ color: theme.palette.text.secondary }}>
                    {value === 'received'
                      ? t.dashboard.widgets.trendCharts.received
                      : t.dashboard.widgets.trendCharts.sent}
                  </span>
                )}
              />
              <Area
                type="monotone"
                dataKey="received"
                stroke={receivedColor}
                fillOpacity={1}
                fill="url(#colorReceived)"
                strokeWidth={2}
                name="received"
              />
              <Area
                type="monotone"
                dataKey="sent"
                stroke={sentColor}
                fillOpacity={1}
                fill="url(#colorSent)"
                strokeWidth={2}
                name="sent"
              />
            </AreaChart>
          </ResponsiveContainer>
        </Box>
      ) : (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            py: 4,
            color: 'text.secondary',
          }}
        >
          <BarChart3 size={32} strokeWidth={1.5} />
          <Typography variant="body2" sx={{ mt: 1 }}>
            {t.dashboard.widgets.trendCharts.noData}
          </Typography>
        </Box>
      )}
    </BaseWidget>
  );
}
