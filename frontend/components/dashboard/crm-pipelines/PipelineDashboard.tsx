import React from 'react';
import {
  Box,
  Typography,
  Breadcrumbs,
  Skeleton,
  Alert,
  IconButton,
  Paper,
  Grid,
} from '@mui/material';
import MuiLink from '@mui/material/Link';
import NextLink from 'next/link';
import {
  ArrowLeft,
  BarChart3,
  TrendingUp,
  Trophy,
  DollarSign,
  Target,
  Scale,
} from 'lucide-react';
import { useRouter } from 'next/router';
import { useTranslations } from '@/lib/hooks/use-translations';
import { usePipeline, usePipelineMetrics } from '@/hooks/queries/use-crm-pipelines';

interface PipelineDashboardProps {
  pipelineId: string;
}

export function PipelineDashboard({ pipelineId }: PipelineDashboardProps) {
  const t = useTranslations();
  const tp = t.crmPipelines;
  const td = tp?.dashboard;
  const router = useRouter();

  const { data: pipeline, isLoading: pipelineLoading } = usePipeline(pipelineId);
  const { data: metrics, isLoading: metricsLoading, isError, error } = usePipelineMetrics(pipelineId);

  const isLoading = pipelineLoading || metricsLoading;

  if (isLoading) {
    return (
      <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200 }}>
        <Skeleton width="40%" height={24} animation="wave" sx={{ mb: 2 }} />
        <Skeleton width="60%" height={32} animation="wave" sx={{ mb: 1 }} />
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Grid key={i} size={{ xs: 12, sm: 6, md: 4 }}>
              <Skeleton variant="rounded" height={120} animation="wave" />
            </Grid>
          ))}
        </Grid>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 8 }}>
            <Skeleton variant="rounded" height={300} animation="wave" />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Skeleton variant="rounded" height={300} animation="wave" />
          </Grid>
        </Grid>
      </Box>
    );
  }

  if (isError) {
    return (
      <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200 }}>
        <Alert severity="error">
          {td?.loadError ?? 'Failed to load pipeline metrics'}
          {error instanceof Error ? `: ${error.message}` : ''}
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200 }}>
      {/* Breadcrumb */}
      <Breadcrumbs sx={{ mb: 1 }}>
        <MuiLink component={NextLink} href="/dashboard" underline="hover" color="text.secondary">
          Dashboard
        </MuiLink>
        <MuiLink component={NextLink} href="/dashboard/crm/pipelines" underline="hover" color="text.secondary">
          {tp?.breadcrumb?.pipelines ?? 'Pipelines'}
        </MuiLink>
        <Typography color="text.primary">
          {td?.title ?? 'Dashboard'}
        </Typography>
      </Breadcrumbs>

      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <IconButton
          size="small"
          onClick={() => router.push('/dashboard/crm/pipelines')}
          sx={{ minWidth: 44, minHeight: 44 }}
        >
          <ArrowLeft size={20} />
        </IconButton>
        <BarChart3 size={28} />
        <Typography variant="h5" fontWeight={600}>
          {pipeline?.name ?? ''}
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3, ml: 7 }}>
        {td?.description ?? 'Key metrics and performance overview.'}
      </Typography>

      {/* Metric Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <MetricCard
            icon={<TrendingUp size={20} />}
            label={td?.conversionRate ?? 'Conversion Rate'}
            value={metrics ? `${metrics.conversionRate.toFixed(1)}%` : '—'}
            description={td?.conversionRateDescription ?? ''}
            color="info.main"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <MetricCard
            icon={<Target size={20} />}
            label={td?.avgDealVelocity ?? 'Avg Deal Velocity'}
            value={metrics ? `${metrics.avgDealVelocity.toFixed(0)} ${td?.days ?? 'days'}` : '—'}
            description={td?.avgDealVelocityDescription ?? ''}
            color="warning.main"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <MetricCard
            icon={<Trophy size={20} />}
            label={td?.winRate ?? 'Win Rate'}
            value={metrics ? `${metrics.winRate.toFixed(1)}%` : '—'}
            description={td?.winRateDescription ?? ''}
            color="success.main"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <MetricCard
            icon={<DollarSign size={20} />}
            label={td?.totalValue ?? 'Total Value'}
            value={metrics ? formatCurrency(metrics.totalValue) : '—'}
            description={td?.totalValueDescription ?? ''}
            color="primary.main"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <MetricCard
            icon={<BarChart3 size={20} />}
            label={td?.openDeals ?? 'Open Deals'}
            value={metrics ? String(metrics.openDeals) : '—'}
            description={td?.openDealsDescription ?? ''}
            color="secondary.main"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <MetricCard
            icon={<Scale size={20} />}
            label={td?.weightedValue ?? 'Weighted Value'}
            value={metrics ? formatCurrency(metrics.weightedValue) : '—'}
            description={td?.weightedValueDescription ?? ''}
            color="text.secondary"
          />
        </Grid>
      </Grid>

      {/* Chart Placeholders — will be populated in T-0803 */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 8 }}>
          <Paper variant="outlined" sx={{ p: 2, minHeight: 300 }}>
            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
              {td?.stageConversion ?? 'Stage Conversion Funnel'}
            </Typography>
            {!metrics || metrics.stageMetrics.length === 0 ? (
              <EmptyChartState message={td?.noData ?? 'No data available'} />
            ) : (
              <StageMetricsTable stageMetrics={metrics.stageMetrics} />
            )}
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper variant="outlined" sx={{ p: 2, minHeight: 300 }}>
            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
              {td?.dealsByStage ?? 'Deals by Stage'}
            </Typography>
            {!metrics || metrics.stageMetrics.length === 0 ? (
              <EmptyChartState message={td?.noData ?? 'No data available'} />
            ) : (
              <StageBreakdownList stageMetrics={metrics.stageMetrics} />
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

// ---- Sub-components ----

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  description: string;
  color: string;
}

function MetricCard({ icon, label, value, description, color }: MetricCardProps) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Box sx={{ color }}>{icon}</Box>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
      </Box>
      <Typography variant="h5" fontWeight={700}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.disabled">
        {description}
      </Typography>
    </Paper>
  );
}

function EmptyChartState({ message }: { message: string }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 200,
      }}
    >
      <Typography color="text.secondary">{message}</Typography>
    </Box>
  );
}

interface StageMetricsTableProps {
  stageMetrics: NonNullable<ReturnType<typeof usePipelineMetrics>['data']>['stageMetrics'];
}

function StageMetricsTable({ stageMetrics }: StageMetricsTableProps) {
  return (
    <Box>
      {stageMetrics.map((stage) => (
        <Box
          key={stage.stageId}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            py: 1,
            borderBottom: 1,
            borderColor: 'divider',
            '&:last-child': { borderBottom: 0 },
          }}
        >
          <Box
            sx={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              bgcolor: stage.stageColor ?? 'grey.400',
              flexShrink: 0,
            }}
          />
          <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
            {stage.stageName}
          </Typography>
          <Typography variant="body2" fontWeight={600} sx={{ minWidth: 40, textAlign: 'right' }}>
            {stage.dealCount}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ minWidth: 80, textAlign: 'right' }}>
            {formatCurrency(stage.totalValue)}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

function StageBreakdownList({ stageMetrics }: StageMetricsTableProps) {
  const maxDeals = Math.max(...stageMetrics.map((s) => s.dealCount), 1);

  return (
    <Box>
      {stageMetrics.map((stage) => (
        <Box key={stage.stageId} sx={{ mb: 1.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="caption">{stage.stageName}</Typography>
            <Typography variant="caption" fontWeight={600}>
              {stage.dealCount}
            </Typography>
          </Box>
          <Box
            sx={{
              height: 8,
              borderRadius: 1,
              bgcolor: 'action.hover',
              overflow: 'hidden',
            }}
          >
            <Box
              sx={{
                height: '100%',
                width: `${(stage.dealCount / maxDeals) * 100}%`,
                bgcolor: stage.stageColor ?? 'primary.main',
                borderRadius: 1,
                transition: 'width 0.3s ease',
              }}
            />
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `€${(value / 1_000).toFixed(1)}K`;
  return `€${value.toFixed(0)}`;
}
