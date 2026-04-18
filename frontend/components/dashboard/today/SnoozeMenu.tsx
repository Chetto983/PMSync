/**
 * SnoozeMenu — Standalone MUI Menu with 6 snooze options per UI-SPEC § Snooze Menu (145.1-03).
 *
 * Options: quarterHour, oneHour, tonight, tomorrow, nextWeek, custom.
 * Tonight edge case: if current time is already past 18:00, fall back to tomorrow 9am.
 * Shadow-lg elevation per UI-SPEC (Paper elevation=16 + boxShadow=20).
 * `custom` is rendered for keyboard navigation; parent owns the stub via onCustom prop.
 */

'use client';

import { Menu, MenuItem, ListItemIcon, ListItemText } from '@mui/material';
import {
  Clock,
  Sun,
  Moon,
  CalendarDays,
  CalendarClock,
  CalendarRange,
} from 'lucide-react';
import {
  addMinutes,
  addHours,
  startOfTomorrow,
  nextMonday,
} from 'date-fns';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useGlobalToast } from '@/lib/context/toast-context';

type SnoozeOption =
  | 'quarterHour'
  | 'oneHour'
  | 'tonight'
  | 'tomorrow'
  | 'nextWeek'
  | 'custom';

interface SnoozeMenuProps {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onSnooze: (until: Date) => void;
  /**
   * Optional override for the `custom` option. When omitted, the menu shows a
   * "coming soon" toast. The full date-time picker dialog is deferred per
   * PATTERNS.md watchout.
   */
  onCustom?: () => void;
}

function computeUntil(option: Exclude<SnoozeOption, 'custom'>): Date {
  const now = new Date();
  if (option === 'quarterHour') return addMinutes(now, 15);
  if (option === 'oneHour') return addHours(now, 1);
  if (option === 'tonight') {
    const d = new Date();
    d.setHours(18, 0, 0, 0);
    // Edge case: if already past 18:00, fall back to tomorrow 9am.
    if (d.getTime() <= now.getTime()) {
      const t = startOfTomorrow();
      t.setHours(9, 0, 0, 0);
      return t;
    }
    return d;
  }
  if (option === 'tomorrow') {
    const d = startOfTomorrow();
    d.setHours(9, 0, 0, 0);
    return d;
  }
  // nextWeek
  const d = nextMonday(new Date());
  d.setHours(9, 0, 0, 0);
  return d;
}

const ITEM_SX = {
  height: 32,
  fontSize: 14,
  fontWeight: 400,
  '&:hover': { bgcolor: 'action.hover' },
} as const;

export function SnoozeMenu({ anchorEl, onClose, onSnooze, onCustom }: SnoozeMenuProps) {
  const t = useTranslations();
  const toast = useGlobalToast();

  const handleScheduled = (option: Exclude<SnoozeOption, 'custom'>) => () => {
    onSnooze(computeUntil(option));
    onClose();
  };

  const handleCustom = () => {
    if (onCustom) {
      onCustom();
    } else {
      toast.info(`${t.dashboard.today.snooze.custom} — coming soon`);
    }
    onClose();
  };

  return (
    <Menu
      anchorEl={anchorEl}
      open={Boolean(anchorEl)}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      slotProps={{ paper: { elevation: 16, sx: { boxShadow: 20 } } }}
    >
      <MenuItem onClick={handleScheduled('quarterHour')} sx={ITEM_SX}>
        <ListItemIcon>
          <Clock size={16} />
        </ListItemIcon>
        <ListItemText primary={t.dashboard.today.snooze.quarterHour} />
      </MenuItem>
      <MenuItem onClick={handleScheduled('oneHour')} sx={ITEM_SX}>
        <ListItemIcon>
          <CalendarClock size={16} />
        </ListItemIcon>
        <ListItemText primary={t.dashboard.today.snooze.oneHour} />
      </MenuItem>
      <MenuItem onClick={handleScheduled('tonight')} sx={ITEM_SX}>
        <ListItemIcon>
          <Moon size={16} />
        </ListItemIcon>
        <ListItemText primary={t.dashboard.today.snooze.tonight} />
      </MenuItem>
      <MenuItem onClick={handleScheduled('tomorrow')} sx={ITEM_SX}>
        <ListItemIcon>
          <Sun size={16} />
        </ListItemIcon>
        <ListItemText primary={t.dashboard.today.snooze.tomorrow} />
      </MenuItem>
      <MenuItem onClick={handleScheduled('nextWeek')} sx={ITEM_SX}>
        <ListItemIcon>
          <CalendarDays size={16} />
        </ListItemIcon>
        <ListItemText primary={t.dashboard.today.snooze.nextWeek} />
      </MenuItem>
      <MenuItem onClick={handleCustom} sx={ITEM_SX}>
        <ListItemIcon>
          <CalendarRange size={16} />
        </ListItemIcon>
        <ListItemText primary={t.dashboard.today.snooze.custom} />
      </MenuItem>
    </Menu>
  );
}
