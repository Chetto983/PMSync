import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Box,
} from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useCreateDealActivity } from '@/hooks/queries/use-crm-deals';
import { useGlobalToast } from '@/lib/context/toast-context';

const ACTIVITY_TYPES = ['CALL', 'EMAIL', 'MEETING', 'TASK'] as const;

interface CreateActivityDialogProps {
  open: boolean;
  onClose: () => void;
  dealId: string;
}

export function CreateActivityDialog({ open, onClose, dealId }: CreateActivityDialogProps) {
  const t = useTranslations();
  const tf = t.crmDeals?.detail?.activityForm;
  const tl = t.crmDeals?.detail?.timeline;
  const toast = useGlobalToast();
  const createActivity = useCreateDealActivity(dealId);

  const [type, setType] = useState<string>('CALL');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');

  const resetForm = () => {
    setType('CALL');
    setDescription('');
    setDate('');
    setDurationMinutes('');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSave = async () => {
    try {
      await createActivity.mutateAsync({
        type: type as 'CALL' | 'EMAIL' | 'MEETING' | 'TASK',
        description: description || undefined,
        date: date || undefined,
        durationMinutes: durationMinutes ? Number(durationMinutes) : undefined,
      });
      toast.success(tf?.created ?? 'Activity logged');
      handleClose();
    } catch {
      toast.error(tf?.createError ?? 'Failed to log activity');
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>{tf?.title ?? 'Log Activity'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField
            label={tf?.type ?? 'Activity Type'}
            value={type}
            onChange={(e) => setType(e.target.value)}
            select
            fullWidth
            size="small"
          >
            {ACTIVITY_TYPES.map((t) => (
              <MenuItem key={t} value={t}>
                {tl?.types?.[t] ?? t}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            label={tf?.description ?? 'Description'}
            placeholder={tf?.descriptionPlaceholder ?? 'What happened?'}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            size="small"
            multiline
            rows={3}
          />

          <TextField
            label={tf?.date ?? 'Date & Time'}
            type="datetime-local"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            fullWidth
            size="small"
            slotProps={{ inputLabel: { shrink: true } }}
          />

          <TextField
            label={tf?.duration ?? 'Duration (minutes)'}
            type="number"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
            fullWidth
            size="small"
            slotProps={{ htmlInput: { min: 0 } }}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={createActivity.isPending}>
          {tf?.cancel ?? 'Cancel'}
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={createActivity.isPending}
        >
          {tf?.save ?? 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
