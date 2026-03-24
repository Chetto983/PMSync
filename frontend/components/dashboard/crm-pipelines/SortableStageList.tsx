import React, { useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  TextField,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Switch,
  FormControlLabel,
  Paper,
} from '@mui/material';
import { GripVertical, Pencil, Trash2, Plus, Check, X } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { CrmStage } from '@/lib/api/crm-pipelines';

interface SortableStageListProps {
  stages: CrmStage[];
  tp: any; // crmPipelines translations
  tc: any; // common translations
  onReorder: (orderedIds: string[]) => void;
  onCreateStage: (dto: { name: string; probability?: number; color?: string; isWon?: boolean; isLost?: boolean }) => void;
  onUpdateStage: (stageId: string, dto: { name?: string; probability?: number; color?: string; isWon?: boolean; isLost?: boolean }) => void;
  onDeleteStage: (stageId: string) => void;
}

export function SortableStageList({
  stages,
  tp,
  tc,
  onReorder,
  onCreateStage,
  onUpdateStage,
  onDeleteStage,
}: SortableStageListProps) {
  const ts = tp?.settings;
  const [createOpen, setCreateOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = stages.findIndex((s) => s.id === active.id);
    const newIndex = stages.findIndex((s) => s.id === over.id);
    const reordered = arrayMove(stages, oldIndex, newIndex);
    onReorder(reordered.map((s) => s.id));
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
        <Box>
          <Typography variant="subtitle1" fontWeight={600}>
            {ts?.stagesTitle ?? 'Stages'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {ts?.stagesDescription ?? 'Drag to reorder.'}
          </Typography>
        </Box>
        <Button
          size="small"
          variant="outlined"
          startIcon={<Plus size={16} />}
          onClick={() => setCreateOpen(true)}
        >
          {ts?.addStage ?? 'Add Stage'}
        </Button>
      </Box>

      {stages.length === 0 && (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">{ts?.noStages ?? 'No stages configured'}</Typography>
          <Typography variant="body2" color="text.disabled" sx={{ mb: 1 }}>
            {ts?.noStagesDescription ?? 'Add stages to define your sales process.'}
          </Typography>
        </Paper>
      )}

      {stages.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={stages.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            {stages.map((stage) => (
              <SortableStageItem
                key={stage.id}
                stage={stage}
                ts={ts}
                tc={tc}
                onUpdate={onUpdateStage}
                onDelete={onDeleteStage}
              />
            ))}
          </SortableContext>
        </DndContext>
      )}

      <CreateStageDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        ts={ts}
        tc={tc}
        onCreate={onCreateStage}
      />
    </Box>
  );
}

// ---- Sortable Stage Item ----

interface SortableStageItemProps {
  stage: CrmStage;
  ts: any;
  tc: any;
  onUpdate: (stageId: string, dto: any) => void;
  onDelete: (stageId: string) => void;
}

function SortableStageItem({ stage, ts, onUpdate, onDelete }: SortableStageItemProps) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(stage.name);
  const [editProb, setEditProb] = useState(String(stage.probability));
  const [editColor, setEditColor] = useState(stage.color ?? '#6B7280');

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stage.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleSave = () => {
    onUpdate(stage.id, {
      name: editName.trim() || stage.name,
      probability: parseInt(editProb, 10) || 0,
      color: editColor,
    });
    setEditing(false);
  };

  const handleCancel = () => {
    setEditName(stage.name);
    setEditProb(String(stage.probability));
    setEditColor(stage.color ?? '#6B7280');
    setEditing(false);
  };

  const handleDelete = () => {
    if (window.confirm(ts?.deleteStageConfirm ?? 'Delete this stage?')) {
      onDelete(stage.id);
    }
  };

  return (
    <Paper
      ref={setNodeRef}
      style={style}
      variant="outlined"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: 2,
        py: 1,
        mb: 0.5,
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      {/* Drag handle */}
      <Box
        {...attributes}
        {...listeners}
        sx={{ cursor: 'grab', display: 'flex', alignItems: 'center', color: 'text.disabled' }}
      >
        <GripVertical size={18} />
      </Box>

      {/* Color indicator */}
      <Box
        sx={{
          width: 12,
          height: 12,
          borderRadius: '50%',
          bgcolor: stage.color ?? '#6B7280',
          flexShrink: 0,
        }}
      />

      {editing ? (
        /* Edit mode */
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
          <TextField
            size="small"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            autoFocus
            sx={{ flex: 1 }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleCancel(); }}
          />
          <TextField
            size="small"
            type="number"
            value={editProb}
            onChange={(e) => setEditProb(e.target.value)}
            sx={{ width: 80 }}
            slotProps={{ htmlInput: { min: 0, max: 100 } }}
          />
          <input
            type="color"
            title={ts?.stageForm?.color ?? 'Stage color'}
            value={editColor}
            onChange={(e) => setEditColor(e.target.value)}
            style={{ width: 32, height: 32, border: 'none', cursor: 'pointer', padding: 0 }}
          />
          <IconButton size="small" onClick={handleSave}><Check size={16} /></IconButton>
          <IconButton size="small" onClick={handleCancel}><X size={16} /></IconButton>
        </Box>
      ) : (
        /* Display mode */
        <>
          <Typography variant="body2" sx={{ flex: 1, fontWeight: 500 }}>
            {stage.name}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ minWidth: 40, textAlign: 'right' }}>
            {stage.probability}%
          </Typography>
          {stage.isWon && (
            <Typography variant="caption" color="success.main" fontWeight={600}>Won</Typography>
          )}
          {stage.isLost && (
            <Typography variant="caption" color="error.main" fontWeight={600}>Lost</Typography>
          )}
          <Tooltip title={ts?.editStage ?? 'Edit'}>
            <IconButton size="small" onClick={() => setEditing(true)}>
              <Pencil size={14} style={{ opacity: 0.4 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title={ts?.deleteStage ?? 'Delete'}>
            <IconButton size="small" onClick={handleDelete}>
              <Trash2 size={14} style={{ opacity: 0.4 }} />
            </IconButton>
          </Tooltip>
        </>
      )}
    </Paper>
  );
}

// ---- Create Stage Dialog ----

interface CreateStageDialogProps {
  open: boolean;
  onClose: () => void;
  ts: any;
  tc: any;
  onCreate: (dto: { name: string; probability?: number; color?: string; isWon?: boolean; isLost?: boolean }) => void;
}

function CreateStageDialog({ open, onClose, ts, tc, onCreate }: CreateStageDialogProps) {
  const [name, setName] = useState('');
  const [probability, setProbability] = useState('0');
  const [color, setColor] = useState('#6B7280');
  const [isWon, setIsWon] = useState(false);
  const [isLost, setIsLost] = useState(false);

  const handleSubmit = () => {
    if (!name.trim()) return;
    onCreate({
      name: name.trim(),
      probability: parseInt(probability, 10) || 0,
      color,
      isWon,
      isLost,
    });
    setName('');
    setProbability('0');
    setColor('#6B7280');
    setIsWon(false);
    setIsLost(false);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{ts?.addStage ?? 'Add Stage'}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          size="small"
          label={ts?.stageForm?.name ?? 'Stage Name'}
          placeholder={ts?.stageForm?.namePlaceholder ?? 'e.g. Qualified Lead'}
          value={name}
          onChange={(e) => setName(e.target.value)}
          sx={{ mt: 1, mb: 2 }}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
        />
        <TextField
          fullWidth
          size="small"
          type="number"
          label={ts?.stageForm?.probability ?? 'Win Probability (%)'}
          value={probability}
          onChange={(e) => setProbability(e.target.value)}
          slotProps={{ htmlInput: { min: 0, max: 100 } }}
          sx={{ mb: 2 }}
        />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <Typography variant="body2">{ts?.stageForm?.color ?? 'Color'}</Typography>
          <input
            type="color"
            title={ts?.stageForm?.color ?? 'Stage color'}
            value={color}
            onChange={(e) => setColor(e.target.value)}
            style={{ width: 40, height: 32, border: 'none', cursor: 'pointer', padding: 0 }}
          />
        </Box>
        <FormControlLabel
          control={<Switch checked={isWon} onChange={(e) => { setIsWon(e.target.checked); if (e.target.checked) setIsLost(false); }} />}
          label={ts?.stageForm?.isWon ?? 'Won stage'}
        />
        <FormControlLabel
          control={<Switch checked={isLost} onChange={(e) => { setIsLost(e.target.checked); if (e.target.checked) setIsWon(false); }} />}
          label={ts?.stageForm?.isLost ?? 'Lost stage'}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{tc?.cancel ?? 'Cancel'}</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={!name.trim()}>
          {tc?.create ?? 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
