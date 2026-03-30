'use client';

import React from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
} from '@mui/material';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useTheme } from '@mui/material/styles';
import type { ForecastPeriod } from '@/lib/api/crm-forecast';
import { useTranslations } from '@/lib/hooks/use-translations';

interface ForecastVsActualsProps {
  forecasts: ForecastPeriod[];
}

export function ForecastVsActuals({ forecasts }: ForecastVsActualsProps) {
  const theme = useTheme();
  const t = useTranslations();
  const tf = t.forecast?.vsActuals;

  // Only show periods that have actuals
  const periodsWithActuals = forecasts.filter((fp) => fp.actual !== null);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);

  if (periodsWithActuals.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="text.secondary">
          {tf?.noPastForecasts ?? 'No past forecast data available'}
        </Typography>
      </Paper>
    );
  }

  const chartData = periodsWithActuals.map((fp) => ({
    label: fp.label,
    predicted: fp.predicted,
    actual: fp.actual!,
  }));

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
        {tf?.title ?? 'Forecast vs Actuals'}
      </Typography>

      {/* Bar chart comparison */}
      <Box sx={{ width: '100%', height: 240, mb: 2 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => {
                if (v >= 1000) return `€${(v / 1000).toFixed(0)}k`;
                return `€${v}`;
              }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: theme.palette.background.paper,
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value) => [formatCurrency(Number(value))]}
            />
            <Legend />
            <Bar
              dataKey="predicted"
              name={tf?.predicted ?? 'Predicted'}
              fill={theme.palette.warning.main}
              radius={[4, 4, 0, 0]}
              maxBarSize={36}
            />
            <Bar
              dataKey="actual"
              name={tf?.actual ?? 'Actual'}
              fill={theme.palette.success.main}
              radius={[4, 4, 0, 0]}
              maxBarSize={36}
            />
          </BarChart>
        </ResponsiveContainer>
      </Box>

      {/* Detail table */}
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t.forecast?.period ?? 'Period'}</TableCell>
              <TableCell align="right">{tf?.predicted ?? 'Predicted'}</TableCell>
              <TableCell align="right">{tf?.actual ?? 'Actual'}</TableCell>
              <TableCell align="right">{tf?.variance ?? 'Variance'}</TableCell>
              <TableCell align="right">{tf?.variancePercent ?? 'Variance %'}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {periodsWithActuals.map((fp) => {
              const variance = fp.actual! - fp.predicted;
              const variancePct =
                fp.predicted > 0
                  ? ((variance / fp.predicted) * 100).toFixed(1)
                  : '—';
              const isPositive = variance >= 0;

              return (
                <TableRow key={fp.label}>
                  <TableCell>{fp.label}</TableCell>
                  <TableCell align="right">{formatCurrency(fp.predicted)}</TableCell>
                  <TableCell align="right">{formatCurrency(fp.actual!)}</TableCell>
                  <TableCell align="right">
                    <Typography
                      variant="body2"
                      color={isPositive ? 'success.main' : 'error.main'}
                    >
                      {isPositive ? '+' : ''}
                      {formatCurrency(variance)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Chip
                      size="small"
                      variant="outlined"
                      color={isPositive ? 'success' : 'error'}
                      label={`${isPositive ? '+' : ''}${variancePct}%`}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}
