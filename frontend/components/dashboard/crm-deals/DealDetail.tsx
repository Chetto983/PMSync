import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import {
  Box,
  Typography,
  Breadcrumbs,
  Link as MuiLink,
  Tab,
  Tabs,
  Paper,
  Skeleton,
  Alert,
  Button,
  IconButton,
  TextField,
  Tooltip,
  Grid,
  MenuItem,
  Divider,
  Chip,
} from '@mui/material';
import {
  ArrowLeft,
  Handshake,
  Pencil,
  Check,
  X,
} from 'lucide-react';
import NextLink from 'next/link';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useDeal, useUpdateDeal } from '@/hooks/queries/use-crm-deals';
import { usePipelines } from '@/hooks/queries/use-crm-pipelines';
import { useAccounts } from '@/hooks/queries/use-crm-accounts';
import { useGlobalToast } from '@/lib/context/toast-context';
import type { CrmDeal, UpdateDealDto } from '@/lib/api/crm-deals';
import type { CrmPipeline } from '@/lib/api/crm-pipelines';

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
const SOURCES = ['WEBSITE', 'REFERRAL', 'COLD_CALL', 'EMAIL', 'SOCIAL_MEDIA', 'TRADE_SHOW', 'OTHER'] as const;

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  if (value !== index) return null;
  return <Box sx={{ py: 2 }}>{children}</Box>;
}

// ---- Inline Edit Field ----

function InlineEditField({
  value,
  label,
  placeholder,
  multiline,
  onSave,
}: {
  value: string | null | undefined;
  label: string;
  placeholder: string;
  multiline?: boolean;
  onSave: (val: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');

  const handleSave = () => {
    onSave(draft);
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(value ?? '');
    setEditing(false);
  };

  if (editing) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
        <TextField
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          size="small"
          fullWidth
          multiline={multiline}
          rows={multiline ? 3 : undefined}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !multiline) handleSave();
            if (e.key === 'Escape') handleCancel();
          }}
        />
        <IconButton size="small" onClick={handleSave} color="primary" aria-label="Save">
          <Check size={16} />
        </IconButton>
        <IconButton size="small" onClick={handleCancel} aria-label="Cancel">
          <X size={16} />
        </IconButton>
      </Box>
    );
  }

  return (
    <Tooltip title={label}>
      <Box
        onClick={() => { setDraft(value ?? ''); setEditing(true); }}
        sx={{
          cursor: 'pointer',
          '&:hover': { bgcolor: 'action.hover' },
          borderRadius: 1,
          px: 1,
          py: 0.5,
          minHeight: 32,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <Typography
          variant="body2"
          color={value ? 'text.primary' : 'text.disabled'}
          sx={{ flex: 1 }}
        >
          {value || placeholder}
        </Typography>
        <Pencil size={14} style={{ opacity: 0.4 }} />
      </Box>
    </Tooltip>
  );
}

// ---- Info Card ----

function DealInfoCard({
  deal,
  onSave,
}: {
  deal: CrmDeal;
  onSave: (dto: UpdateDealDto) => void;
}) {
  const t = useTranslations();
  const td = t.crmDeals;

  const { data: pipelines } = usePipelines();
  const { data: accountsData } = useAccounts({ limit: 100 });
  const accounts = accountsData?.data ?? [];

  const selectedPipeline = pipelines?.find(
    (p: CrmPipeline) => p.id === deal.pipelineId,
  );
  const stages = selectedPipeline?.stages ?? [];

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Grid container spacing={2}>
        {/* Notes */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
            {td?.form?.notes}
          </Typography>
          <InlineEditField
            value={deal.notes}
            label={td?.detail?.info?.editField ?? 'Click to edit'}
            placeholder={td?.detail?.info?.noNotes ?? 'No notes'}
            multiline
            onSave={(val) => onSave({ notes: val || null })}
          />
        </Grid>

        {/* Amount + Close Date */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <TextField
              label={td?.form?.amount}
              type="number"
              value={deal.amount ?? ''}
              onChange={(e) =>
                onSave({ amount: e.target.value ? Number(e.target.value) : null })
              }
              fullWidth
              size="small"
              slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
            />
            <TextField
              label={td?.form?.expectedCloseDate}
              type="date"
              value={deal.expectedCloseDate ? deal.expectedCloseDate.slice(0, 10) : ''}
              onChange={(e) =>
                onSave({ expectedCloseDate: e.target.value || null })
              }
              fullWidth
              size="small"
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Box>
        </Grid>

        <Grid size={12}>
          <Divider sx={{ my: 0.5 }} />
        </Grid>

        {/* Pipeline / Stage / Account */}
        <Grid size={{ xs: 12, sm: 4 }}>
          <TextField
            label={td?.form?.pipeline}
            value={deal.pipelineId}
            onChange={(e) => {
              const newPipeline = pipelines?.find((p: CrmPipeline) => p.id === e.target.value);
              const firstStage = newPipeline?.stages?.[0];
              if (firstStage) {
                onSave({ pipelineId: e.target.value, stageId: firstStage.id });
              }
            }}
            fullWidth
            size="small"
            select
          >
            {(pipelines ?? []).map((p: CrmPipeline) => (
              <MenuItem key={p.id} value={p.id}>
                {p.name}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <TextField
            label={td?.form?.stage}
            value={deal.stageId}
            onChange={(e) => onSave({ stageId: e.target.value })}
            fullWidth
            size="small"
            select
          >
            {stages.map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {s.name}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <TextField
            label={td?.form?.account}
            value={deal.accountId ?? ''}
            onChange={(e) => onSave({ accountId: e.target.value || null })}
            fullWidth
            size="small"
            select
          >
            <MenuItem value="">—</MenuItem>
            {accounts.map((a) => (
              <MenuItem key={a.id} value={a.id}>
                {a.name}
              </MenuItem>
            ))}
          </TextField>
        </Grid>

        {/* Priority / Source */}
        <Grid size={{ xs: 12, sm: 4 }}>
          <TextField
            label={td?.form?.priority}
            value={deal.priority ?? ''}
            onChange={(e) => onSave({ priority: e.target.value || null })}
            fullWidth
            size="small"
            select
          >
            <MenuItem value="">—</MenuItem>
            {PRIORITIES.map((p) => (
              <MenuItem key={p} value={p}>
                {td?.priorities?.[p] ?? p}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <TextField
            label={td?.form?.source}
            value={deal.source ?? ''}
            onChange={(e) => onSave({ source: e.target.value || null })}
            fullWidth
            size="small"
            select
          >
            <MenuItem value="">—</MenuItem>
            {SOURCES.map((s) => (
              <MenuItem key={s} value={s}>
                {td?.sources?.[s] ?? s}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
      </Grid>
    </Paper>
  );
}

// ---- Main Component ----

export function DealDetail() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : '';
  const t = useTranslations();
  const td = t.crmDeals;
  const toast = useGlobalToast();
  const [tab, setTab] = useState(0);

  const { data: deal, isLoading, error } = useDeal(id);
  const updateDeal = useUpdateDeal();

  const handleSave = useCallback(
    async (dto: UpdateDealDto) => {
      if (!id) return;
      try {
        await updateDeal.mutateAsync({ id, dto });
        toast.success(td?.updated ?? 'Updated');
      } catch {
        toast.error(td?.updateError ?? 'Failed to update');
      }
    },
    [id, updateDeal, toast, td],
  );

  if (!router.isReady || isLoading) {
    return (
      <Box sx={{ p: 3 }}>
        <Skeleton width="40%" height={24} sx={{ mb: 1 }} />
        <Skeleton width="60%" height={36} sx={{ mb: 2 }} />
        <Skeleton width="100%" height={48} sx={{ mb: 2 }} />
        <Skeleton width="100%" height={200} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {(error as { status?: number })?.status === 404
            ? 'Deal not found'
            : t.common.genericError}
        </Alert>
        <Button
          startIcon={<ArrowLeft size={16} />}
          onClick={() => router.push('/dashboard/crm/deals')}
        >
          {td?.breadcrumb?.deals ?? 'Deals'}
        </Button>
      </Box>
    );
  }

  if (!deal) return null;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200 }}>
      {/* Breadcrumb */}
      <Breadcrumbs sx={{ mb: 1 }}>
        <MuiLink
          component={NextLink}
          href="/dashboard"
          underline="hover"
          color="text.secondary"
          variant="body2"
        >
          {td?.breadcrumb?.dashboard ?? 'Dashboard'}
        </MuiLink>
        <Typography variant="body2" color="text.secondary">
          {td?.breadcrumb?.crm ?? 'CRM'}
        </Typography>
        <MuiLink
          component={NextLink}
          href="/dashboard/crm/deals"
          underline="hover"
          color="text.secondary"
          variant="body2"
        >
          {td?.breadcrumb?.deals ?? 'Deals'}
        </MuiLink>
        <Typography variant="body2" color="text.primary">
          {deal.name}
        </Typography>
      </Breadcrumbs>

      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <IconButton
          onClick={() => router.push('/dashboard/crm/deals')}
          size="small"
          aria-label="Back to deals"
        >
          <ArrowLeft size={20} />
        </IconButton>
        <Handshake size={28} />
        <Box sx={{ flex: 1 }}>
          <InlineEditField
            value={deal.name}
            label={td?.form?.name ?? 'Deal Name'}
            placeholder="Deal name"
            onSave={(val) => handleSave({ name: val })}
          />
        </Box>
        {deal.stage && (
          <Chip
            label={deal.stage.name}
            variant="outlined"
            sx={{
              borderColor: deal.stage.color ?? undefined,
              color: deal.stage.color ?? undefined,
            }}
          />
        )}
        {deal.amount && (
          <Typography variant="h6" fontWeight={600}>
            {new Intl.NumberFormat(undefined, {
              style: 'currency',
              currency: deal.currency,
              minimumFractionDigits: 0,
            }).format(parseFloat(deal.amount))}
          </Typography>
        )}
      </Box>

      {/* Tabs */}
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ borderBottom: 1, borderColor: 'divider', mb: 0 }}
      >
        <Tab label={td?.detail?.tabs?.info ?? 'Info'} />
        <Tab label={td?.detail?.tabs?.contacts ?? 'Contacts'} />
        <Tab label={td?.detail?.tabs?.products ?? 'Products'} />
        <Tab label={td?.detail?.tabs?.activity ?? 'Activity'} />
      </Tabs>

      {/* Tab Panels */}
      <TabPanel value={tab} index={0}>
        <DealInfoCard deal={deal} onSave={handleSave} />
      </TabPanel>

      <TabPanel value={tab} index={1}>
        <Box sx={{ py: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">
            {td?.detail?.placeholder?.products ?? 'Coming in Sprint 05'}
          </Typography>
        </Box>
      </TabPanel>

      <TabPanel value={tab} index={2}>
        <Box sx={{ py: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">
            {td?.detail?.placeholder?.products ?? 'Coming in Sprint 06'}
          </Typography>
        </Box>
      </TabPanel>

      <TabPanel value={tab} index={3}>
        <Box sx={{ py: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">
            {td?.detail?.placeholder?.activity ?? 'Coming in Sprint 07'}
          </Typography>
        </Box>
      </TabPanel>
    </Box>
  );
}
