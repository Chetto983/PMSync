import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Alert,
  Skeleton,
  Card,
  CardContent,
  CardActionArea,
  Chip,
  Grid,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Switch,
  FormControlLabel,
} from '@mui/material';
import { Plus, Settings, Trash2, GitBranch } from 'lucide-react';
import { useRouter } from 'next/router';
import { useTranslations } from '@/lib/hooks/use-translations';
import {
  usePipelines,
  useCreatePipeline,
  useDeletePipeline,
} from '@/hooks/queries/use-crm-pipelines';
import type { CrmPipeline } from '@/lib/api/crm-pipelines';

export function PipelinesList() {
  const t = useTranslations();
  const tp = t.crmPipelines;
  const tc = t.common;
  const router = useRouter();

  const [createOpen, setCreateOpen] = useState(false);

  const { data: pipelines, isLoading, isError, error } = usePipelines();
  const deletePipeline = useDeletePipeline();

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm(tp?.deleteConfirm ?? 'Delete?')) {
      deletePipeline.mutate(id);
    }
  };

  const handleOpenSettings = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    router.push(`/dashboard/crm/pipelines/${id}/settings`);
  };

  // Loading state
  if (isLoading) {
    return (
      <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200 }}>
        <Skeleton width="30%" height={32} animation="wave" sx={{ mb: 1 }} />
        <Skeleton width="50%" height={20} animation="wave" sx={{ mb: 3 }} />
        <Grid container spacing={2}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Grid key={i} size={{ xs: 12, sm: 6, md: 4 }}>
              <Skeleton variant="rounded" height={140} animation="wave" />
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  }

  // Error state
  if (isError) {
    return (
      <Box sx={{ p: { xs: 2, md: 3 } }}>
        <Alert severity="error">{(error as Error)?.message ?? 'Error loading pipelines'}</Alert>
      </Box>
    );
  }

  const rows = pipelines ?? [];

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={600}>
            {tp?.title ?? 'Pipelines'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {tp?.description ?? 'Manage your sales pipelines and stages.'}
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<Plus size={18} />}
          onClick={() => setCreateOpen(true)}
        >
          {tp?.newPipeline ?? 'New Pipeline'}
        </Button>
      </Box>

      {/* Empty state */}
      {rows.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <GitBranch size={48} style={{ opacity: 0.3 }} />
          <Typography variant="h6" color="text.secondary" sx={{ mt: 2 }}>
            {tp?.noPipelinesFound ?? 'No pipelines found'}
          </Typography>
          <Typography variant="body2" color="text.disabled" sx={{ mb: 2 }}>
            {tp?.noPipelinesDescription ?? 'Create your first pipeline to start tracking deals.'}
          </Typography>
          <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => setCreateOpen(true)}>
            {tp?.newPipeline ?? 'New Pipeline'}
          </Button>
        </Box>
      )}

      {/* Pipeline cards */}
      {rows.length > 0 && (
        <Grid container spacing={2}>
          {rows.map((pipeline) => (
            <Grid key={pipeline.id} size={{ xs: 12, sm: 6, md: 4 }}>
              <PipelineCard
                pipeline={pipeline}
                tp={tp}
                onSettings={(e) => handleOpenSettings(e, pipeline.id)}
                onDelete={(e) => handleDelete(e, pipeline.id)}
              />
            </Grid>
          ))}
        </Grid>
      )}

      {/* Create dialog */}
      <CreatePipelineDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        tp={tp}
        tc={tc}
      />
    </Box>
  );
}

// ---- Pipeline Card ----

interface PipelineCardProps {
  pipeline: CrmPipeline;
  tp: ReturnType<typeof useTranslations>['crmPipelines'];
  onSettings: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}

function PipelineCard({ pipeline, tp, onSettings, onDelete }: PipelineCardProps) {
  const router = useRouter();

  return (
    <Card variant="outlined">
      <CardActionArea onClick={() => router.push(`/dashboard/crm/pipelines/${pipeline.id}/settings`)}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
              <GitBranch size={20} />
              <Typography variant="subtitle1" fontWeight={600} noWrap>
                {pipeline.name}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
              <Tooltip title={tp?.settings?.title ?? 'Settings'}>
                <IconButton size="small" onClick={onSettings}>
                  <Settings size={16} />
                </IconButton>
              </Tooltip>
              <Tooltip title={tp?.deletePipeline ?? 'Delete'}>
                <IconButton size="small" onClick={onDelete}>
                  <Trash2 size={16} />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>

          {pipeline.description && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }} noWrap>
              {pipeline.description}
            </Typography>
          )}

          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {pipeline.isDefault && (
              <Chip
                label={tp?.defaultBadge ?? 'Default'}
                size="small"
                color="primary"
                variant="outlined"
              />
            )}
            <Chip
              label={pipeline.isActive ? (tp?.activeBadge ?? 'Active') : (tp?.inactiveBadge ?? 'Inactive')}
              size="small"
              color={pipeline.isActive ? 'success' : 'default'}
              variant="outlined"
            />
          </Box>

          <Box sx={{ display: 'flex', gap: 2, mt: 1.5 }}>
            <Typography variant="caption" color="text.secondary">
              {pipeline._count?.stages ?? 0} {tp?.stages ?? 'stages'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {pipeline._count?.deals ?? 0} {tp?.deals ?? 'deals'}
            </Typography>
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

// ---- Create Pipeline Dialog ----

interface CreatePipelineDialogProps {
  open: boolean;
  onClose: () => void;
  tp: ReturnType<typeof useTranslations>['crmPipelines'];
  tc: ReturnType<typeof useTranslations>['common'];
}

function CreatePipelineDialog({ open, onClose, tp, tc }: CreatePipelineDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const createPipeline = useCreatePipeline();

  const handleSubmit = () => {
    if (!name.trim()) return;
    createPipeline.mutate(
      { name: name.trim(), description: description.trim() || undefined, isDefault },
      {
        onSuccess: () => {
          setName('');
          setDescription('');
          setIsDefault(false);
          onClose();
        },
      },
    );
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{tp?.newPipeline ?? 'New Pipeline'}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          size="small"
          label={tp?.form?.name ?? 'Pipeline Name'}
          placeholder={tp?.form?.namePlaceholder ?? 'e.g. Sales Pipeline'}
          value={name}
          onChange={(e) => setName(e.target.value)}
          sx={{ mt: 1, mb: 2 }}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
        />
        <TextField
          fullWidth
          size="small"
          label={tp?.form?.description ?? 'Description'}
          placeholder={tp?.form?.descriptionPlaceholder ?? 'Brief description...'}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          multiline
          rows={2}
          sx={{ mb: 2 }}
        />
        <FormControlLabel
          control={<Switch checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />}
          label={tp?.form?.isDefault ?? 'Default pipeline'}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{tc?.cancel ?? 'Cancel'}</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!name.trim() || createPipeline.isPending}
        >
          {tc?.create ?? 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
