/**
 * TypingIndicator Component
 *
 * Three-dot animation indicating AI is processing/typing.
 * Uses pure CSS animations for optimal performance.
 */
import React from 'react';
import { Box, Typography } from '@mui/material';
import { Bot } from 'lucide-react';

interface TypingIndicatorProps {
  /** Optional label text */
  label?: string;
  /** Show bot avatar */
  showAvatar?: boolean;
  /** Compact mode (smaller dots) */
  compact?: boolean;
}

export function TypingIndicator({
  label,
  showAvatar = true,
  compact = false,
}: TypingIndicatorProps) {
  const dotSize = compact ? 6 : 8;
  const gap = compact ? 3 : 4;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
      }}
    >
      {showAvatar && (
        <Box
          sx={{
            width: compact ? 20 : 24,
            height: compact ? 20 : 24,
            borderRadius: '50%',
            bgcolor: 'secondary.main',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Bot size={compact ? 12 : 14} color="white" />
        </Box>
      )}

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: `${gap}px`,
          py: 1,
          px: 1.5,
          bgcolor: 'grey.100',
          borderRadius: 2,
        }}
      >
        {[0, 1, 2].map((i) => (
          <Box
            key={i}
            sx={{
              width: dotSize,
              height: dotSize,
              borderRadius: '50%',
              bgcolor: 'text.secondary',
              animation: 'typingBounce 1.4s ease-in-out infinite',
              animationDelay: `${i * 0.2}s`,
              '@keyframes typingBounce': {
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

      {label && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontStyle: 'italic' }}
        >
          {label}
        </Typography>
      )}
    </Box>
  );
}

export default TypingIndicator;
