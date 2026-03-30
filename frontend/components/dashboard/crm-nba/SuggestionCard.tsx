'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  Box,
  Typography,
  IconButton,
  Collapse,
  LinearProgress,
  Tooltip,
  Button,
} from '@mui/material';
import {
  Mail,
  Phone,
  Calendar,
  Percent,
  ArrowUpRight,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Check,
  X,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { NBAAction, NBAActionType } from '@/lib/api/crm-nba';

const ACTION_ICONS: Record<NBAActionType, typeof Mail> = {
  EMAIL: Mail,
  CALL: Phone,
  MEETING: Calendar,
  DISCOUNT: Percent,
  ESCALATE: ArrowUpRight,
  FOLLOW_UP: MessageSquare,
};

interface SuggestionCardProps {
  action: NBAAction;
  onExecute: (actionId: string) => void;
  onDismiss: (actionId: string) => void;
  disabled?: boolean;
}

export function SuggestionCard({
  action,
  onExecute,
  onDismiss,
  disabled,
}: SuggestionCardProps) {
  const t = useTranslations();
  const [expanded, setExpanded] = useState(false);

  const tn = t.nba;
  const Icon = ACTION_ICONS[action.actionType] ?? MessageSquare;
  const actionLabel =
    tn?.actionTypes?.[action.actionType] ?? action.actionType;

  return (
    <Card
      variant="outlined"
      sx={{
        mb: 1,
        '&:last-child': { mb: 0 },
        opacity: action.status !== 'SUGGESTED' ? 0.6 : 1,
      }}
    >
      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
        {/* Header: icon + title + expand */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              borderRadius: 1,
              bgcolor: 'action.hover',
              flexShrink: 0,
              mt: 0.25,
            }}
          >
            <Icon size={16} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" fontWeight={600} noWrap>
              {actionLabel}
            </Typography>
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
              {action.title}
            </Typography>
          </Box>
          <IconButton
            size="small"
            onClick={() => setExpanded(!expanded)}
            sx={{ flexShrink: 0 }}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </IconButton>
        </Box>

        {/* Impact bar */}
        <Box sx={{ mt: 1 }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              mb: 0.5,
            }}
          >
            <Typography variant="caption" color="text.secondary">
              {tn?.impact ?? 'Impact'}
            </Typography>
            <Typography variant="caption" fontWeight={600}>
              {action.expectedImpact}%
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={action.expectedImpact}
            sx={{ height: 4, borderRadius: 2 }}
            color={
              action.expectedImpact >= 70
                ? 'success'
                : action.expectedImpact >= 40
                  ? 'warning'
                  : 'inherit'
            }
          />
        </Box>

        {/* Expanded reasoning */}
        <Collapse in={expanded}>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 1, fontSize: '0.8rem', lineHeight: 1.5 }}
          >
            {action.reasoning}
          </Typography>
        </Collapse>

        {/* Actions — only for SUGGESTED status */}
        {action.status === 'SUGGESTED' && (
          <Box
            sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5, mt: 1 }}
          >
            <Tooltip title={tn?.actions?.dismiss ?? 'Dismiss'}>
              <IconButton
                size="small"
                onClick={() => onDismiss(action.id)}
                disabled={disabled}
              >
                <X size={14} />
              </IconButton>
            </Tooltip>
            <Button
              size="small"
              variant="contained"
              startIcon={<Check size={14} />}
              onClick={() => onExecute(action.id)}
              disabled={disabled}
              sx={{ textTransform: 'none', fontSize: '0.75rem' }}
            >
              {tn?.actions?.execute ?? 'Execute'}
            </Button>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
