'use client';

import { Box, Chip, alpha, useTheme, Tooltip } from '@mui/material';
import { Sparkles } from 'lucide-react';
//import { useTranslations } from '@/lib/hooks/use-translations';

interface SuggestedQuestionsProps {
  questions: string[];
  onSelect: (question: string) => void;
  disabled?: boolean;
}

/**
 * Displays suggested follow-up questions as clickable chips.
 * Inspired by Claude Code / OpenWebUI patterns.
 *
 * @param questions - Array of suggested question strings
 * @param onSelect - Callback when user clicks a suggestion
 * @param disabled - Disable interactions (e.g., during streaming)
 */
export function SuggestedQuestions({ questions, onSelect, disabled }: SuggestedQuestionsProps) {
  const theme = useTheme();
  //const t = useTranslations();

  if (!questions?.length) return null;

  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 1,
        mt: 1.5,
        pt: 1.5,
        borderTop: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
      }}
    >
      {questions.map((q, i) => (
        <Tooltip key={i} title={q} placement="top" enterDelay={500}>
          <Chip
            icon={<Sparkles size={12} />}
            label={q}
            size="small"
            variant="outlined"
            onClick={() => !disabled && onSelect(q)}
            disabled={disabled}
            sx={{
              maxWidth: 220,
              cursor: disabled ? 'not-allowed' : 'pointer',
              borderColor: alpha(theme.palette.primary.main, 0.3),
              transition: 'all 0.15s ease',
              '&:hover': {
                bgcolor: alpha(theme.palette.primary.main, 0.08),
                borderColor: 'primary.main',
                transform: 'translateY(-1px)',
              },
              '&:active': {
                transform: 'translateY(0)',
              },
              '& .MuiChip-label': {
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: '0.8125rem',
              },
              '& .MuiChip-icon': {
                color: theme.palette.primary.main,
              },
            }}
          />
        </Tooltip>
      ))}
    </Box>
  );
}
