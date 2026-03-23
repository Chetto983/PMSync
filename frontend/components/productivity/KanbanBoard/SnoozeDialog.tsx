'use client';

import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  ButtonBase,
  Box,
  Typography,
  Chip,
  TextField,
  alpha,
  useTheme,
} from '@mui/material';
import { Calendar, Clock, Sun, ArrowRight } from 'lucide-react';
import { format, addDays, addWeeks, addMonths } from 'date-fns';
import { it as itLocale } from 'date-fns/locale';
import { useLocale } from '@/lib/hooks/use-locale';
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
  const { locale } = useLocale();
  const [showCustom, setShowCustom] = useState(false);
  const [customDateStr, setCustomDateStr] = useState('');

  const minDate = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const dateLocaleOptions = useMemo(
    () => (locale === 'it' ? { locale: itLocale } : undefined),
    [locale]
  );

  const presets: PresetOption[] = useMemo(
    () => [
      {
        label: t.ai.followUpTracker.snooze.tomorrow,
        icon: <Sun size={16} />,
        getDate: () => addDays(new Date(), 1),
        description: format(addDays(new Date(), 1), 'EEEE, MMM d', dateLocaleOptions),
      },
      {
        label: t.ai.followUpTracker.snooze.inThreeDays || 'In 3 days',
        icon: <Clock size={16} />,
        getDate: () => addDays(new Date(), 3),
        description: format(addDays(new Date(), 3), 'EEEE, MMM d', dateLocaleOptions),
      },
      {
        label: t.ai.followUpTracker.snooze.nextWeek,
        icon: <Calendar size={16} />,
        getDate: () => addWeeks(new Date(), 1),
        description: format(addWeeks(new Date(), 1), 'EEEE, MMM d', dateLocaleOptions),
      },
      {
        label: t.ai.followUpTracker.snooze.nextMonth || 'Next month',
        icon: <ArrowRight size={16} />,
        getDate: () => addMonths(new Date(), 1),
        description: format(addMonths(new Date(), 1), 'MMM d', dateLocaleOptions),
      },
    ],
    [dateLocaleOptions, t],
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
      PaperProps={{ sx: { borderRadius: 3 } }}
    >
      <DialogTitle sx={{ pb: 0.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: 2,
              bgcolor: alpha(theme.palette.warning.main, 0.08),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'warning.main',
            }}
          >
            <Clock size={16} />
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem' }}>
            {t.ai.followUpTracker.snooze.title}
          </Typography>
        </Box>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 0.5 }}>
          {presets.map((preset) => (
            <ButtonBase
              key={preset.label}
              onClick={() => handlePreset(preset)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                px: 2,
                py: 1.5,
                borderRadius: 2.5,
                cursor: 'pointer',
                border: '1px solid',
                borderColor: alpha(theme.palette.divider, 0.6),
                bgcolor: 'background.paper',
                transition: 'all 0.15s ease',
                textAlign: 'left',
                width: '100%',
                '&:hover': {
                  bgcolor: alpha(theme.palette.primary.main, 0.04),
                  borderColor: alpha(theme.palette.primary.main, 0.3),
                  boxShadow: `0 2px 8px ${alpha(theme.palette.common.black, 0.06)}`,
                  transform: 'translateY(-1px)',
                },
                '&:focus-visible': {
                  bgcolor: alpha(theme.palette.primary.main, 0.04),
                  borderColor: alpha(theme.palette.primary.main, 0.3),
                  outline: `2px solid ${theme.palette.primary.main}`,
                  outlineOffset: 1,
                },
                '&:active': { transform: 'none' },
              }}
            >
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: 2,
                  bgcolor: alpha(theme.palette.primary.main, 0.06),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'text.secondary',
                  flexShrink: 0,
                }}
              >
                {preset.icon}
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>
                  {preset.label}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ color: 'text.secondary', fontSize: '0.75rem' }}
                >
                  {preset.description}
                </Typography>
              </Box>
            </ButtonBase>
          ))}
        </Box>

        <Box sx={{ mt: 2.5 }}>
          {!showCustom ? (
            <Chip
              label={t.ai.followUpTracker.snooze.pickDate || 'Pick date'}
              icon={<Calendar size={14} />}
              variant="outlined"
              onClick={() => setShowCustom(true)}
              sx={{
                cursor: 'pointer',
                borderRadius: 2,
                height: 32,
                '&:hover': {
                  bgcolor: alpha(theme.palette.primary.main, 0.04),
                  borderColor: alpha(theme.palette.primary.main, 0.3),
                },
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
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
              <Button
                variant="contained"
                size="small"
                disabled={!customDateStr}
                onClick={handleCustomDate}
                sx={{
                  minWidth: 80,
                  height: 40,
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: 600,
                  boxShadow: 'none',
                  '&:hover': { boxShadow: 'none' },
                }}
              >
                {t.common.apply}
              </Button>
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button
          onClick={handleClose}
          variant="text"
          sx={{ borderRadius: 2, textTransform: 'none', color: 'text.secondary' }}
        >
          {t.common.cancel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default SnoozeDialog;
