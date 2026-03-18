'use client';

import { useCallback } from 'react';
import { makeAssistantToolUI, useThreadRuntime } from '@assistant-ui/react';
import {
  Brain,
  CheckCircle2,
  HelpCircle,
  AlertCircle,
  ChevronRight,
} from 'lucide-react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { AskUserResult, SavedMemoryResult } from '../types';

function AskUserCard({
  result,
  status,
}: {
  result: AskUserResult | undefined;
  status: { type: string; reason?: string };
}) {
  const t = useTranslations();
  const runtime = useThreadRuntime();

  const answerWithOption = useCallback(
    (option: string) => {
      void runtime.append({
        role: 'user',
        content: [{ type: 'text', text: option }],
      });
    },
    [runtime],
  );

  if (status.type === 'running') {
    return (
      <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, bgcolor: 'action.hover' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <HelpCircle size={16} color="var(--mui-palette-warning-main)" />
          <Typography variant="body2" color="text.secondary">
            {t.ai.askUser.title}
          </Typography>
        </Box>
      </Paper>
    );
  }

  if (status.type === 'incomplete') {
    return (
      <Paper
        variant="outlined"
        sx={{ borderRadius: '10px', p: 1.5, borderColor: 'error.light', bgcolor: 'error.light' }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AlertCircle size={16} />
          <Typography variant="body2" color="error.main">
            {status.reason ?? t.ai.errors.chatFailed}
          </Typography>
        </Box>
      </Paper>
    );
  }

  if (!result) {
    return null;
  }

  return (
    <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, boxShadow: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <HelpCircle size={16} color="var(--mui-palette-warning-main)" />
        <Typography variant="body2" fontWeight={600}>
          {t.ai.askUser.title}
        </Typography>
      </Box>
      <Typography variant="body2" sx={{ lineHeight: 1.5 }}>
        {result.question}
      </Typography>
      {result.context && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
          {result.context}
        </Typography>
      )}
      {result.options.length > 0 && (
        <Stack spacing={1} sx={{ mt: 1.5 }}>
          {result.options.map((option) => (
            <Button
              key={option}
              variant="outlined"
              size="small"
              onClick={() => answerWithOption(option)}
              endIcon={<ChevronRight size={14} />}
              sx={{
                justifyContent: 'space-between',
                textTransform: 'none',
                borderRadius: 2,
              }}
            >
              {option}
            </Button>
          ))}
        </Stack>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
        {t.ai.askUser.other}
      </Typography>
    </Paper>
  );
}

function SaveMemoryCard({
  result,
  status,
}: {
  result: SavedMemoryResult | undefined;
  status: { type: string; reason?: string };
}) {
  const t = useTranslations();

  if (status.type === 'running') {
    return (
      <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, bgcolor: 'action.hover' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Brain size={16} color="var(--mui-palette-primary-main)" />
          <Typography variant="body2" color="text.secondary">
            {t.ai.memory.title}
          </Typography>
        </Box>
      </Paper>
    );
  }

  if (status.type === 'incomplete') {
    return (
      <Paper
        variant="outlined"
        sx={{ borderRadius: '10px', p: 1.5, borderColor: 'error.light', bgcolor: 'error.light' }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AlertCircle size={16} />
          <Typography variant="body2" color="error.main">
            {status.reason ?? t.ai.errors.chatFailed}
          </Typography>
        </Box>
      </Paper>
    );
  }

  if (!result) {
    return null;
  }

  return (
    <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, boxShadow: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <CheckCircle2 size={16} color="var(--mui-palette-success-main)" />
        <Typography variant="body2" fontWeight={600}>
          {t.ai.memory.title}
        </Typography>
      </Box>
      <Typography variant="body2" sx={{ lineHeight: 1.5 }}>
        {result.content}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
        {result.category && (
          <Box
            component="span"
            sx={{
              px: 0.75,
              py: 0.25,
              borderRadius: 1,
              bgcolor: 'action.hover',
              color: 'text.secondary',
              fontSize: '0.7rem',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {result.category}
          </Box>
        )}
        <Typography variant="caption" color="text.secondary">
          {t.ai.memory.subtitle}
        </Typography>
      </Box>
    </Paper>
  );
}

export const AskUserToolUI = makeAssistantToolUI<
  { question: string; options?: string[]; context?: string },
  AskUserResult
>({
  toolName: 'ask_user',
  render: (props) => <AskUserCard status={props.status} result={props.result} />,
});

export const SaveMemoryToolUI = makeAssistantToolUI<
  { content: string; category?: string; tags?: string },
  SavedMemoryResult
>({
  toolName: 'save_memory',
  render: (props) => <SaveMemoryCard status={props.status} result={props.result} />,
});
