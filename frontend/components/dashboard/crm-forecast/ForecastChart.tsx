'use client';

import React from 'react';
import { Box, useTheme } from '@mui/material';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import type { MonthlyAggregate, ForecastPeriod } from '@/lib/api/crm-forecast';

interface ForecastChartProps {
  history: MonthlyAggregate[];
  forecasts: ForecastPeriod[];
  period: 'month' | 'quarter';
  tooltipLabels?: Record<string, string>;
}

interface ChartDataPoint {
  label: string;
  revenue?: number;
  predicted?: number;
  p20?: number;
  p80?: number;
  actual?: number | null;
}

export function ForecastChart({ history, forecasts, period, tooltipLabels }: ForecastChartProps) {
  const theme = useTheme();

  // Build chart data combining history + forecast
  const chartData: ChartDataPoint[] = [];

  if (period === 'quarter') {
    // Group history months into quarters
    for (let i = 0; i < history.length; i += 3) {
      const chunk = history.slice(i, i + 3);
      if (chunk.length === 0) continue;
      const firstMonth = chunk[0].month;
      const [year, month] = firstMonth.split('-').map(Number);
      const q = Math.ceil(month / 3);
      const revenue = chunk.reduce((s, m) => s + m.wonRevenue, 0);
      chartData.push({
        label: `${year}-Q${q}`,
        revenue,
      });
    }
  } else {
    for (const m of history) {
      chartData.push({
        label: m.month,
        revenue: m.wonRevenue,
      });
    }
  }

  // Add forecast data
  for (const fp of forecasts) {
    chartData.push({
      label: fp.label,
      predicted: fp.predicted,
      p20: fp.p20,
      p80: fp.p80,
      actual: fp.actual,
    });
  }

  // Find the boundary between history and forecast
  const boundaryIndex = chartData.findIndex((d) => d.predicted !== undefined);
  const boundaryLabel = boundaryIndex > 0 ? chartData[boundaryIndex - 1].label : undefined;

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `€${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `€${(value / 1000).toFixed(0)}k`;
    return `€${value.toFixed(0)}`;
  };

  return (
    <Box sx={{ width: '100%', height: 340 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
            tickLine={false}
            axisLine={{ stroke: theme.palette.divider }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatCurrency}
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
              const fallback: Record<string, string> = {
                revenue: 'Revenue',
                predicted: 'Forecast',
                p20: 'P20',
                p80: 'P80',
                actual: 'Actual',
              };
              const key = String(name);
              const label = tooltipLabels?.[key] ?? fallback[key] ?? key;
              return [formatCurrency(v), label];
            }}
          />

          {/* Confidence band */}
          <Area
            type="monotone"
            dataKey="p80"
            stroke="none"
            fill={theme.palette.primary.main}
            fillOpacity={0.08}
            connectNulls={false}
          />
          <Area
            type="monotone"
            dataKey="p20"
            stroke="none"
            fill={theme.palette.background.paper}
            fillOpacity={1}
            connectNulls={false}
          />

          {/* Historical revenue line */}
          <Area
            type="monotone"
            dataKey="revenue"
            stroke={theme.palette.primary.main}
            fill={theme.palette.primary.main}
            fillOpacity={0.15}
            strokeWidth={2}
            dot={{ r: 3, fill: theme.palette.primary.main }}
            connectNulls={false}
          />

          {/* Forecast line */}
          <Area
            type="monotone"
            dataKey="predicted"
            stroke={theme.palette.warning.main}
            fill="none"
            strokeWidth={2}
            strokeDasharray="6 3"
            dot={{ r: 3, fill: theme.palette.warning.main }}
            connectNulls={false}
          />

          {/* Actual dots on forecast periods */}
          <Area
            type="monotone"
            dataKey="actual"
            stroke={theme.palette.success.main}
            fill="none"
            strokeWidth={0}
            dot={{ r: 5, fill: theme.palette.success.main, strokeWidth: 2, stroke: theme.palette.background.paper }}
            connectNulls={false}
          />

          {/* Boundary line */}
          {boundaryLabel && (
            <ReferenceLine
              x={boundaryLabel}
              stroke={theme.palette.text.disabled}
              strokeDasharray="4 4"
              strokeWidth={1}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </Box>
  );
}
