import React, { useState } from 'react';
import {
  Box,
  Typography,
  Breadcrumbs,
  Skeleton,
  Alert,
  IconButton,
  Divider,
  Paper,
  Switch,
  FormControlLabel,
  TextField,
  Tooltip,
} from '@mui/material';
import MuiLink from '@mui/material/Link';
import NextLink from 'next/link';
import { ArrowLeft, GitBranch, Pencil, Check, X } from 'lucide-react';
import { useRouter } from 'next/router';
import { useTranslations } from '@/lib/hooks/use-translations';
import {
  usePipeline,
  useUpdatePipeline,
  useCreateStage,
  useUpdateStage,
  useDeleteStage,
  useReorderStages,
} from '@/hooks/queries/use-crm-pipelines';
import { useGlobalToast } from '@/lib/context/toast-context';
import { SortableStageList } from './SortableStageList';

interface PipelineSettingsProps {
  pipelineId: string;
}

export function PipelineSettings({ pipelineId }: PipelineSettingsProps) {
  const t = useTranslations();
  const tp = t.crmPipelines;
  const tc = t.common;
  const router = useRouter();

  const { data: pipeline, isLoading, isError, error } = usePipeline(pipelineId);
  const toast = useGlobalToast();
  const updatePipeline = useUpdatePipeline();
  const createStage = useCreateStage();
  const updateStage = useUpdateStage(pipelineId);
  const deleteStage = useDeleteStage(pipelineId);
  const reorderStages = useReorderStages(pipelineId);

  if (isLoading) {
    return (
      <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200 }}>
        <Skeleton width="40%" height={24} animation="wave" sx={{ mb: 2 }} />
        <Skeleton width="60%" height={32} animation="wave" sx={{ mb: 1 }} />
        <Skeleton width="100%" height={200} animation="wave" />
      </Box>
    );
  }

  if (isError || !pipeline) {
    return (
      <Box sx={{ p: { xs: 2, md: 3 } }}>
        <Alert severity="error">{(error as Error)?.message ?? 'Pipeline not found'}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200 }}>
      {/* Breadcrumb */}
      <Breadcrumbs sx={{ mb: 2 }}>
        <MuiLink component={NextLink} href="/dashboard" underline="hover" color="text.secondary" variant="body2">
          {t.crmAccounts?.breadcrumb?.dashboard ?? 'Dashboard'}
        </MuiLink>
        <MuiLink component={NextLink} href="/dashboard" underline="hover" color="text.secondary" variant="body2">
          CRM
        </MuiLink>
        <MuiLink component={NextLink} href="/dashboard/crm/pipelines" underline="hover" color="text.secondary" variant="body2">
          {tp?.breadcrumb?.pipelines ?? 'Pipelines'}
        </MuiLink>
        <Typography variant="body2" color="text.primary">{pipeline.name}</Typography>
      </Breadcrumbs>

      {/* Header with inline-editable name */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton size="small" onClick={() => router.push('/dashboard/crm/pipelines')} aria-label="Back to pipelines">
          <ArrowLeft size={20} />
        </IconButton>
        <GitBranch size={28} />
        <PipelineNameEditor
          value={pipeline.name}
          onSave={(name) => updatePipeline.mutate({ id: pipelineId, dto: { name } }, {
            onSuccess: () => toast.success(tp?.updateSuccess ?? 'Pipeline updated'),
            onError: () => toast.error(tp?.updateError ?? 'Failed to update pipeline'),
          })}
        />
      </Box>

      {/* Description inline-editable */}
      <Box sx={{ mb: 3 }}>
        <PipelineDescEditor
          value={pipeline.description ?? ''}
          placeholder={tp?.form?.descriptionPlaceholder ?? 'Add a description...'}
          onSave={(desc) => updatePipeline.mutate({ id: pipelineId, dto: { description: desc || undefined } }, {
            onSuccess: () => toast.success(tp?.updateSuccess ?? 'Pipeline updated'),
            onError: () => toast.error(tp?.updateError ?? 'Failed to update pipeline'),
          })}
        />
      </Box>

      {/* Toggles */}
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          <FormControlLabel
            control={
              <Switch
                checked={pipeline.isDefault}
                onChange={(e) => updatePipeline.mutate({ id: pipelineId, dto: { isDefault: e.target.checked } }, {
                  onSuccess: () => toast.success(tp?.updateSuccess ?? 'Pipeline updated'),
                  onError: () => toast.error(tp?.updateError ?? 'Failed to update pipeline'),
                })}
              />
            }
            label={tp?.form?.isDefault ?? 'Default pipeline'}
          />
          <FormControlLabel
            control={
              <Switch
                checked={pipeline.isActive}
                onChange={(e) => updatePipeline.mutate({ id: pipelineId, dto: { isActive: e.target.checked } }, {
                  onSuccess: () => toast.success(tp?.updateSuccess ?? 'Pipeline updated'),
                  onError: () => toast.error(tp?.updateError ?? 'Failed to update pipeline'),
                })}
              />
            }
            label={tp?.form?.isActive ?? 'Active'}
          />
        </Box>
      </Paper>

      <Divider sx={{ my: 2 }} />

      {/* Stages */}
      <SortableStageList
        stages={pipeline.stages ?? []}
        tp={tp}
        tc={tc}
        onReorder={(orderedIds) => reorderStages.mutate(orderedIds, {
          onError: () => toast.error(tp?.settings?.reorderError ?? 'Failed to reorder stages'),
        })}
        onCreateStage={(dto) => createStage.mutate({ pipelineId, dto }, {
          onSuccess: () => toast.success(tp?.settings?.stageCreated ?? 'Stage created'),
          onError: () => toast.error(tp?.settings?.stageCreateError ?? 'Failed to create stage'),
        })}
        onUpdateStage={(stageId, dto) => updateStage.mutate({ stageId, dto }, {
          onSuccess: () => toast.success(tp?.settings?.stageUpdated ?? 'Stage updated'),
          onError: () => toast.error(tp?.settings?.stageUpdateError ?? 'Failed to update stage'),
        })}
        onDeleteStage={(stageId) => deleteStage.mutate(stageId, {
          onSuccess: () => toast.success(tp?.settings?.stageDeleted ?? 'Stage deleted'),
          onError: () => toast.error(tp?.settings?.stageDeleteError ?? 'Failed to delete stage'),
        })}
      />
    </Box>
  );
}

// ---- Inline Editors ----

function PipelineNameEditor({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const handleSave = () => {
    if (draft.trim() && draft.trim() !== value) onSave(draft.trim());
    setEditing(false);
  };

  if (editing) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flex: 1 }}>
        <TextField
          size="small"
          fullWidth
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setDraft(value); setEditing(false); } }}
        />
        <IconButton size="small" onClick={handleSave} aria-label="Save"><Check size={16} /></IconButton>
        <IconButton size="small" onClick={() => { setDraft(value); setEditing(false); }} aria-label="Cancel"><X size={16} /></IconButton>
      </Box>
    );
  }

  return (
    <Tooltip title="Click to edit">
      <Box
        role="button"
        tabIndex={0}
        sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 0.5, borderRadius: 1, px: 0.5, '&:hover': { bgcolor: 'action.hover' } }}
        onClick={() => setEditing(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditing(true); } }}
      >
        <Typography variant="h5" fontWeight={600}>{value}</Typography>
        <Pencil size={14} style={{ opacity: 0.4 }} />
      </Box>
    </Tooltip>
  );
}

function PipelineDescEditor({ value, placeholder, onSave }: { value: string; placeholder: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const handleSave = () => {
    if (draft.trim() !== value) onSave(draft.trim());
    setEditing(false);
  };

  if (editing) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
        <TextField
          size="small"
          fullWidth
          autoFocus
          multiline
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') { setDraft(value); setEditing(false); } }}
        />
        <IconButton size="small" onClick={handleSave} aria-label="Save"><Check size={16} /></IconButton>
        <IconButton size="small" onClick={() => { setDraft(value); setEditing(false); }} aria-label="Cancel"><X size={16} /></IconButton>
      </Box>
    );
  }

  return (
    <Box
      role="button"
      tabIndex={0}
      sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 0.5, borderRadius: 1, px: 0.5, '&:hover': { bgcolor: 'action.hover' } }}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditing(true); } }}
    >
      <Typography variant="body2" color={value ? 'text.secondary' : 'text.disabled'}>
        {value || placeholder}
      </Typography>
      <Pencil size={14} style={{ opacity: 0.4 }} />
    </Box>
  );
}
