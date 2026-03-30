'use client';

import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Skeleton,
  Alert,
  Tabs,
  Tab,
  Grid,
} from '@mui/material';
import {
  ShieldCheck,
  Activity,
  DollarSign,
  TrendingDown,
  Cpu,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useGovernanceOverview } from '@/hooks/queries/use-crm-governance';
import { AccuracyTab } from './AccuracyTab';
import { CostsTab } from './CostsTab';
import { DriftTab } from './DriftTab';
import { ModelsTab } from './ModelsTab';

interface KPICardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  loading: boolean;
}

function KPICard({ icon, label, value, loading }: KPICardProps) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
      }}
    >
      <Box
        sx={{
          p: 1,
          borderRadius: 1,
          bgcolor: 'action.hover',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" noWrap>
          {label}
        </Typography>
        {loading ? (
          <Skeleton width="60%" height={28} />
        ) : (
          <Typography variant="h6" fontWeight={700} noWrap>
            {value}
          </Typography>
        )}
      </Box>
    </Paper>
  );
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  if (value !== index) return null;
  return <Box sx={{ py: 2 }}>{children}</Box>;
}

export function GovernanceDashboard() {
  const t = useTranslations();
  const tg = t.aiGovernance;
  const [tab, setTab] = useState(0);

  const { data: overview, isLoading, error } = useGovernanceOverview();

  const formatCost = (val: number) =>
    `$${val.toFixed(2)}`;

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', p: { xs: 2, md: 3 } }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
        <ShieldCheck size={28} />
        <Typography variant="h5" fontWeight={700}>
          {tg?.title ?? 'AI Governance'}
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {tg?.subtitle ?? 'Monitor model accuracy, costs, and data drift'}
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {tg?.loadError ?? 'Failed to load governance data'}
        </Alert>
      )}

      {/* KPI Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPICard
            icon={<Activity size={20} />}
            label={tg?.kpi?.totalPredictions ?? 'Total Predictions'}
            value={overview?.totalPredictions ?? 0}
            loading={isLoading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPICard
            icon={<TrendingDown size={20} />}
            label={tg?.kpi?.averageAccuracy ?? 'Average Accuracy'}
            value={overview ? `${overview.averageAccuracy}%` : '—'}
            loading={isLoading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPICard
            icon={<DollarSign size={20} />}
            label={tg?.kpi?.monthlyCost ?? 'Monthly Cost'}
            value={overview ? formatCost(overview.monthlyCost) : '—'}
            loading={isLoading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPICard
            icon={<Cpu size={20} />}
            label={tg?.kpi?.activeModels ?? 'Active Models'}
            value={overview?.activeModels ?? 0}
            loading={isLoading}
          />
        </Grid>
      </Grid>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab label={tg?.tabs?.accuracy ?? 'Accuracy'} />
          <Tab label={tg?.tabs?.costs ?? 'Costs'} />
          <Tab label={tg?.tabs?.drift ?? 'Drift'} />
          <Tab label={tg?.tabs?.models ?? 'Models'} />
        </Tabs>
      </Box>

      {/* Tab Panels — placeholder content for T-1401, filled in subsequent tasks */}
      <TabPanel value={tab} index={0}>
        <AccuracyTab />
      </TabPanel>
      <TabPanel value={tab} index={1}>
        <CostsTab />
      </TabPanel>
      <TabPanel value={tab} index={2}>
        <DriftTab />
      </TabPanel>
      <TabPanel value={tab} index={3}>
        <ModelsTab />
      </TabPanel>
    </Box>
  );
}
