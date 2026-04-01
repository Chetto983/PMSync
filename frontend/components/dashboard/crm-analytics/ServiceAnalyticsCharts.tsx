'use client';

import React from 'react';
import { Box, Typography, Paper, Grid, useTheme } from '@mui/material';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { CsatAggregation } from '@/lib/api/crm-analytics';

interface Props {
  csat: CsatAggregation;
  sa: Record<string, string | undefined>;
}

export function ServiceAnalyticsCharts({ csat, sa }: Props) {
  const theme = useTheme();
  const chartColor = theme.palette.primary.main;
  // Transform distribution for bar chart
  const distributionData = [1, 2, 3, 4, 5].map((star) => ({
    name: `${star} ${sa?.stars ?? 'stars'}`,
    count: csat.distribution[star] ?? 0,
  }));

  return (
    <Grid container spacing={3}>
      {/* CSAT Trend Line Chart */}
      {csat.monthlyTrend.length > 0 && (
        <Grid size={{ xs: 12, md: 7 }}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              {sa?.csatTrend ?? 'CSAT Trend'}
            </Typography>
            <Box sx={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={csat.monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" fontSize={12} />
                  <YAxis domain={[0, 5]} fontSize={12} />
                  <Tooltip
                    formatter={(value) => [Number(value).toFixed(2), 'Avg Rating']}
                    labelFormatter={(label) => `Month: ${label}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="avg"
                    stroke={chartColor}
                    strokeWidth={2}
                    dot={{ fill: chartColor, r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1, textAlign: 'center' }}>
              {csat.totalResponses} {sa?.responses ?? 'responses'}
            </Typography>
          </Paper>
        </Grid>
      )}

      {/* CSAT Distribution Bar Chart */}
      <Grid size={{ xs: 12, md: csat.monthlyTrend.length > 0 ? 5 : 12 }}>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            {sa?.csatDistribution ?? 'Rating Distribution'}
          </Typography>
          <Box sx={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distributionData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis allowDecimals={false} fontSize={12} />
                <Tooltip />
                <Bar dataKey="count" fill={chartColor} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        </Paper>
      </Grid>
    </Grid>
  );
}
