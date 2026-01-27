'use client';

/**
 * ToolActivityCard - Displays AI tool invocations inline in chat
 * Shows tool name, status (calling/complete), and expandable args/result
 *
 * NOTE: UI display is fine, PII protection happens at backend level
 * (tool results are not re-sent to LLM in conversation history)
 */
import React, { useState } from 'react';
import { Box, Paper, Typography, Collapse, alpha, useTheme, CircularProgress } from '@mui/material';
import { CheckCircle, ChevronDown, AlertCircle } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

export interface ToolActivityCardProps {
  toolName: string;
  args?: unknown;
  result?: unknown;
  state: 'calling' | 'complete' | 'error';
}

/** Get translated tool label or fallback to formatted name */
function getToolLabel(
  toolName: string,
  state: 'calling' | 'complete' | 'error',
  t: ReturnType<typeof useTranslations>
): string {
  const tools = t.ai?.tools as Record<string, { calling?: string; complete?: string }> | undefined;
  const toolTranslation = tools?.[toolName];

  if (toolTranslation) {
    return state === 'calling'
      ? toolTranslation.calling || `Using ${toolName}...`
      : toolTranslation.complete || `${toolName} complete`;
  }

  // Fallback: format tool name (snake_case → Title Case)
  const formatted = toolName.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return state === 'calling' ? `${formatted}...` : formatted;
}

export function ToolActivityCard({ toolName, args, result, state }: ToolActivityCardProps) {
  const theme = useTheme();
  const t = useTranslations();
  const [expanded, setExpanded] = useState(false);

  const label = getToolLabel(toolName, state, t);
  const hasDetails = args !== undefined || result !== undefined;

  return (
    <Paper
      elevation={0}
      sx={{
        p: 1.5,
        my: 1,
        bgcolor: alpha(theme.palette.action.hover, 0.5),
        borderRadius: 2,
        border: '1px solid',
        borderColor: alpha(theme.palette.divider, 0.1),
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          cursor: hasDetails ? 'pointer' : 'default',
        }}
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        {state === 'calling' ? (
          <CircularProgress size={16} thickness={5} />
        ) : state === 'error' ? (
          <AlertCircle size={16} color={theme.palette.error.main} />
        ) : (
          <CheckCircle size={16} color={theme.palette.success.main} />
        )}

        <Typography variant="body2" sx={{ fontWeight: 500, flex: 1 }}>
          {label}
        </Typography>

        {hasDetails && (
          <Box
            component="span"
            sx={{
              display: 'flex',
              transition: 'transform 0.2s',
              transform: expanded ? 'rotate(180deg)' : 'none',
              color: 'text.secondary',
            }}
          >
            <ChevronDown size={16} />
          </Box>
        )}
      </Box>

      <Collapse in={expanded}>
        <Box sx={{ mt: 1.5, pl: 3 }}>
          {args !== undefined && (
            <Box sx={{ mb: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                {t.ai?.tools?.argsLabel || 'Arguments'}
              </Typography>
              <Typography
                component="pre"
                variant="caption"
                sx={{
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  bgcolor: alpha(theme.palette.background.default, 0.5),
                  p: 1,
                  borderRadius: 1,
                  overflow: 'auto',
                  maxHeight: 150,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {JSON.stringify(args, null, 2)}
              </Typography>
            </Box>
          )}

          {result !== undefined && (
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                {t.ai?.tools?.resultLabel || 'Result'}
              </Typography>
              <Typography
                component="pre"
                variant="caption"
                sx={{
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  bgcolor: alpha(theme.palette.success.main, 0.08),
                  color: theme.palette.success.main,
                  p: 1,
                  borderRadius: 1,
                  overflow: 'auto',
                  maxHeight: 150,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {JSON.stringify(result, null, 2)}
              </Typography>
            </Box>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
}

export default ToolActivityCard;
