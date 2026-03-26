'use client';

import React from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from 'recharts';
import type { StageMetric } from '@/lib/api/crm-pipelines';

// ---- Funnel Bar Chart ----

interface FunnelChartProps {
  stageMetrics: StageMetric[];
}

export function ConversionFunnelChart({ stageMetrics }: FunnelChartProps) {
  const theme = useTheme();

  const data = stageMetrics.map((s) => ({
    name: s.stageName,
    deals: s.dealCount,
    value: s.totalValue,
    fill: s.stageColor ?? theme.palette.primary.main,
  }));

  return (
    <Box sx={{ width: '100%', height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
            tickLine={false}
            axisLine={{ stroke: theme.palette.divider }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: theme.palette.background.paper,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value, name) => {
              const v = Number(value);
              if (name === 'value') return [`€${v.toLocaleString()}`, 'Value'];
              return [v, 'Deals'];
            }}
          />
          <Bar dataKey="deals" radius={[4, 4, 0, 0]} maxBarSize={48}>
            {data.map((entry, index) => (
              <Cell key={index} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}

// ---- Deals by Stage Pie Chart ----

interface PieChartProps {
  stageMetrics: StageMetric[];
}

export function DealsByStageChart({ stageMetrics }: PieChartProps) {
  const theme = useTheme();

  const data = stageMetrics
    .filter((s) => s.dealCount > 0)
    .map((s) => ({
      name: s.stageName,
      value: s.dealCount,
      fill: s.stageColor ?? theme.palette.primary.main,
    }));

  if (data.length === 0) return null;

  return (
    <Box sx={{ width: '100%', height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
            nameKey="name"
          >
            {data.map((entry, index) => (
              <Cell key={index} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: theme.palette.background.paper,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11 }}
            formatter={(value: string) => (
              <span style={{ color: theme.palette.text.secondary }}>{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </Box>
  );
}

// ---- Win Rate Gauge ----

interface WinRateGaugeProps {
  winRate: number;
  wonDeals: number;
  lostDeals: number;
}

export function WinRateGauge({ winRate, wonDeals, lostDeals }: WinRateGaugeProps) {
  const theme = useTheme();
  const total = wonDeals + lostDeals;

  const data = [
    { name: 'Won', value: wonDeals, fill: theme.palette.success.main },
    { name: 'Lost', value: lostDeals, fill: theme.palette.error.main },
  ];

  if (total === 0) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
        <Typography color="text.secondary" variant="body2">—</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', height: 200, position: 'relative' }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={75}
            startAngle={180}
            endAngle={0}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={index} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: theme.palette.background.paper,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 8,
              fontSize: 12,
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <Box
        sx={{
          position: 'absolute',
          top: '45%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
        }}
      >
        <Typography variant="h4" fontWeight={700}>
          {winRate.toFixed(0)}%
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {wonDeals}W / {lostDeals}L
        </Typography>
      </Box>
    </Box>
  );
}
