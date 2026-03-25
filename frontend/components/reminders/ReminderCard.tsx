import React from 'react';
import {
  Card,
  CardContent,
  Box,
  Typography,
  Chip,
  IconButton,
  Tooltip,
  Checkbox,
} from '@mui/material';
import { CheckCircle2, Trash2, Send } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useUserTimezone } from '@/hooks/use-user-timezone';
import { formatDateTimeInTz } from '@/lib/utils/format-date-tz';
import type { Reminder } from '@/lib/api/reminders';

interface ReminderCardProps {
  reminder: Reminder;
  selected?: boolean;
  onSelect?: (id: string) => void;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
}

function prioritaColor(p: string): 'error' | 'warning' | 'success' | 'default' {
  switch (p) {
    case 'alta': return 'error';
    case 'media': return 'warning';
    case 'bassa': return 'success';
    default: return 'default';
  }
}

export function ReminderCard({ reminder, selected, onSelect, onComplete, onDelete }: ReminderCardProps) {
  const t = useTranslations();
  const tr = t.ai.reminders;
  const tz = useUserTimezone();

  const isCompleted = reminder.status === 'completato' || reminder.status === 'annullato';

  return (
    <Card
      variant="outlined"
      sx={{
        opacity: isCompleted ? 0.6 : 1,
        transition: 'opacity 0.2s, border-color 0.2s',
        borderColor: selected ? 'primary.main' : undefined,
        bgcolor: selected ? 'action.selected' : undefined,
      }}
    >
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', flex: 1, minWidth: 0, gap: 1 }}>
            {onSelect && (
              <Checkbox
                checked={!!selected}
                onChange={() => onSelect(reminder.id)}
                size="small"
                sx={{ mt: -0.5, ml: -0.5 }}
              />
            )}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body1" sx={{ fontWeight: 600 }} noWrap>
                {reminder.titolo}
              </Typography>
              {reminder.descrizione && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }} noWrap>
                  {reminder.descrizione}
                </Typography>
              )}
            </Box>
          </Box>
          {!isCompleted && (
            <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
              <Tooltip title={tr.actions.complete}>
                <IconButton size="small" color="success" onClick={() => onComplete(reminder.id)} sx={{ minWidth: 44, minHeight: 44 }}>
                  <CheckCircle2 size={18} />
                </IconButton>
              </Tooltip>
              <Tooltip title={tr.actions.delete}>
                <IconButton size="small" color="error" onClick={() => onDelete(reminder.id)} sx={{ minWidth: 44, minHeight: 44 }}>
                  <Trash2 size={18} />
                </IconButton>
              </Tooltip>
            </Box>
          )}
        </Box>

        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1.5 }}>
          <Chip
            label={tr.priorita[reminder.priorita] || reminder.priorita}
            size="small"
            color={prioritaColor(reminder.priorita)}
            sx={{ height: 22 }}
          />
          <Chip
            label={tr.status[reminder.status] || reminder.status}
            size="small"
            variant="outlined"
            sx={{ height: 22 }}
          />
          {reminder.condizioneTipo !== 'sempre' && (
            <Chip
              label={tr.condizione[reminder.condizioneTipo] || reminder.condizioneTipo}
              size="small"
              variant="outlined"
              sx={{ height: 22 }}
            />
          )}
          {reminder.azione !== 'altro' && (
            <Chip
              label={tr.azione[reminder.azione] || reminder.azione}
              size="small"
              variant="outlined"
              sx={{ height: 22 }}
            />
          )}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1, flexWrap: 'wrap' }}>
          {reminder.contatto && (
            <Typography variant="caption" color="text.secondary">
              {tr.fields.contact}: {reminder.contatto}
            </Typography>
          )}
          {reminder.scadenzaDatetime && (
            <Typography variant="caption" color="text.secondary">
              {tr.fields.deadline}: {formatDateTimeInTz(reminder.scadenzaDatetime, tz)}
            </Typography>
          )}
          {reminder.telegramInviato && (
            <Tooltip title={tr.telegram.sent}>
              <Send size={14} style={{ opacity: 0.5 }} />
            </Tooltip>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
