import React, { useMemo } from 'react';
import { Box, Typography, Paper } from '@mui/material';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { useTranslations } from '@/lib/hooks/use-translations';

interface SignalBreakdownProps {
  signals: Record<string, number>;
  height?: number;
}

const SIGNAL_COLORS: Record<string, string> = {
  responseDecay: '#ef4444',
  replyRateDrop: '#f97316',
  meetingDrop: '#eab308',
  dealStagnation: '#8b5cf6',
  inactivity: '#6366f1',
  emailBounce: '#ec4899',
};

export function SignalBreakdown({
  signals,
  height = 200,
}: SignalBreakdownProps) {
  const t = useTranslations();
  const ts = t.churn?.signals;

  const data = useMemo(() => {
    return Object.entries(signals)
      .filter(([, value]) => value > 0)
      .map(([key, value]) => ({
        name: ts?.[key as keyof typeof ts] ?? key,
        value: Math.round(value * 100),
        key,
      }))
      .sort((a, b) => b.value - a.value);
  }, [signals, ts]);

  if (data.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No signal data available
      </Typography>
    );
  }

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="subtitle2" gutterBottom>
        {t.churn?.badge?.churnRisk ?? 'Risk Factors'}
      </Typography>
      <Box sx={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              domain={[0, 100]}
              tickFormatter={(v: number) => `${v}%`}
              fontSize={11}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={120}
              fontSize={11}
              tick={{ fill: 'var(--mui-palette-text-secondary)' }}
            />
            <Tooltip
              formatter={(value) => [`${value}%`, 'Contribution']}
              contentStyle={{
                backgroundColor: 'var(--mui-palette-background-paper)',
                border: '1px solid var(--mui-palette-divider)',
                borderRadius: 4,
                fontSize: 12,
              }}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={24}>
              {data.map((entry) => (
                <Cell
                  key={entry.key}
                  fill={SIGNAL_COLORS[entry.key] ?? '#94a3b8'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Box>
    </Paper>
  );
}
