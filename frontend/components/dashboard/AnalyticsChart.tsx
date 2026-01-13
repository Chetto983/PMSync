import React, { useState, useEffect } from 'react';
import { logger } from '@/lib/logger';
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
import { Paper, Typography, CircularProgress } from '@mui/material';
import { analyticsApi, EmailAnalyticsDataPoint } from '@/lib/api/analytics';
import { useTranslations } from '@/lib/hooks/use-translations';

export function AnalyticsChart() {
  const t = useTranslations();
  const [data, setData] = useState<EmailAnalyticsDataPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await analyticsApi.getEmailAnalytics();
        setData(data);
      } catch (error) {
        logger.error('Failed to fetch analytics data', { error });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <Paper sx={{ p: 4, height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 4, height: 400 }}>
      <Typography variant="h6" gutterBottom>
        {t.dashboard.widgets.trendCharts.title}
      </Typography>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
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
          <Line type="monotone" dataKey="sent" stroke="#8884d8" name={t.dashboard.widgets.trendCharts.sent} />
          <Line type="monotone" dataKey="received" stroke="#82ca9d" name={t.dashboard.widgets.trendCharts.received} />
        </LineChart>
      </ResponsiveContainer>
    </Paper>
  );
}
