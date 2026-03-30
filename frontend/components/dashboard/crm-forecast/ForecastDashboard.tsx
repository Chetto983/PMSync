'use client';

import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  TextField,
  MenuItem,
  Button,
  Alert,
  Skeleton,
  Chip,
} from '@mui/material';
import { TrendingUp, RefreshCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useForecast, useForecastRefresh } from '@/hooks/queries/use-crm-forecast';
import { crmPipelineListOptions } from '@/hooks/queries/use-crm-pipelines';
import { useTranslations } from '@/lib/hooks/use-translations';
import { ForecastChart } from './ForecastChart';
import { ForecastVsActuals } from './ForecastVsActuals';

export function ForecastDashboard() {
  const t = useTranslations();
  const tf = t.forecast;

  const { data: pipelines, isLoading: pipelinesLoading } = useQuery(
    crmPipelineListOptions(),
  );

  const [selectedPipelineId, setSelectedPipelineId] = useState<string>('');
  const [period, setPeriod] = useState<'month' | 'quarter'>('quarter');

  // Use first pipeline if none selected
  const activePipelineId =
    selectedPipelineId || (pipelines && pipelines.length > 0 ? pipelines[0].id : '');

  const {
    data: forecast,
    isLoading: forecastLoading,
    error: forecastError,
  } = useForecast(activePipelineId, period);

  const refreshMutation = useForecastRefresh();

  const handleRefresh = () => {
    refreshMutation.mutate({ pipelineId: activePipelineId, period });
  };

  const getMethodLabel = (method: string) => {
    switch (method) {
      case 'seasonal':
        return tf?.methodSeasonal ?? 'Seasonal';
      case 'trend':
        return tf?.methodTrend ?? 'Trend';
      case 'average':
        return tf?.methodAverage ?? 'Average';
      default:
        return method;
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);

  if (pipelinesLoading) {
    return (
      <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, mx: 'auto' }}>
        <Skeleton width="30%" height={32} animation="wave" sx={{ mb: 1 }} />
        <Skeleton width="50%" height={20} animation="wave" sx={{ mb: 3 }} />
        <Skeleton variant="rounded" height={400} animation="wave" />
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
        <TrendingUp size={28} />
        <Typography variant="h5" fontWeight={600}>
          {tf?.title ?? 'Revenue Forecast'}
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {tf?.subtitle ?? 'Revenue projections based on deal history'}
      </Typography>

      {/* Controls */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <TextField
            select
            size="small"
            fullWidth
            label={tf?.pipeline ?? 'Pipeline'}
            value={activePipelineId}
            onChange={(e) => setSelectedPipelineId(e.target.value)}
          >
            {(pipelines ?? []).map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.name}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <TextField
            select
            size="small"
            fullWidth
            label={tf?.period ?? 'Period'}
            value={period}
            onChange={(e) => setPeriod(e.target.value as 'month' | 'quarter')}
          >
            <MenuItem value="quarter">{tf?.periodQuarter ?? 'Quarterly'}</MenuItem>
            <MenuItem value="month">{tf?.periodMonth ?? 'Monthly'}</MenuItem>
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Button
            variant="outlined"
            size="medium"
            startIcon={<RefreshCw size={16} />}
            onClick={handleRefresh}
            disabled={refreshMutation.isPending || !activePipelineId}
            sx={{ height: 40 }}
          >
            {refreshMutation.isPending
              ? (tf?.refreshing ?? 'Refreshing...')
              : (tf?.refresh ?? 'Refresh')}
          </Button>
        </Grid>
      </Grid>

      {/* Refresh feedback */}
      {refreshMutation.isSuccess && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => refreshMutation.reset()}>
          {tf?.refreshSuccess ?? 'Forecast refreshed successfully'}
        </Alert>
      )}
      {refreshMutation.isError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => refreshMutation.reset()}>
          {tf?.refreshError ?? 'Failed to refresh forecast'}
        </Alert>
      )}

      {/* Loading state */}
      {forecastLoading && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Skeleton variant="rounded" height={340} animation="wave" />
        </Paper>
      )}

      {/* Error state */}
      {forecastError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {(forecastError as Error).message}
        </Alert>
      )}

      {/* Empty state */}
      {forecast && forecast.forecasts.length === 0 && !forecastLoading && (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">
            {tf?.noData ?? 'No forecast data available'}
          </Typography>
          <Typography variant="body2" color="text.disabled" sx={{ mt: 1 }}>
            {tf?.noDataDescription ?? 'Need at least 3 months of deal history.'}
          </Typography>
        </Paper>
      )}

      {/* Chart */}
      {forecast && forecast.forecasts.length > 0 && (
        <>
          <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Typography variant="subtitle1" fontWeight={600}>
                {tf?.chart?.title ?? 'Revenue Projection'}
              </Typography>
              <Chip
                size="small"
                variant="outlined"
                label={getMethodLabel(forecast.method)}
              />
              {forecast.mae > 0 && (
                <Chip
                  size="small"
                  variant="outlined"
                  color="warning"
                  label={`${tf?.mae ?? 'MAE'}: ${formatCurrency(forecast.mae)}`}
                />
              )}
            </Box>
            <ForecastChart
              history={forecast.history}
              forecasts={forecast.forecasts}
              period={forecast.period}
            />
          </Paper>

          {/* Summary cards */}
          <Grid container spacing={2}>
            {forecast.forecasts.map((fp) => (
              <Grid key={fp.label} size={{ xs: 6, sm: 3 }}>
                <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="caption" color="text.secondary">
                    {fp.label}
                  </Typography>
                  <Typography variant="h6" fontWeight={600} sx={{ mt: 0.5 }}>
                    {formatCurrency(fp.predicted)}
                  </Typography>
                  <Typography variant="caption" color="text.disabled">
                    {formatCurrency(fp.p20)} — {formatCurrency(fp.p80)}
                  </Typography>
                  {fp.actual !== null && (
                    <Typography
                      variant="body2"
                      color="success.main"
                      fontWeight={500}
                      sx={{ mt: 0.5 }}
                    >
                      {tf?.actual ?? 'Actual'}: {formatCurrency(fp.actual)}
                    </Typography>
                  )}
                </Paper>
              </Grid>
            ))}
          </Grid>

          {/* Forecast vs Actuals */}
          <Box sx={{ mt: 3 }}>
            <ForecastVsActuals forecasts={forecast.forecasts} />
          </Box>
        </>
      )}
    </Box>
  );
}
