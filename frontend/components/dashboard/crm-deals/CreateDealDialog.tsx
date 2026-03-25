import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Grid,
} from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useCreateDeal } from '@/hooks/queries/use-crm-deals';
import { usePipelines } from '@/hooks/queries/use-crm-pipelines';
import { useAccounts } from '@/hooks/queries/use-crm-accounts';
import { useGlobalToast } from '@/lib/context/toast-context';
import type { CreateDealDto } from '@/lib/api/crm-deals';
import type { CrmPipeline } from '@/lib/api/crm-pipelines';

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
const SOURCES = ['WEBSITE', 'REFERRAL', 'COLD_CALL', 'EMAIL', 'SOCIAL_MEDIA', 'TRADE_SHOW', 'OTHER'] as const;

interface CreateDealDialogProps {
  open: boolean;
  onClose: () => void;
}

const emptyForm: CreateDealDto = {
  name: '',
  pipelineId: '',
  stageId: '',
  accountId: undefined,
  amount: undefined,
  currency: 'EUR',
  expectedCloseDate: undefined,
  priority: 'MEDIUM',
  source: undefined,
  notes: undefined,
};

export function CreateDealDialog({ open, onClose }: CreateDealDialogProps) {
  const t = useTranslations();
  const td = t.crmDeals;
  const toast = useGlobalToast();
  const createDeal = useCreateDeal();

  const { data: pipelines } = usePipelines();
  const { data: accountsData } = useAccounts({ limit: 100 });

  const [form, setForm] = useState<CreateDealDto>({ ...emptyForm });

  // Get stages for selected pipeline
  const selectedPipeline = pipelines?.find(
    (p: CrmPipeline) => p.id === form.pipelineId,
  );
  const stages = selectedPipeline?.stages ?? [];

  // Reset stage when pipeline changes and current stage is invalid
  useEffect(() => {
    if (form.pipelineId && form.stageId) {
      const stageExists = stages.some((s) => s.id === form.stageId);
      if (!stageExists) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- pipeline change invalidates stage selection
        setForm((prev) => ({ ...prev, stageId: '' }));
      }
    }
  }, [form.pipelineId, form.stageId, stages]);

  const handleChange = (field: keyof CreateDealDto, value: string | number | undefined) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.pipelineId || !form.stageId) return;

    const dto: CreateDealDto = {
      name: form.name.trim(),
      pipelineId: form.pipelineId,
      stageId: form.stageId,
      ...(form.accountId && { accountId: form.accountId }),
      ...(form.amount !== undefined && form.amount !== null && { amount: form.amount, currency: form.currency || 'EUR' }),
      ...(form.expectedCloseDate && { expectedCloseDate: form.expectedCloseDate }),
      ...(form.priority && { priority: form.priority }),
      ...(form.source && { source: form.source }),
      ...(form.notes?.trim() && { notes: form.notes.trim() }),
    };

    try {
      await createDeal.mutateAsync(dto);
      toast.success(td?.created ?? 'Deal created');
      onClose();
      setForm({ ...emptyForm });
    } catch {
      toast.error(td?.createError ?? 'Failed to create deal');
    }
  };

  const handleClose = () => {
    onClose();
    setForm({ ...emptyForm });
  };

  const accounts = accountsData?.data ?? [];

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>{td?.newDeal}</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={12}>
              <TextField
                label={td?.form?.name}
                placeholder={td?.form?.namePlaceholder}
                value={form.name}
                onChange={(e) => handleChange('name', e.target.value)}
                fullWidth
                required
                autoFocus
              />
            </Grid>

            <Grid size={6}>
              <TextField
                label={td?.form?.pipeline}
                value={form.pipelineId}
                onChange={(e) => handleChange('pipelineId', e.target.value)}
                fullWidth
                select
                required
              >
                <MenuItem value="">—</MenuItem>
                {(pipelines ?? []).map((p: CrmPipeline) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid size={6}>
              <TextField
                label={td?.form?.stage}
                value={form.stageId}
                onChange={(e) => handleChange('stageId', e.target.value)}
                fullWidth
                select
                required
                disabled={!form.pipelineId}
                helperText={!form.pipelineId ? (td?.form?.selectPipelineFirst ?? 'Select a pipeline first') : undefined}
              >
                <MenuItem value="">—</MenuItem>
                {stages.map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid size={12}>
              <TextField
                label={td?.form?.account}
                value={form.accountId ?? ''}
                onChange={(e) => handleChange('accountId', e.target.value || undefined)}
                fullWidth
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

            <Grid size={6}>
              <TextField
                label={td?.form?.amount}
                placeholder={td?.form?.amountPlaceholder}
                type="number"
                value={form.amount ?? ''}
                onChange={(e) => handleChange('amount', e.target.value ? Number(e.target.value) : undefined)}
                fullWidth
                slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
              />
            </Grid>

            <Grid size={6}>
              <TextField
                label={td?.form?.expectedCloseDate}
                type="date"
                value={form.expectedCloseDate ?? ''}
                onChange={(e) => handleChange('expectedCloseDate', e.target.value || undefined)}
                fullWidth
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Grid>

            <Grid size={6}>
              <TextField
                label={td?.form?.priority}
                value={form.priority ?? ''}
                onChange={(e) => handleChange('priority', e.target.value || undefined)}
                fullWidth
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

            <Grid size={6}>
              <TextField
                label={td?.form?.source}
                value={form.source ?? ''}
                onChange={(e) => handleChange('source', e.target.value || undefined)}
                fullWidth
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

            <Grid size={12}>
              <TextField
                label={td?.form?.notes}
                placeholder={td?.form?.notesPlaceholder}
                value={form.notes ?? ''}
                onChange={(e) => handleChange('notes', e.target.value || undefined)}
                fullWidth
                multiline
                rows={2}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>{td?.cancel}</Button>
          <Button
            type="submit"
            variant="contained"
            disabled={!form.name.trim() || !form.pipelineId || !form.stageId || createDeal.isPending}
          >
            {td?.create}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
