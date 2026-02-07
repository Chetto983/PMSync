'use client';

/**
 * TypingIndicator - Elegant AI streaming indicator with Shimmer animation
 *
 * Uses the Shimmer component from ai-elements for smooth text animation.
 * Shows dynamic action text when available (e.g., "Searching emails...").
 *
 * @see @/src/components/ai-elements/shimmer
 */

import React from 'react';
import { Box, useTheme } from '@mui/material';
import { Bot } from 'lucide-react';
import { Shimmer } from '@/src/components/ai-elements/shimmer';
import { useTranslations } from '@/lib/hooks/use-translations';

interface TypingIndicatorProps {
  /** Whether the indicator is active/visible */
  isActive: boolean;
  /** Dynamic action text from agent activity (e.g., "Searching emails...") */
  action?: string;
  /** Compact mode - just shimmer text, no avatar */
  compact?: boolean;
}

export function TypingIndicator({ isActive, action, compact = false }: TypingIndicatorProps) {
  const theme = useTheme();
  const t = useTranslations();

  if (!isActive) return null;

  // Use action text if available, otherwise default to "Thinking..."
  const displayText = action || t.ai?.chat?.progress?.working || 'Thinking...';

  if (compact) {
    // Just shimmer text, no avatar
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', py: 1 }}>
        <Shimmer duration={1.5}>{displayText}</Shimmer>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        gap: 1.5,
        alignItems: 'flex-start',
        py: 1,
      }}
    >
      {/* Avatar - matches assistant message style */}
      <Box
        sx={{
          width: 36,
          height: 36,
          borderRadius: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
          color: 'white',
        }}
      >
        <Bot size={18} />
      </Box>

      {/* Shimmer text */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          minHeight: 36,
          px: 1,
        }}
      >
        <Shimmer duration={1.5} className="text-sm text-muted-foreground">
          {displayText}
        </Shimmer>
      </Box>
    </Box>
  );
}

export default TypingIndicator;
