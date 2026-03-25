import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Box,
  Typography,
  Skeleton,
  Alert,
} from '@mui/material';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
  closestCenter,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/router';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useDeals, useChangeDealStage } from '@/hooks/queries/use-crm-deals';
import { usePipeline } from '@/hooks/queries/use-crm-pipelines';
import { crmDealsKeys } from '@/hooks/queries/crm-deals-keys';
import { useGlobalToast } from '@/lib/context/toast-context';
import { websocketClient } from '@/lib/websocket-client';
import { DealCard } from './DealCard';
import type { CrmDeal, CrmDealListResponse } from '@/lib/api/crm-deals';
import type { CrmStage } from '@/lib/api/crm-pipelines';

// ---- Helpers ----

function formatCurrency(value: number, currency: string = 'EUR'): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function computeStageSummary(deals: CrmDeal[], stage: CrmStage) {
  let totalValue = 0;
  let count = 0;
  for (const deal of deals) {
    if (deal.stageId === stage.id) {
      count++;
      if (deal.amount) {
        const amt = parseFloat(deal.amount);
        if (!isNaN(amt)) totalValue += amt;
      }
    }
  }
  const weightedValue = totalValue * (stage.probability / 100);
  return { count, totalValue, weightedValue };
}

// ---- Stage Column ----

interface StageColumnProps {
  stage: CrmStage;
  deals: CrmDeal[];
  isOverCurrent: boolean;
  onDealClick: (dealId: string) => void;
  tk: Record<string, string | undefined>;
}

function StageColumn({ stage, deals, isOverCurrent, onDealClick, tk }: StageColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const highlighted = isOver || isOverCurrent;

  const summary = useMemo(() => computeStageSummary(deals, stage), [deals, stage]);
  const stageDeals = useMemo(
    () => deals.filter((d) => d.stageId === stage.id),
    [deals, stage.id],
  );

  return (
    <Box
      ref={setNodeRef}
      sx={{
        minWidth: 280,
        maxWidth: 320,
        flex: '0 0 280px',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: highlighted ? 'action.hover' : 'background.default',
        borderRadius: 2,
        border: 1,
        borderColor: highlighted ? 'primary.main' : 'divider',
        transition: 'border-color 0.2s, background-color 0.2s',
        overflow: 'hidden',
      }}
    >
      {/* Stage Header */}
      <Box
        sx={{
          p: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: stage.color ? `${stage.color}14` : 'transparent',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          {stage.color && (
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor: stage.color,
                flexShrink: 0,
              }}
            />
          )}
          <Typography variant="subtitle2" fontWeight={600} noWrap>
            {stage.name}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
            {summary.count}
          </Typography>
        </Box>
        {/* Value summary */}
        {summary.totalValue > 0 && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="caption" color="text.secondary">
              {tk?.totalValue?.replace('{value}', formatCurrency(summary.totalValue)) ??
                `Total: ${formatCurrency(summary.totalValue)}`}
            </Typography>
            <Typography variant="caption" color="text.disabled">
              {tk?.weightedValue?.replace(
                '{value}',
                formatCurrency(summary.weightedValue),
              ) ?? `Weighted: ${formatCurrency(summary.weightedValue)}`}
            </Typography>
          </Box>
        )}
      </Box>

      {/* Deal Cards */}
      <Box
        sx={{
          p: 1,
          flex: 1,
          minHeight: 100,
          overflowY: 'auto',
          maxHeight: 'calc(100vh - 300px)',
        }}
      >
        {stageDeals.length === 0 ? (
          <Typography
            variant="caption"
            color="text.disabled"
            sx={{ display: 'block', textAlign: 'center', mt: 4 }}
          >
            {tk?.noDeals ?? 'No deals in this stage'}
          </Typography>
        ) : (
          stageDeals.map((deal) => (
            <DealCard key={deal.id} deal={deal} onClick={onDealClick} />
          ))
        )}
      </Box>
    </Box>
  );
}

// ---- Kanban Board ----

interface KanbanBoardProps {
  pipelineId: string;
}

export function KanbanBoard({ pipelineId }: KanbanBoardProps) {
  const t = useTranslations();
  const tk = (t.crmDeals?.kanban ?? {}) as Record<string, string | undefined>;
  const toast = useGlobalToast();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: pipeline, isLoading: pipelineLoading } = usePipeline(pipelineId);
  const { data: dealsResponse, isLoading: dealsLoading } = useDeals({
    pipelineId,
    limit: 500,
  });
  const changeStageMutation = useChangeDealStage();

  const deals = dealsResponse?.data ?? [];
  const stages = useMemo(
    () => [...(pipeline?.stages ?? [])].sort((a, b) => a.position - b.position),
    [pipeline?.stages],
  );

  // Socket.IO: refresh Kanban when another user moves a deal
  useEffect(() => {
    const unsubscribe = websocketClient.onCrmDealStageChanged((event) => {
      if (event.pipelineId === pipelineId) {
        queryClient.invalidateQueries({ queryKey: crmDealsKeys.all });
      }
    });
    return unsubscribe;
  }, [pipelineId, queryClient]);

  const [activeDeal, setActiveDeal] = useState<CrmDeal | null>(null);
  const [overStageId, setOverStageId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const deal = event.active.data.current?.deal as CrmDeal | undefined;
      if (deal) setActiveDeal(deal);
    },
    [],
  );

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const overId = event.over?.id as string | undefined;
    setOverStageId(overId ?? null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDeal(null);
      setOverStageId(null);

      const { active, over } = event;
      if (!over) return;

      const dealId = active.id as string;
      const newStageId = over.id as string;
      const deal = active.data.current?.deal as CrmDeal | undefined;
      if (!deal || deal.stageId === newStageId) return;

      // Find new stage name for toast
      const newStage = stages.find((s) => s.id === newStageId);

      // Optimistic update
      const queryKey = crmDealsKeys.list({ pipelineId, limit: 500 } as Record<string, unknown>);
      const previousData = queryClient.getQueryData<CrmDealListResponse>(queryKey);

      queryClient.setQueryData<CrmDealListResponse>(queryKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((d) =>
            d.id === dealId
              ? {
                  ...d,
                  stageId: newStageId,
                  stage: newStage
                    ? {
                        id: newStage.id,
                        name: newStage.name,
                        color: newStage.color,
                        probability: newStage.probability,
                      }
                    : d.stage,
                }
              : d,
          ),
        };
      });

      changeStageMutation.mutate(
        { dealId, stageId: newStageId },
        {
          onSuccess: () => {
            const msg =
              tk?.stageMovedSuccess?.replace('{stage}', newStage?.name ?? '') ??
              `Deal moved to ${newStage?.name ?? 'stage'}`;
            toast.success(msg);
          },
          onError: () => {
            // Rollback
            if (previousData) {
              queryClient.setQueryData(queryKey, previousData);
            }
            toast.error(tk?.stageMoveError ?? 'Failed to move deal');
          },
        },
      );
    },
    [stages, pipelineId, queryClient, changeStageMutation, toast, tk],
  );

  const handleDealClick = useCallback(
    (dealId: string) => {
      void router.push(`/dashboard/crm/deals/${dealId}`);
    },
    [router],
  );

  // Loading state
  if (pipelineLoading || dealsLoading) {
    return (
      <Box sx={{ display: 'flex', gap: 2, overflow: 'hidden', p: 1 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Box key={i} sx={{ minWidth: 280, flex: '0 0 280px' }}>
            <Skeleton variant="rounded" height={60} sx={{ mb: 1 }} />
            {Array.from({ length: 3 }).map((_, j) => (
              <Skeleton key={j} variant="rounded" height={80} sx={{ mb: 1 }} />
            ))}
          </Box>
        ))}
      </Box>
    );
  }

  // No stages
  if (stages.length === 0) {
    return (
      <Alert severity="info" sx={{ m: 2 }}>
        {tk?.noPipelineDeals ?? 'No stages configured for this pipeline.'}
      </Alert>
    );
  }

  // Empty pipeline
  if (deals.length === 0) {
    // Still show columns even if empty
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <Box
        sx={{
          display: 'flex',
          gap: 2,
          overflowX: 'auto',
          p: 1,
          pb: 2,
          minHeight: 400,
          // Mobile horizontal scroll
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'thin',
          '&::-webkit-scrollbar': { height: 6 },
          '&::-webkit-scrollbar-thumb': {
            bgcolor: 'action.disabled',
            borderRadius: 3,
          },
        }}
      >
        {stages.map((stage) => (
          <StageColumn
            key={stage.id}
            stage={stage}
            deals={deals}
            isOverCurrent={overStageId === stage.id}
            onDealClick={handleDealClick}
            tk={tk}
          />
        ))}
      </Box>

      {/* Drag overlay */}
      <DragOverlay dropAnimation={null}>
        {activeDeal ? (
          <Box
            sx={{
              p: 1.5,
              bgcolor: 'background.paper',
              borderRadius: 1,
              border: 1,
              borderColor: 'primary.main',
              boxShadow: 3,
              minWidth: 240,
              maxWidth: 300,
              opacity: 0.9,
            }}
          >
            <Typography variant="body2" fontWeight={600} noWrap>
              {activeDeal.name}
            </Typography>
            {activeDeal.amount && (
              <Typography variant="caption" color="text.secondary">
                {formatCurrency(
                  parseFloat(activeDeal.amount),
                  activeDeal.currency,
                )}
              </Typography>
            )}
          </Box>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
