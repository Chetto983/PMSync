/**
 * SnoozeMenu — Standalone MUI Menu with 3 snooze options per UI-SPEC § Snooze Menu.
 *
 * Date math copied from FollowUpWidget (Pattern S8): addHours / startOfTomorrow / nextMonday
 * with 9:00 AM target for tomorrow + nextWeek.
 */

'use client';

import { Menu, MenuItem, ListItemIcon, ListItemText } from '@mui/material';
import { Clock, Sun, CalendarDays } from 'lucide-react';
import { addHours, startOfTomorrow, nextMonday } from 'date-fns';
import { useTranslations } from '@/lib/hooks/use-translations';

interface SnoozeMenuProps {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onSnooze: (until: Date) => void;
}

function computeUntil(option: 'oneHour' | 'tomorrow' | 'nextWeek'): Date {
  if (option === 'oneHour') return addHours(new Date(), 1);
  if (option === 'tomorrow') {
    const d = startOfTomorrow();
    d.setHours(9, 0, 0, 0);
    return d;
  }
  const d = nextMonday(new Date());
  d.setHours(9, 0, 0, 0);
  return d;
}

export function SnoozeMenu({ anchorEl, onClose, onSnooze }: SnoozeMenuProps) {
  const t = useTranslations();
  const labels = t.dashboard.today.snooze;

  const handle = (option: 'oneHour' | 'tomorrow' | 'nextWeek') => () => {
    onSnooze(computeUntil(option));
    onClose();
  };

  return (
    <Menu
      anchorEl={anchorEl}
      open={Boolean(anchorEl)}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
    >
      <MenuItem onClick={handle('oneHour')}>
        <ListItemIcon>
          <Clock size={16} />
        </ListItemIcon>
        <ListItemText primary={labels.oneHour} />
      </MenuItem>
      <MenuItem onClick={handle('tomorrow')}>
        <ListItemIcon>
          <Sun size={16} />
        </ListItemIcon>
        <ListItemText primary={labels.tomorrow} />
      </MenuItem>
      <MenuItem onClick={handle('nextWeek')}>
        <ListItemIcon>
          <CalendarDays size={16} />
        </ListItemIcon>
        <ListItemText primary={labels.nextWeek} />
      </MenuItem>
    </Menu>
  );
}
