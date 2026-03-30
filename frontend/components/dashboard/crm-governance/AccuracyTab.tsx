'use client';

import React, { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Skeleton,
  Alert,
  TextField,
  MenuItem,
  Chip,
} from '@mui/material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useGovernanceAccuracy } from '@/hooks/queries/use-crm-governance';
import type { TimeRange, AccuracyPoint } from '@/lib/api/crm-governance';

const MODEL_COLORS: Record<string, string> = {
  'lead-scoring': '#26a69a',
  'churn-prediction': '#ef5350',
  forecast: '#42a5f5',
  nba: '#ab47bc',
};

const METRIC_LABELS: Record<string, string> = {
  quality: 'Quality Score',
  mape: 'MAPE (%)',
  auc: 'AUC-ROC',
  precision: 'Precision',
  recall: 'Recall',
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

interface ChartDataPoint {
  date: string;
  [key: string]: string | number;
}

function buildChartData(
  points: AccuracyPoint[],
  metric: string,
): ChartDataPoint[] {
  const dateMap = new Map<string, ChartDataPoint>();

  for (const p of points) {
    if (p.metric !== metric) continue;
    const existing = dateMap.get(p.date) ?? { date: p.date };
    existing[p.modelType] = p.value;
    dateMap.set(p.date, existing);
  }

  return Array.from(dateMap.values()).sort((a, b) =>
    (a.date as string).localeCompare(b.date as string),
  );
}

export function AccuracyTab() {
  const t = useTranslations();
  const tg = t.aiGovernance;
  const ta = tg?.accuracy;

  const [range, setRange] = useState<TimeRange>('30d');
  const { data, isLoading, error } = useGovernanceAccuracy(range);

  // Derive available metrics and models from data
  const { metrics, models } = useMemo(() => {
    if (!data || data.length === 0) return { metrics: [], models: [] };
    const metricSet = new Set(data.map((p) => p.metric));
    const modelSet = new Set(data.map((p) => p.modelType));
    return {
      metrics: Array.from(metricSet),
      models: Array.from(modelSet),
    };
  }, [data]);

  const [selectedMetric, setSelectedMetric] = useState('quality');

  // Use first available metric if selected one has no data
  const activeMetric =
    metrics.includes(selectedMetric) ? selectedMetric : (metrics[0] ?? 'quality');

  const chartData = useMemo(
    () => (data ? buildChartData(data, activeMetric) : []),
    [data, activeMetric],
  );

  if (isLoading) {
    return (
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Skeleton width="40%" height={24} sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" height={300} />
      </Paper>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        Failed to load accuracy metrics
      </Alert>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="text.secondary">
          {ta?.noData ?? 'No accuracy data available yet'}
        </Typography>
      </Paper>
    );
  }

  return (
    <Box>
      {/* Controls */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <TextField
          select
          size="small"
          label={ta?.timeRange ?? 'Time Range'}
          value={range}
          onChange={(e) => setRange(e.target.value as TimeRange)}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="7d">{ta?.last7d ?? 'Last 7 days'}</MenuItem>
          <MenuItem value="30d">{ta?.last30d ?? 'Last 30 days'}</MenuItem>
          <MenuItem value="90d">{ta?.last90d ?? 'Last 90 days'}</MenuItem>
        </TextField>

        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
          {metrics.map((m) => (
            <Chip
              key={m}
              label={METRIC_LABELS[m] ?? m}
              variant={m === activeMetric ? 'filled' : 'outlined'}
              size="small"
              onClick={() => setSelectedMetric(m)}
              color={m === activeMetric ? 'primary' : 'default'}
            />
          ))}
        </Box>
      </Box>

      {/* Chart */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" fontWeight={600} gutterBottom>
          {ta?.title ?? 'Model Accuracy'} — {METRIC_LABELS[activeMetric] ?? activeMetric}
        </Typography>

        <Box sx={{ width: '100%', height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fontSize: 11 }}
                tickLine={false}
              />
              <YAxis
                domain={activeMetric === 'mape' ? [0, 'auto'] : [0, 1]}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <RechartsTooltip
                formatter={(value, name) => [
                  activeMetric === 'mape'
                    ? `${value}%`
                    : Number(value).toFixed(2),
                  String(name),
                ]}
              />
              <Legend />
              {models.map((model) => (
                <Line
                  key={model}
                  type="monotone"
                  dataKey={model}
                  name={model}
                  stroke={MODEL_COLORS[model] ?? '#888'}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </Box>
      </Paper>
    </Box>
  );
}
