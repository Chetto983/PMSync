/**
 * Schedule Send Dialog
 *
 * Allows users to schedule emails for later delivery:
 * - Quick options (tomorrow morning, next Monday, etc.)
 * - Custom date/time picker
 *
 * @see https://novu.co/blog/creating-a-scheduling-app-with-react-nodejs-and-emailjs/
 */

import { useState, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  TextField,
  Button,
  IconButton,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
} from '@mui/material';
import { X, Clock, Calendar, Sun, Coffee, Briefcase } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useUserTimezone } from '@/hooks/use-user-timezone';
import { useLocale } from '@/lib/hooks/use-locale';
import { formatScheduleDateInTz } from '@/lib/utils/format-date-tz';

// Quick schedule options
interface QuickOption {
  labelKey: string;
  icon: React.ReactNode;
  getDate: () => Date;
}

export interface ScheduleSendDialogProps {
  open: boolean;
  onClose: () => void;
  /** Callback when schedule time is selected */
  onSchedule: (scheduledTime: Date) => void;
}

export function ScheduleSendDialog({
  open,
  onClose,
  onSchedule,
}: ScheduleSendDialogProps) {
  const t = useTranslations();
  const timezone = useUserTimezone();
  const { locale } = useLocale();

  // State for custom date/time
  const [customDate, setCustomDate] = useState('');
  const [customTime, setCustomTime] = useState('');

  // Quick options with dynamic dates
  const quickOptions: QuickOption[] = useMemo(() => [
    {
      labelKey: 'laterToday',
      icon: <Clock size={20} />,
      getDate: () => {
        const date = new Date();
        // Set to 2 hours from now, rounded to next 30 min
        date.setMinutes(Math.ceil((date.getMinutes() + 120) / 30) * 30, 0, 0);
        return date;
      },
    },
    {
      labelKey: 'tomorrowMorning',
      icon: <Sun size={20} />,
      getDate: () => {
        const date = new Date();
        date.setDate(date.getDate() + 1);
        date.setHours(9, 0, 0, 0);
        return date;
      },
    },
    {
      labelKey: 'tomorrowAfternoon',
      icon: <Coffee size={20} />,
      getDate: () => {
        const date = new Date();
        date.setDate(date.getDate() + 1);
        date.setHours(14, 0, 0, 0);
        return date;
      },
    },
    {
      labelKey: 'nextMonday',
      icon: <Briefcase size={20} />,
      getDate: () => {
        const date = new Date();
        const daysUntilMonday = (8 - date.getDay()) % 7 || 7;
        date.setDate(date.getDate() + daysUntilMonday);
        date.setHours(9, 0, 0, 0);
        return date;
      },
    },
  ], []);

  // Handle quick option selection
  const handleQuickOption = useCallback((option: QuickOption) => {
    const scheduledTime = option.getDate();
    onSchedule(scheduledTime);
    onClose();
  }, [onSchedule, onClose]);

  // Handle custom schedule
  const handleCustomSchedule = useCallback(() => {
    if (!customDate || !customTime) return;

    const scheduledTime = new Date(`${customDate}T${customTime}`);
    if (scheduledTime <= new Date()) {
      // Can't schedule in the past
      return;
    }

    onSchedule(scheduledTime);
    onClose();
    // Reset state
    setCustomDate('');
    setCustomTime('');
  }, [customDate, customTime, onSchedule, onClose]);

  // Min date for custom picker (today)
  const minDate = useMemo(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  }, []);

  // Validate custom selection
  const isCustomValid = useMemo(() => {
    if (!customDate || !customTime) return false;
    const scheduledTime = new Date(`${customDate}T${customTime}`);
    return scheduledTime > new Date();
  }, [customDate, customTime]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          py: 1.5,
          px: 2,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Calendar size={20} />
          <Typography variant="h6" component="span">
            {t.email?.scheduleSend?.title || 'Schedule Send'}
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 0 }}>
        {/* Quick options */}
        <List sx={{ py: 0 }}>
          {quickOptions.map((option, index) => (
            <Box key={option.labelKey}>
              {index > 0 && <Divider />}
              <ListItem disablePadding>
                <ListItemButton onClick={() => handleQuickOption(option)}>
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    {option.icon}
                  </ListItemIcon>
                  <ListItemText
                    primary={t.email?.scheduleSend?.options?.[option.labelKey] || option.labelKey}
                    secondary={formatScheduleDateInTz(option.getDate(), timezone, locale)}
                  />
                </ListItemButton>
              </ListItem>
            </Box>
          ))}
        </List>

        <Divider />

        {/* Custom date/time */}
        <Box sx={{ p: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
            {t.email?.scheduleSend?.customTime || 'Custom date & time'}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <TextField
              type="date"
              size="small"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              inputProps={{ min: minDate }}
              sx={{ flex: 1 }}
            />
            <TextField
              type="time"
              size="small"
              value={customTime}
              onChange={(e) => setCustomTime(e.target.value)}
              sx={{ flex: 1 }}
            />
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 2, py: 1.5, borderTop: 1, borderColor: 'divider' }}>
        <Button variant="outlined" onClick={onClose}>
          {t.common?.cancel || 'Cancel'}
        </Button>
        <Button
          variant="contained"
          onClick={handleCustomSchedule}
          disabled={!isCustomValid}
          startIcon={<Clock size={16} />}
        >
          {t.email?.scheduleSend?.schedule || 'Schedule'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default ScheduleSendDialog;
