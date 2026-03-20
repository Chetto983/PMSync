'use client';

import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Chip,
  TextField,
  alpha,
  useTheme,
} from '@mui/material';
import { Calendar, Clock, Sun, ArrowRight } from 'lucide-react';
import { format, addDays, addWeeks, addMonths } from 'date-fns';
import { useTranslations } from '@/lib/hooks/use-translations';

interface SnoozeDialogProps {
  open: boolean;
  onClose: () => void;
  followUpId: string | null;
  onSnooze: (date: Date) => void;
}

interface PresetOption {
  label: string;
  icon: React.ReactNode;
  getDate: () => Date;
  description: string;
}

export function SnoozeDialog({ open, onClose, followUpId, onSnooze }: SnoozeDialogProps) {
  const theme = useTheme();
  const t = useTranslations();
  const [showCustom, setShowCustom] = useState(false);
  const [customDateStr, setCustomDateStr] = useState('');

  const minDate = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);

  const presets: PresetOption[] = useMemo(
    () => [
      {
        label: t.ai.followUpTracker.snooze.tomorrow,
        icon: <Sun size={14} />,
        getDate: () => addDays(new Date(), 1),
        description: format(addDays(new Date(), 1), 'EEEE, MMM d'),
      },
      {
        label: t.ai.followUpTracker.snooze.inThreeDays || 'In 3 days',
        icon: <Clock size={14} />,
        getDate: () => addDays(new Date(), 3),
        description: format(addDays(new Date(), 3), 'EEEE, MMM d'),
      },
      {
        label: t.ai.followUpTracker.snooze.nextWeek,
        icon: <Calendar size={14} />,
        getDate: () => addWeeks(new Date(), 1),
        description: format(addWeeks(new Date(), 1), 'EEEE, MMM d'),
      },
      {
        label: t.ai.followUpTracker.snooze.nextMonth || 'Next month',
        icon: <ArrowRight size={14} />,
        getDate: () => addMonths(new Date(), 1),
        description: format(addMonths(new Date(), 1), 'MMM d'),
      },
    ],
    [t],
  );

  const handlePreset = (preset: PresetOption) => {
    onSnooze(preset.getDate());
    handleClose();
  };

  const handleCustomDate = () => {
    if (customDateStr) {
      onSnooze(new Date(customDateStr));
      handleClose();
    }
  };

  const handleClose = () => {
    setShowCustom(false);
    setCustomDateStr('');
    onClose();
  };

  if (!followUpId) return null;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: { borderRadius: 3 },
      }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Clock size={18} />
          {t.ai.followUpTracker.snooze.title}
        </Box>
      </DialogTitle>
      <DialogContent>
        {/* Quick preset chips */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {presets.map((preset) => (
            <Box
              key={preset.label}
              onClick={() => handlePreset(preset)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                px: 2,
                py: 1.25,
                borderRadius: 2,
                cursor: 'pointer',
                border: '1px solid',
                borderColor: 'divider',
                transition: 'all 0.15s ease',
                '&:hover': {
                  bgcolor: alpha(theme.palette.primary.main, 0.04),
                  borderColor: alpha(theme.palette.primary.main, 0.3),
                },
              }}
            >
              <Box sx={{ color: 'text.secondary', display: 'flex' }}>{preset.icon}</Box>
              <Box sx={{ flex: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {preset.label}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {preset.description}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>

        {/* Custom date toggle */}
        <Box sx={{ mt: 2 }}>
          {!showCustom ? (
            <Chip
              label={t.ai.followUpTracker.snooze.pickDate || 'Pick date'}
              icon={<Calendar size={14} />}
              variant="outlined"
              onClick={() => setShowCustom(true)}
              sx={{
                cursor: 'pointer',
                '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.04) },
              }}
            />
          ) : (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
              <TextField
                type="date"
                size="small"
                fullWidth
                value={customDateStr}
                onChange={(e) => setCustomDateStr(e.target.value)}
                inputProps={{ min: minDate }}
                label={t.ai.followUpTracker.snooze.custom}
                InputLabelProps={{ shrink: true }}
              />
              <Button
                variant="contained"
                size="small"
                disabled={!customDateStr}
                onClick={handleCustomDate}
                sx={{ minWidth: 80, height: 40 }}
              >
                {t.common.apply}
              </Button>
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>{t.common.cancel}</Button>
      </DialogActions>
    </Dialog>
  );
}

export default SnoozeDialog;
