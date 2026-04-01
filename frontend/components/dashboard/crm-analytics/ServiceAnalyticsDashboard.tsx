'use client';

import React, { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
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
import { Clock, CheckCircle, Star, Shield } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useCsatAggregation, useServiceMetrics } from '@/hooks/queries/use-crm-analytics';
import { ServiceAnalyticsCharts } from './ServiceAnalyticsCharts';

type DateRange = 'last30' | 'last90' | 'last6m' | 'all';

function getDateParams(range: DateRange): { startDate?: string; endDate?: string } {
  if (range === 'all') return {};
  const now = new Date();
  const start = new Date();
  if (range === 'last30') start.setDate(now.getDate() - 30);
  if (range === 'last90') start.setDate(now.getDate() - 90);
  if (range === 'last6m') start.setMonth(now.getMonth() - 6);
  return { startDate: start.toISOString(), endDate: now.toISOString() };
}

function formatMinutes(minutes: number | null, sa: Record<string, string | undefined>): string {
  if (minutes === null) return sa?.noData ?? 'N/A';
  if (minutes >= 60) {
    const hrs = Math.round(minutes / 60 * 10) / 10;
    return `${hrs} ${sa?.hours ?? 'hrs'}`;
  }
  return `${minutes} ${sa?.minutes ?? 'min'}`;
}

interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}

function KpiCard({ icon, label, value, color }: KpiCardProps) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box sx={{ color, display: 'flex' }}>{icon}</Box>
        <Box>
          <Typography variant="body2" color="text.secondary">{label}</Typography>
          <Typography variant="h5" fontWeight={600}>{value}</Typography>
        </Box>
      </Box>
    </Paper>
  );
}

export function ServiceAnalyticsDashboard() {
  const t = useTranslations();
  const sa = t.serviceAnalytics;
  const [dateRange, setDateRange] = useState<DateRange>('last90');

  const dateParams = useMemo(() => getDateParams(dateRange), [dateRange]);

  const csatQuery = useCsatAggregation(dateParams);
  const metricsQuery = useServiceMetrics(dateParams);

  const isLoading = csatQuery.isLoading || metricsQuery.isLoading;
  const isError = csatQuery.isError || metricsQuery.isError;

  if (isError) {
    return <Alert severity="error">Failed to load analytics data</Alert>;
  }

  const metrics = metricsQuery.data;
  const csat = csatQuery.data;

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', p: { xs: 2, md: 3 } }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={600}>
            {sa?.title ?? 'Service Analytics'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {sa?.subtitle ?? 'Customer service performance metrics'}
          </Typography>
        </Box>
        <TextField
          select
          size="small"
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value as DateRange)}
          label={sa?.dateRange ?? 'Date Range'}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="last30">{sa?.last30Days ?? 'Last 30 Days'}</MenuItem>
          <MenuItem value="last90">{sa?.last90Days ?? 'Last 90 Days'}</MenuItem>
          <MenuItem value="last6m">{sa?.last6Months ?? 'Last 6 Months'}</MenuItem>
          <MenuItem value="all">{sa?.allTime ?? 'All Time'}</MenuItem>
        </TextField>
      </Box>

      {/* KPI Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          {isLoading ? <Skeleton variant="rectangular" height={80} /> : (
            <KpiCard
              icon={<Clock size={24} />}
              label={sa?.firstResponseTime ?? 'Avg First Response'}
              value={formatMinutes(metrics?.avgFirstResponseMinutes ?? null, sa ?? {})}
              color="info.main"
            />
          )}
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          {isLoading ? <Skeleton variant="rectangular" height={80} /> : (
            <KpiCard
              icon={<CheckCircle size={24} />}
              label={sa?.resolutionTime ?? 'Avg Resolution Time'}
              value={formatMinutes(metrics?.avgResolutionMinutes ?? null, sa ?? {})}
              color="success.main"
            />
          )}
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          {isLoading ? <Skeleton variant="rectangular" height={80} /> : (
            <KpiCard
              icon={<Shield size={24} />}
              label={sa?.slaCompliance ?? 'SLA Compliance'}
              value={metrics?.slaComplianceRate !== null ? `${metrics?.slaComplianceRate}%` : (sa?.noData ?? 'N/A')}
              color="warning.main"
            />
          )}
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          {isLoading ? <Skeleton variant="rectangular" height={80} /> : (
            <KpiCard
              icon={<Star size={24} />}
              label={sa?.csatAverage ?? 'CSAT Average'}
              value={metrics?.csatAverage !== null ? `${metrics?.csatAverage}/5` : (sa?.noData ?? 'N/A')}
              color="primary.main"
            />
          )}
        </Grid>
      </Grid>

      {/* Charts */}
      {!isLoading && csat && (
        <ServiceAnalyticsCharts csat={csat} sa={sa ?? {}} />
      )}

      {/* Top Tickets Table */}
      {!isLoading && metrics && metrics.topTicketsByResolution.length > 0 && (
        <Paper variant="outlined" sx={{ mt: 3 }}>
          <Box sx={{ p: 2 }}>
            <Typography variant="subtitle1" fontWeight={600}>
              {sa?.topTickets ?? 'Top Tickets by Resolution Time'}
            </Typography>
          </Box>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{sa?.ticketSubject ?? 'Subject'}</TableCell>
                  <TableCell>{sa?.assignee ?? 'Assignee'}</TableCell>
                  <TableCell align="right">{sa?.resolutionMins ?? 'Resolution (min)'}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {metrics.topTicketsByResolution.map((ticket) => (
                  <TableRow key={ticket.id}>
                    <TableCell>{ticket.subject}</TableCell>
                    <TableCell>{ticket.assigneeName ?? (sa?.unassigned ?? 'Unassigned')}</TableCell>
                    <TableCell align="right">{ticket.resolutionMinutes}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </Box>
  );
}
