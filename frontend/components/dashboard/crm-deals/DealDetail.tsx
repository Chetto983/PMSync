import React, { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import {
  Box,
  Typography,
  Breadcrumbs,
  Link as MuiLink,
  Tab,
  Tabs,
  Skeleton,
  Alert,
  Button,
  IconButton,
  Tooltip,
  Chip,
} from '@mui/material';
import {
  ArrowLeft,
  Handshake,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import NextLink from 'next/link';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useDeal, useUpdateDeal, useDeleteDeal, useChangeDealStage } from '@/hooks/queries/use-crm-deals';
import { usePipelines } from '@/hooks/queries/use-crm-pipelines';
import { useGlobalToast } from '@/lib/context/toast-context';
import type { UpdateDealDto } from '@/lib/api/crm-deals';
import type { CrmPipeline } from '@/lib/api/crm-pipelines';
import {
  InlineEditField,
  PipelineProgressBar,
  DeleteDealDialog,
  DealInfoCard,
} from './DealDetailParts';
import { DealTimeline } from './DealTimeline';
import { DealNotes } from './DealNotes';
import { DealContactsTab } from './DealContactsTab';
import { DealProductsTab } from './DealProductsTab';
import { DealScoreBadge } from './DealScoreBadge';
import { NBASection } from '../crm-nba/NBASection';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  if (value !== index) return null;
  return <Box sx={{ py: 2 }}>{children}</Box>;
}

// ---- Main Component ----

export function DealDetail() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : '';
  const t = useTranslations();
  const td = t.crmDeals;
  const toast = useGlobalToast();
  const [tab, setTab] = useState(0);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const { data: deal, isLoading, error } = useDeal(id);
  const { data: pipelines } = usePipelines();
  const updateDeal = useUpdateDeal();
  const deleteDeal = useDeleteDeal();
  const changeDealStage = useChangeDealStage();

  const selectedPipeline = pipelines?.find(
    (p: CrmPipeline) => p.id === deal?.pipelineId,
  );
  const stages = useMemo(
    () => selectedPipeline?.stages ?? [],
    [selectedPipeline],
  );
  const currentStageIndex = stages.findIndex((s) => s.id === deal?.stageId);

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

  const handleDelete = useCallback(async () => {
    if (!id) return;
    try {
      await deleteDeal.mutateAsync(id);
      toast.success(td?.deleted ?? 'Deleted');
      router.push('/dashboard/crm/deals');
    } catch {
      toast.error(td?.deleteError ?? 'Failed to delete');
    } finally {
      setDeleteDialogOpen(false);
    }
  }, [id, deleteDeal, toast, td, router]);

  const handleChangeStage = useCallback(
    async (direction: 'prev' | 'next') => {
      if (!id || !deal) return;
      const targetIndex = direction === 'prev' ? currentStageIndex - 1 : currentStageIndex + 1;
      const targetStage = stages[targetIndex];
      if (!targetStage) return;
      try {
        await changeDealStage.mutateAsync({ dealId: id, stageId: targetStage.id });
        toast.success(
          (td?.kanban?.stageMovedSuccess ?? 'Deal moved to {stage}').replace(
            '{stage}',
            targetStage.name,
          ),
        );
      } catch {
        toast.error(td?.kanban?.stageMoveError ?? 'Failed to move deal');
      }
    },
    [id, deal, currentStageIndex, stages, changeDealStage, toast, td],
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
      <Box sx={{ display: 'flex', alignItems: { xs: 'flex-start', md: 'center' }, flexDirection: { xs: 'column', md: 'row' }, gap: { xs: 1, md: 2 }, mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: { xs: '100%', md: 'auto' } }}>
          <IconButton
            onClick={() => router.push('/dashboard/crm/deals')}
            size="small"
            aria-label="Back to deals"
            sx={{ minWidth: 44, minHeight: 44 }}
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
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: { xs: 0, md: 'auto' } }}>
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
          <DealScoreBadge score={deal.score} size="medium" />
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
      </Box>

      {/* Action Buttons */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, ml: { xs: 0, md: 7 } }}>
        <Tooltip title={td?.detail?.actions?.prevStage ?? 'Previous Stage'}>
          <span>
            <IconButton
              size="small"
              onClick={() => handleChangeStage('prev')}
              disabled={currentStageIndex <= 0 || changeDealStage.isPending}
              aria-label="Previous stage"
              sx={{ minWidth: 44, minHeight: 44 }}
            >
              <ChevronLeft size={18} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={td?.detail?.actions?.nextStage ?? 'Next Stage'}>
          <span>
            <IconButton
              size="small"
              onClick={() => handleChangeStage('next')}
              disabled={currentStageIndex >= stages.length - 1 || changeDealStage.isPending}
              aria-label="Next stage"
              sx={{ minWidth: 44, minHeight: 44 }}
            >
              <ChevronRight size={18} />
            </IconButton>
          </span>
        </Tooltip>
        <Box sx={{ flex: 1 }} />
        <Button
          size="small"
          color="error"
          startIcon={<Trash2 size={16} />}
          onClick={() => setDeleteDialogOpen(true)}
        >
          {td?.detail?.actions?.delete ?? 'Delete'}
        </Button>
      </Box>

      {/* Pipeline Progress Bar */}
      {stages.length > 0 && (
        <PipelineProgressBar
          stages={stages}
          currentStageId={deal.stageId}
          translations={td?.detail?.progressBar}
        />
      )}

      {/* NBA Recommendations */}
      <NBASection dealId={id} />

      {/* Tabs */}
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ borderBottom: 1, borderColor: 'divider', mb: 0 }}
      >
        <Tab label={td?.detail?.tabs?.info ?? 'Info'} />
        <Tab label={td?.detail?.tabs?.contacts ?? 'Contacts'} />
        <Tab label={td?.detail?.notes?.title ?? 'Notes'} />
        <Tab label={td?.detail?.tabs?.products ?? 'Products'} />
        <Tab label={td?.detail?.tabs?.activity ?? 'Activity'} />
      </Tabs>

      {/* Tab Panels */}
      <TabPanel value={tab} index={0}>
        <DealInfoCard deal={deal} onSave={handleSave} />
      </TabPanel>

      <TabPanel value={tab} index={1}>
        <DealContactsTab dealId={id} />
      </TabPanel>

      <TabPanel value={tab} index={2}>
        <DealNotes dealId={id} />
      </TabPanel>

      <TabPanel value={tab} index={3}>
        <DealProductsTab dealId={id} />
      </TabPanel>

      <TabPanel value={tab} index={4}>
        <DealTimeline dealId={id} />
      </TabPanel>

      {/* Delete Confirmation Dialog */}
      <DeleteDealDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDelete}
        loading={deleteDeal.isPending}
        translations={td?.detail?.deleteDialog}
      />
    </Box>
  );
}
