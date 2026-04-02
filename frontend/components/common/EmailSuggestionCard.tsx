import { memo, useCallback } from 'react';
import { Box, IconButton, LinearProgress, Tooltip, Typography } from '@mui/material';
import { CheckCircle, Handshake, ListTodo, Ticket, UserPlus, X } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { CrmSuggestion } from '@/lib/api/crm-suggestions';

const TYPE_ICONS: Record<string, typeof ListTodo> = {
  task: ListTodo,
  deal: Handshake,
  ticket: Ticket,
  link_contact: UserPlus,
  link: UserPlus,
};

export interface EmailSuggestionCardProps {
  suggestion: CrmSuggestion;
  onAccept: (id: string) => void;
  onDismiss: (id: string) => void;
  disabled?: boolean;
}

export const EmailSuggestionCard = memo(function EmailSuggestionCard({
  suggestion,
  onAccept,
  onDismiss,
  disabled,
}: EmailSuggestionCardProps) {
  const t = useTranslations();
  const ts = t.crmSuggestions;

  const Icon = TYPE_ICONS[suggestion.type] ?? ListTodo;
  const title = (suggestion.entityData.title as string) || ts?.types?.[suggestion.type as keyof NonNullable<typeof ts>['types']] || suggestion.type;
  const reasoning = suggestion.entityData.reasoning as string | undefined;
  const confidencePct = Math.round(suggestion.confidence * 100);

  const handleAccept = useCallback(() => onAccept(suggestion.id), [onAccept, suggestion.id]);
  const handleDismiss = useCallback(() => onDismiss(suggestion.id), [onDismiss, suggestion.id]);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 0.5,
        p: 1,
        mb: 0.75,
        borderRadius: 1,
        bgcolor: 'action.hover',
        '&:last-child': { mb: 0 },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: 0.75,
            bgcolor: 'background.paper',
            flexShrink: 0,
          }}
        >
          <Icon size={14} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" fontWeight={600} noWrap>
            {title}
          </Typography>
          {reasoning && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {reasoning}
            </Typography>
          )}
        </Box>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ flex: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
              {ts?.confidence ?? 'Confidence'}
            </Typography>
            <Typography variant="caption" fontWeight={600} sx={{ fontSize: '0.65rem' }}>
              {confidencePct}%
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={confidencePct}
            sx={{ height: 3, borderRadius: 1.5 }}
            color={confidencePct >= 70 ? 'success' : confidencePct >= 40 ? 'warning' : 'inherit'}
          />
        </Box>
        <Tooltip title={ts?.accept ?? 'Accept'}>
          <IconButton size="small" color="success" onClick={handleAccept} disabled={disabled}>
            <CheckCircle size={16} />
          </IconButton>
        </Tooltip>
        <Tooltip title={ts?.dismiss ?? 'Dismiss'}>
          <IconButton size="small" onClick={handleDismiss} disabled={disabled}>
            <X size={14} />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
});
