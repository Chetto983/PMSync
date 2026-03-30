import React from 'react';
import {
  Paper,
  Typography,
  Skeleton,
  Box,
} from '@mui/material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useLeadScoreHistory } from '@/hooks/queries';

interface ScoreHistoryChartProps {
  contactId: string;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export function ScoreHistoryChart({ contactId }: ScoreHistoryChartProps) {
  const t = useTranslations();
  const tl = t.leadScore;
  const { data, isLoading } = useLeadScoreHistory(contactId);

  if (isLoading) {
    return (
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Skeleton variant="text" width="40%" sx={{ mb: 1 }} />
        <Skeleton variant="rectangular" height={180} />
      </Paper>
    );
  }

  const entries = data?.data ?? [];

  if (entries.length < 2) {
    return (
      <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
        <Typography variant="caption" color="text.secondary">
          {tl?.noScore ?? 'Not enough data for trend chart'}
        </Typography>
      </Paper>
    );
  }

  const chartData = entries.map((e) => ({
    date: formatDate(e.computedAt),
    score: e.score,
    fullDate: new Date(e.computedAt).toLocaleDateString(),
  }));

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="caption" fontWeight={600} gutterBottom display="block">
        {tl?.gauge?.title ?? 'Lead Score'} — 90d
      </Typography>
      <Box sx={{ width: '100%', height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10 }}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            <RechartsTooltip
              formatter={(value) => [`${value}/100`, tl?.score ?? 'Score']}
              labelFormatter={(_label, payload) => {
                const entry = payload?.[0]?.payload as { fullDate?: string } | undefined;
                return entry?.fullDate ?? String(_label);
              }}
            />
            <Line
              type="monotone"
              dataKey="score"
              stroke="#26a69a"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </Box>
    </Paper>
  );
}
