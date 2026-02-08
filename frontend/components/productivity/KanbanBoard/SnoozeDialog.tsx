'use client';

import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Box,
  Typography,
  Skeleton,
  Chip,
  TextField,
} from '@mui/material';
import { Calendar, Sparkles, Clock } from 'lucide-react';
import { format, addDays, addWeeks } from 'date-fns';
import { useSmartTiming } from '@/hooks/queries';
import { useTranslations } from '@/lib/hooks/use-translations';

interface SnoozeDialogProps {
  open: boolean;
  onClose: () => void;
  followUpId: string | null;
  onSnooze: (date: Date) => void;
}

export function SnoozeDialog({ open, onClose, followUpId, onSnooze }: SnoozeDialogProps) {
  const t = useTranslations();
  const [customDateStr, setCustomDateStr] = useState<string>('');
  const { data: smartTiming, isLoading } = useSmartTiming(followUpId || '');

  // Min date for custom picker (today)
  const minDate = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);

  const formatDateDisplay = (date: Date) => format(date, 'EEEE, MMM d');

  const handlePreset = (days: number) => {
    const newDate = days === 7 ? addWeeks(new Date(), 1) : addDays(new Date(), days);
    onSnooze(newDate);
    onClose();
  };

  const handleSmartTiming = () => {
    if (smartTiming?.suggestedDate) {
      onSnooze(new Date(smartTiming.suggestedDate));
      onClose();
    }
  };

  const handleCustomDate = () => {
    if (customDateStr) {
      onSnooze(new Date(customDateStr));
      onClose();
      setCustomDateStr('');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t.ai.followUpTracker.snooze.title}</DialogTitle>
      <DialogContent>
        {/* Smart Timing Recommendation */}
        {followUpId && (
          <Box sx={{ mb: 2, p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Sparkles size={16} />
              <Typography variant="body2" fontWeight={600}>
                {t.ai.followUpTracker.smartTiming.recommended}
              </Typography>
              <Chip label="AI" size="small" color="primary" sx={{ height: 20, fontSize: 11 }} />
            </Box>
            {isLoading ? (
              <Skeleton variant="rectangular" height={36} sx={{ borderRadius: 1 }} />
            ) : smartTiming?.suggestedDate ? (
              <>
                <Button
                  variant="outlined"
                  size="small"
                  fullWidth
                  onClick={handleSmartTiming}
                  startIcon={<Clock size={16} />}
                  sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
                >
                  {format(new Date(smartTiming.suggestedDate), "EEEE, MMM d 'at' h:mm a")}
                </Button>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                  {smartTiming.reason}
                </Typography>
              </>
            ) : (
              <Typography variant="body2" color="text.secondary">
                {t.ai.followUpTracker.smartTiming.basedOnPatterns}
              </Typography>
            )}
          </Box>
        )}

        {/* Preset Options */}
        <List disablePadding>
          <ListItemButton onClick={() => handlePreset(1)}>
            <ListItemIcon><Calendar size={20} /></ListItemIcon>
            <ListItemText
              primary={t.ai.followUpTracker.snooze.tomorrow}
              secondary={formatDateDisplay(addDays(new Date(), 1))}
            />
          </ListItemButton>
          <ListItemButton onClick={() => handlePreset(7)}>
            <ListItemIcon><Calendar size={20} /></ListItemIcon>
            <ListItemText
              primary={t.ai.followUpTracker.snooze.nextWeek}
              secondary={formatDateDisplay(addWeeks(new Date(), 1))}
            />
          </ListItemButton>
        </List>

        {/* Custom Date Picker */}
        <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {t.ai.followUpTracker.snooze.custom}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              type="date"
              size="small"
              fullWidth
              value={customDateStr}
              onChange={(e) => setCustomDateStr(e.target.value)}
              inputProps={{ min: minDate }}
            />
            <Button
              variant="contained"
              disabled={!customDateStr}
              onClick={handleCustomDate}
              sx={{ minWidth: 80 }}
            >
              {t.common.apply}
            </Button>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t.common.cancel}</Button>
      </DialogActions>
    </Dialog>
  );
}

export default SnoozeDialog;
