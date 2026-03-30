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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useTranslations } from '@/lib/hooks/use-translations';
import {
  useGovernanceCosts,
  useGovernanceCostTrend,
} from '@/hooks/queries/use-crm-governance';
import type { TimeRange } from '@/lib/api/crm-governance';

const TYPE_COLORS: Record<string, string> = {
  LEAD_SCORE: '#26a69a',
  CHURN: '#ef5350',
  FORECAST: '#42a5f5',
  NBA: '#ab47bc',
  CHAT: '#ff9800',
  OTHER: '#78909c',
  // Legacy runType fallbacks
  'lead-scoring': '#26a69a',
  'churn-prediction': '#ef5350',
  forecast: '#42a5f5',
  nba: '#ab47bc',
  chat: '#ff9800',
};

function formatCost(val: number): string {
  return `$${val.toFixed(4)}`;
}

function formatTokens(val: number): string {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return String(val);
}

export function CostsTab() {
  const t = useTranslations();
  const tg = t.aiGovernance;
  const tc = tg?.costs;
  const ta = tg?.accuracy;

  const [range, setRange] = useState<TimeRange>('30d');
  const { data: costs, isLoading: costsLoading, error: costsError } = useGovernanceCosts(range);
  const { data: trend, isLoading: trendLoading } = useGovernanceCostTrend();

  // Build trend chart data: pivot months as X, predictionTypes as stacked bars
  const trendChartData = useMemo(() => {
    if (!trend || trend.length === 0) return [];
    const monthMap = new Map<string, Record<string, string | number>>();
    for (const t of trend) {
      const existing = monthMap.get(t.month) ?? { month: t.month };
      const prev = (existing[t.predictionType] as number) ?? 0;
      existing[t.predictionType] = prev + t.totalCost;
      monthMap.set(t.month, existing);
    }
    return Array.from(monthMap.values());
  }, [trend]);

  const trendTypes = useMemo(() => {
    if (!trend) return [];
    return Array.from(new Set(trend.map((t) => t.predictionType)));
  }, [trend]);

  if (costsLoading) {
    return (
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Skeleton width="40%" height={24} sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" height={200} />
      </Paper>
    );
  }

  if (costsError) {
    return <Alert severity="error">Failed to load cost data</Alert>;
  }

  if (!costs || costs.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="text.secondary">
          {tc?.noData ?? 'No cost data available yet'}
        </Typography>
      </Paper>
    );
  }

  return (
    <Box>
      {/* Range selector */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
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
      </Box>

      {/* Cost breakdown table */}
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle2" fontWeight={600} gutterBottom>
          {tc?.title ?? 'AI Cost Breakdown'}
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{tc?.featureType ?? 'Feature'}</TableCell>
                <TableCell align="right">{tc?.totalCost ?? 'Total Cost'}</TableCell>
                <TableCell align="right">{tc?.tokenCount ?? 'Tokens Used'}</TableCell>
                <TableCell align="right">{tc?.callCount ?? 'API Calls'}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {costs.map((row) => (
                <TableRow key={row.predictionType}>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box
                        sx={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          bgcolor: TYPE_COLORS[row.predictionType] ?? '#888',
                          flexShrink: 0,
                        }}
                      />
                      {row.predictionType}
                    </Box>
                  </TableCell>
                  <TableCell align="right">{formatCost(row.totalCost)}</TableCell>
                  <TableCell align="right">{formatTokens(row.totalTokens)}</TableCell>
                  <TableCell align="right">{row.callCount.toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Monthly trend chart */}
      {trendChartData.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" fontWeight={600} gutterBottom>
            {tc?.trend ?? 'Monthly Cost Trend'}
          </Typography>
          {trendLoading ? (
            <Skeleton variant="rectangular" height={250} />
          ) : (
            <Box sx={{ width: '100%', height: 250 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={trendChartData}
                  margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <RechartsTooltip
                    formatter={(value) => [`$${Number(value).toFixed(4)}`, '']}
                  />
                  <Legend />
                  {trendTypes.map((pt) => (
                    <Bar
                      key={pt}
                      dataKey={pt}
                      name={pt}
                      stackId="cost"
                      fill={TYPE_COLORS[pt] ?? '#888'}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </Box>
          )}
        </Paper>
      )}
    </Box>
  );
}
