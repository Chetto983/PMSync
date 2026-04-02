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
import { Bot, CheckCircle2, Mail, Pencil, Repeat, Trash2, Send, ArrowRightCircle } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useUserTimezone } from '@/hooks/use-user-timezone';
import { formatDateTimeInTz } from '@/lib/utils/format-date-tz';
import type { UnifiedReminderItem } from '@/lib/api/reminders';

interface ReminderCardProps {
  item: UnifiedReminderItem;
  selected?: boolean;
  onSelect?: (id: string) => void;
  onEdit?: (item: UnifiedReminderItem) => void;
  onComplete: (id: string, source: UnifiedReminderItem['source']) => void;
  onDelete: (id: string) => void;
  onConvert?: (followUpId: string) => void;
}

function prioritaColor(p: string): 'error' | 'warning' | 'success' | 'default' {
  switch (p) {
    case 'alta': return 'error';
    case 'media': return 'warning';
    case 'bassa': return 'success';
    default: return 'default';
  }
}

/** True when the item is in a terminal/inactive state */
function isItemDone(item: UnifiedReminderItem): boolean {
  if (item.source === 'user') {
    return item.status === 'completato' || item.status === 'annullato';
  }
  return item.status === 'resolved' || item.status === 'expired';
}

export function ReminderCard({ item, selected, onSelect, onEdit, onComplete, onDelete, onConvert }: ReminderCardProps) {
  const t = useTranslations();
  const tr = t.ai.reminders;
  const tz = useUserTimezone();

  const isFollowUp = item.source === 'ai-followup';
  const isDone = isItemDone(item);

  // Map follow-up status to display label
  const statusLabel = isFollowUp
    ? (item.status === 'pending' ? 'Active' : item.status === 'reminded' ? 'Reminded' : item.status)
    : (tr.status[item.status as keyof typeof tr.status] || item.status);

  return (
    <Card
      variant="outlined"
      sx={{
        opacity: isDone ? 0.6 : 1,
        transition: 'opacity 0.2s, border-color 0.2s',
        borderColor: selected ? 'primary.main' : isFollowUp ? 'info.main' : undefined,
        bgcolor: selected ? 'action.selected' : undefined,
      }}
    >
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', flex: 1, minWidth: 0, gap: 1 }}>
            {onSelect && (
              <Checkbox
                checked={!!selected}
                onChange={() => onSelect(item.id)}
                size="small"
                sx={{ mt: -0.5, ml: -0.5 }}
              />
            )}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body1" sx={{ fontWeight: 600 }} noWrap>
                {item.titolo}
              </Typography>
              {item.descrizione && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }} noWrap>
                  {item.descrizione}
                </Typography>
              )}
            </Box>
          </Box>
          {!isDone && (
            <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
              {/* Edit only for user reminders */}
              {!isFollowUp && onEdit && (
                <Tooltip title={tr.actions.edit}>
                  <IconButton size="small" color="primary" onClick={() => onEdit(item)} sx={{ minWidth: 44, minHeight: 44 }}>
                    <Pencil size={18} />
                  </IconButton>
                </Tooltip>
              )}
              {/* Convert follow-up to reminder */}
              {isFollowUp && onConvert && (
                <Tooltip title={tr.followUp.convertToReminder}>
                  <IconButton size="small" color="primary" onClick={() => onConvert(item.id)} sx={{ minWidth: 44, minHeight: 44 }}>
                    <ArrowRightCircle size={18} />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title={isFollowUp ? tr.followUp.resolve : tr.actions.complete}>
                <IconButton size="small" color="success" onClick={() => onComplete(item.id, item.source)} sx={{ minWidth: 44, minHeight: 44 }}>
                  <CheckCircle2 size={18} />
                </IconButton>
              </Tooltip>
              {!isFollowUp && (
                <Tooltip title={tr.actions.delete}>
                  <IconButton size="small" color="error" onClick={() => onDelete(item.id)} sx={{ minWidth: 44, minHeight: 44 }}>
                    <Trash2 size={18} />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          )}
        </Box>

        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1.5 }}>
          {/* Source badge */}
          {isFollowUp && (
            <Chip
              icon={<Bot size={14} />}
              label={tr.followUp.badge}
              size="small"
              color="info"
              sx={{ height: 22 }}
            />
          )}
          <Chip
            label={tr.priorita[item.priorita] || item.priorita}
            size="small"
            color={prioritaColor(item.priorita)}
            sx={{ height: 22 }}
          />
          <Chip
            label={statusLabel}
            size="small"
            variant="outlined"
            sx={{ height: 22 }}
          />
          {/* Follow-up type */}
          {isFollowUp && item.followUpType && (
            <Chip
              label={item.followUpType === 'WAITING_FOR' ? 'Waiting for reply' : 'Action needed'}
              size="small"
              variant="outlined"
              sx={{ height: 22 }}
            />
          )}
          {/* User reminder-specific chips */}
          {!isFollowUp && item.condizioneTipo && item.condizioneTipo !== 'sempre' && (
            <Chip
              label={tr.condizione[item.condizioneTipo as keyof typeof tr.condizione] || item.condizioneTipo}
              size="small"
              variant="outlined"
              sx={{ height: 22 }}
            />
          )}
          {!isFollowUp && item.azione && item.azione !== 'altro' && (
            <Chip
              label={tr.azione[item.azione as keyof typeof tr.azione] || item.azione}
              size="small"
              variant="outlined"
              sx={{ height: 22 }}
            />
          )}
          {item.isRecurring && (
            <Chip
              icon={<Repeat size={14} />}
              label={tr.recurrence.badge}
              size="small"
              color="secondary"
              variant="outlined"
              sx={{ height: 22 }}
            />
          )}
          {!isFollowUp && item.monitoraEmail && (
            <Chip
              icon={<Mail size={14} />}
              label={tr.fields.emailMonitoring}
              size="small"
              color="info"
              variant="outlined"
              sx={{ height: 22 }}
            />
          )}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1, flexWrap: 'wrap' }}>
          {item.contatto && (
            <Typography variant="caption" color="text.secondary">
              {tr.fields.contact}: {item.contatto}
            </Typography>
          )}
          {/* Follow-up: show email subject/from */}
          {isFollowUp && item.emailSubject && (
            <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 300 }}>
              {item.emailSubject}
            </Typography>
          )}
          {isFollowUp && item.emailFrom && (
            <Typography variant="caption" color="text.secondary">
              {tr.fields.from}: {item.emailFrom}
            </Typography>
          )}
          {item.scadenzaDatetime && (
            <Typography variant="caption" color="text.secondary">
              {tr.fields.deadline}: {formatDateTimeInTz(item.scadenzaDatetime, tz)}
            </Typography>
          )}
          {!isFollowUp && item.telegramInviato && (
            <Tooltip title={tr.telegram.sent}>
              <Send size={14} color="var(--mui-palette-success-main, #4caf50)" />
            </Tooltip>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
