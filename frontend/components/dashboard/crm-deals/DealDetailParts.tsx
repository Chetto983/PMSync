import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  IconButton,
  TextField,
  Tooltip,
  Grid,
  MenuItem,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Stepper,
  Step,
  StepLabel,
} from '@mui/material';
import { Pencil, Check, X } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { usePipelines } from '@/hooks/queries/use-crm-pipelines';
import { useAccounts } from '@/hooks/queries/use-crm-accounts';
import type { CrmDeal, UpdateDealDto } from '@/lib/api/crm-deals';
import type { CrmPipeline } from '@/lib/api/crm-pipelines';

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
const SOURCES = ['WEBSITE', 'REFERRAL', 'COLD_CALL', 'EMAIL', 'SOCIAL_MEDIA', 'TRADE_SHOW', 'OTHER'] as const;

// ---- Inline Edit Field ----

export function InlineEditField({
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

// ---- Pipeline Progress Bar ----

export function PipelineProgressBar({
  stages,
  currentStageId,
  translations,
}: {
  stages: { id: string; name: string; color: string | null; probability: number; isWon?: boolean; isLost?: boolean }[];
  currentStageId: string;
  translations: Record<string, string | undefined> | undefined;
}) {
  const currentIndex = stages.findIndex((s) => s.id === currentStageId);
  const currentStage = stages[currentIndex];

  return (
    <Box sx={{ mb: 2 }}>
      <Stepper
        activeStep={currentIndex}
        alternativeLabel
        sx={{
          '& .MuiStepConnector-line': { borderTopWidth: 3 },
          '& .MuiStepLabel-label': { fontSize: '0.75rem' },
        }}
      >
        {stages.map((stage) => (
          <Step key={stage.id} completed={stages.indexOf(stage) < currentIndex}>
            <StepLabel
              StepIconProps={{
                sx: {
                  ...(stage.id === currentStageId && stage.color
                    ? { color: `${stage.color} !important` }
                    : {}),
                },
              }}
            >
              {stage.name}
            </StepLabel>
          </Step>
        ))}
      </Stepper>
      {currentStage && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', textAlign: 'center', mt: 0.5 }}
        >
          {currentStage.isWon
            ? translations?.won ?? 'Won'
            : currentStage.isLost
              ? translations?.lost ?? 'Lost'
              : (translations?.probability ?? '{value}% probability').replace(
                  '{value}',
                  String(currentStage.probability),
                )}
        </Typography>
      )}
    </Box>
  );
}

// ---- Delete Deal Dialog ----

export function DeleteDealDialog({
  open,
  onClose,
  onConfirm,
  loading,
  translations,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
  translations: {
    title?: string;
    message?: string;
    confirm?: string;
    cancel?: string;
  } | undefined;
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{translations?.title ?? 'Delete Deal'}</DialogTitle>
      <DialogContent>
        <DialogContentText>
          {translations?.message ?? 'Are you sure? This action cannot be undone.'}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          {translations?.cancel ?? 'Cancel'}
        </Button>
        <Button onClick={onConfirm} color="error" variant="contained" disabled={loading}>
          {translations?.confirm ?? 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ---- Info Card ----

export function DealInfoCard({
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

  const [localAmount, setLocalAmount] = useState(deal.amount ?? '');

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
              value={localAmount}
              onChange={(e) => setLocalAmount(e.target.value)}
              onBlur={() => {
                const numVal = localAmount ? Number(localAmount) : null;
                const current = deal.amount ? Number(deal.amount) : null;
                if (numVal !== current) onSave({ amount: numVal });
              }}
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
