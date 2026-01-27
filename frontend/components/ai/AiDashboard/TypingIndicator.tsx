'use client';

/**
 * TypingIndicator - Simple, elegant AI streaming indicator
 *
 * Best practices from 2025 AI UX research:
 * - 1.4s pulse animation (feels natural)
 * - Simple "AI is thinking..." text
 * - Inline with messages, not a separate card
 *
 * @see https://www.patterns.dev/react/ai-ui-patterns/
 */

import React from 'react';
import { Box, Typography, alpha, useTheme } from '@mui/material';
import { Bot } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

interface TypingIndicatorProps {
  isActive: boolean;
  /** Optional current action text */
  action?: string;
  /** Compact mode - just dots, no text */
  compact?: boolean;
}

export function TypingIndicator({ isActive, action, compact = false }: TypingIndicatorProps) {
  const theme = useTheme();
  const t = useTranslations();

  if (!isActive) return null;

  if (compact) {
    // Just animated dots
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 1 }}>
        {[0, 1, 2].map((i) => (
          <Box
            key={i}
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: 'primary.main',
              animation: 'typing-bounce 1.4s ease-in-out infinite',
              animationDelay: `${i * 0.2}s`,
              '@keyframes typing-bounce': {
                '0%, 60%, 100%': {
                  transform: 'translateY(0)',
                  opacity: 0.4,
                },
                '30%': {
                  transform: 'translateY(-6px)',
                  opacity: 1,
                },
              },
            }}
          />
        ))}
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1.5,
        py: 1,
      }}
    >
      {/* AI Avatar with pulse */}
      <Box
        sx={{
          width: 36,
          height: 36,
          borderRadius: 2,
          background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          flexShrink: 0,
          animation: 'avatar-pulse 2s ease-in-out infinite',
          '@keyframes avatar-pulse': {
            '0%, 100%': {
              boxShadow: `0 2px 12px ${alpha(theme.palette.primary.main, 0.3)}`,
            },
            '50%': {
              boxShadow: `0 4px 20px ${alpha(theme.palette.primary.main, 0.5)}`,
            },
          },
        }}
      >
        <Bot size={18} />
      </Box>

      {/* Typing bubble */}
      <Box
        sx={{
          maxWidth: '80%',
          p: 1.5,
          borderRadius: 3,
          borderBottomLeftRadius: 0.5,
          bgcolor: alpha(theme.palette.background.default, 0.8),
          border: '1px solid',
          borderColor: alpha(theme.palette.divider, 0.08),
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {/* Animated dots */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {[0, 1, 2].map((i) => (
              <Box
                key={i}
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  bgcolor: 'primary.main',
                  animation: 'typing-bounce 1.4s ease-in-out infinite',
                  animationDelay: `${i * 0.2}s`,
                  '@keyframes typing-bounce': {
                    '0%, 60%, 100%': {
                      transform: 'translateY(0)',
                      opacity: 0.4,
                    },
                    '30%': {
                      transform: 'translateY(-4px)',
                      opacity: 1,
                    },
                  },
                }}
              />
            ))}
          </Box>

          {/* Action text */}
          <Typography
            variant="body2"
            sx={{
              color: 'text.secondary',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
            }}
          >
            {action || t.ai?.chat?.progress?.working || 'Thinking...'}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

export default TypingIndicator;
