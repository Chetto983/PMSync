import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  InputAdornment,
  Alert,
  Skeleton,
  IconButton,
  Tooltip,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  MenuItem,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import { Search, Plus, Trash2, List, Kanban } from 'lucide-react';
import { useRouter } from 'next/router';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useUserTimezone } from '@/hooks/use-user-timezone';
import { useLocale } from '@/lib/hooks/use-locale';
import { formatDateInTz } from '@/lib/utils/format-date-tz';
import { useDeals, useDeleteDeal } from '@/hooks/queries/use-crm-deals';
import { usePipelines } from '@/hooks/queries/use-crm-pipelines';
import { useGlobalToast } from '@/lib/context/toast-context';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { CreateDealDialog } from './CreateDealDialog';
import { KanbanBoard } from './KanbanBoard';
import type { CrmDeal, ListDealsQuery } from '@/lib/api/crm-deals';
import type { CrmPipeline } from '@/lib/api/crm-pipelines';

type ViewMode = 'list' | 'kanban';

function formatAmount(amount: string | null, currency: string): string {
  if (!amount) return '—';
  const num = parseFloat(amount);
  if (isNaN(num)) return '—';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num);
}

export function DealsList() {
  const t = useTranslations();
  const td = t.crmDeals;
  const tc = t.common;
  const toast = useGlobalToast();
  const router = useRouter();
  const timezone = useUserTimezone();
  const { locale } = useLocale();

  const formatDate = useCallback((dateStr: string | null): string => {
    if (!dateStr) return '—';
    return formatDateInTz(dateStr, timezone, locale);
  }, [timezone, locale]);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [createOpen, setCreateOpen] = useState(false);
  const [filterPipeline, setFilterPipeline] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // Debounce search to avoid API call on every keystroke
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  const filters: ListDealsQuery = {
    search: debouncedSearch || undefined,
    pipelineId: filterPipeline || undefined,
    limit: rowsPerPage,
    offset: page * rowsPerPage,
  };

  const { data, isLoading, isError, error } = useDeals(filters);
  const { data: pipelines } = usePipelines();
  const deleteDeal = useDeleteDeal();

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteDeal.mutateAsync(deleteTarget);
      toast.success(td?.deleted ?? 'Deal deleted');
    } catch {
      toast.error(td?.deleteError ?? 'Failed to delete deal');
    }
    setDeleteTarget(null);
  }, [deleteTarget, deleteDeal, toast, td]);

  // Loading state
  if (isLoading) {
    return (
      <Box sx={{ p: 3 }}>
        <Skeleton width="30%" height={32} animation="wave" sx={{ mb: 2 }} />
        <Skeleton width="100%" height={48} animation="wave" sx={{ mb: 1 }} />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} width="100%" height={40} animation="wave" sx={{ mb: 0.5 }} />
        ))}
      </Box>
    );
  }

  // Error state
  if (isError) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{(error as Error)?.message ?? 'Error loading deals'}</Alert>
      </Box>
    );
  }

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <Box sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box>
          <Typography variant="h5" fontWeight={600}>
            {td?.title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {td?.description}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(_, v) => v && setViewMode(v as ViewMode)}
            size="small"
            aria-label="View mode"
          >
            <ToggleButton value="list" aria-label={td?.kanban?.viewList ?? 'List'}>
              <Tooltip title={td?.kanban?.viewList ?? 'List'}>
                <Box sx={{ display: 'flex' }}><List size={18} /></Box>
              </Tooltip>
            </ToggleButton>
            <ToggleButton value="kanban" aria-label={td?.kanban?.viewKanban ?? 'Kanban'}>
              <Tooltip title={td?.kanban?.viewKanban ?? 'Kanban'}>
                <Box sx={{ display: 'flex' }}><Kanban size={18} /></Box>
              </Tooltip>
            </ToggleButton>
          </ToggleButtonGroup>
          <Button
            variant="contained"
            startIcon={<Plus size={18} />}
            onClick={() => setCreateOpen(true)}
          >
            {td?.newDeal}
          </Button>
        </Box>
      </Box>

      {/* Search + Filters */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <TextField
          placeholder={td?.searchPlaceholder}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          size="small"
          sx={{ minWidth: 240, flex: '1 1 240px', maxWidth: 360 }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={18} />
                </InputAdornment>
              ),
            },
          }}
        />
        <TextField
          label={td?.filters?.pipeline}
          value={filterPipeline}
          onChange={(e) => {
            setFilterPipeline(e.target.value);
            setPage(0);
          }}
          size="small"
          select
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="">{td?.filters?.all ?? 'All'}</MenuItem>
          {(pipelines ?? []).map((p: CrmPipeline) => (
            <MenuItem key={p.id} value={p.id}>
              {p.name}
            </MenuItem>
          ))}
        </TextField>
      </Box>

      {/* Kanban View */}
      {viewMode === 'kanban' ? (
        filterPipeline ? (
          <KanbanBoard pipelineId={filterPipeline} />
        ) : (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              {td?.kanban?.noPipeline ?? 'No pipeline selected'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {td?.kanban?.noPipelineDescription ?? 'Select a pipeline to view the Kanban board.'}
            </Typography>
          </Box>
        )
      ) : (
      <>
      {/* Empty state */}
      {rows.length === 0 && !search && !filterPipeline ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            {td?.noDealsFound}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {td?.noDealsDescription}
          </Typography>
          <Button
            variant="contained"
            startIcon={<Plus size={18} />}
            onClick={() => setCreateOpen(true)}
          >
            {td?.newDeal}
          </Button>
        </Box>
      ) : (
        <>
          <TableContainer sx={{ flex: 1 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{td?.columns?.name ?? 'Name'}</TableCell>
                  <TableCell align="right">{td?.columns?.amount ?? 'Amount'}</TableCell>
                  <TableCell>{td?.columns?.stage ?? 'Stage'}</TableCell>
                  <TableCell>{td?.columns?.pipeline ?? 'Pipeline'}</TableCell>
                  <TableCell>{td?.columns?.account ?? 'Account'}</TableCell>
                  <TableCell>{td?.columns?.expectedClose ?? 'Expected Close'}</TableCell>
                  <TableCell>{td?.columns?.priority ?? 'Priority'}</TableCell>
                  <TableCell width={50} />
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((deal: CrmDeal) => (
                  <TableRow
                    key={deal.id}
                    hover
                    onClick={() => router.push(`/dashboard/crm/deals/${deal.id}`)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell>
                      <Typography variant="body2" fontWeight={500} color="primary">
                        {deal.name}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2">
                        {formatAmount(deal.amount, deal.currency)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {deal.stage ? (
                        <Chip
                          label={deal.stage.name}
                          size="small"
                          variant="outlined"
                          sx={{
                            borderColor: deal.stage.color ?? undefined,
                            color: deal.stage.color ?? undefined,
                          }}
                        />
                      ) : (
                        <Typography variant="body2" color="text.disabled">—</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {deal.pipeline?.name ?? '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {deal.account?.name ?? '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {formatDate(deal.expectedCloseDate)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {deal.priority ? (
                        <Chip
                          label={td?.priorities?.[deal.priority as keyof NonNullable<typeof td.priorities>] ?? deal.priority}
                          size="small"
                          variant="outlined"
                        />
                      ) : (
                        <Typography variant="body2" color="text.disabled">—</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Tooltip title={td?.deleteDeal ?? 'Delete'}>
                        <IconButton
                          size="small"
                          aria-label={td?.deleteDeal ?? 'Delete deal'}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(deal.id);
                          }}
                          sx={{ minWidth: 44, minHeight: 44 }}
                        >
                          <Trash2 size={16} />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (search || filterPipeline) && (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">{td?.noDealsFound}</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
            rowsPerPageOptions={[10, 25, 50]}
            labelRowsPerPage={tc?.rowsPerPage ?? 'Rows per page:'}
            labelDisplayedRows={({ from, to, count }) =>
              (tc?.displayedRows ?? '{from}-{to} of {count}')
                .replace('{from}', String(from))
                .replace('{to}', String(to))
                .replace('{count}', count !== -1 ? String(count) : `more than ${to}`)
            }
          />
        </>
      )}
      </>
      )}

      <CreateDealDialog open={createOpen} onClose={() => setCreateOpen(false)} />

      <ConfirmDialog
        open={!!deleteTarget}
        title={td?.deleteDeal ?? 'Delete Deal'}
        message={td?.deleteConfirm ?? 'Are you sure?'}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
        confirmDisabled={deleteDeal.isPending}
      />
    </Box>
  );
}
