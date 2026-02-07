'use client';

/**
 * EmailChatFab - Floating Action Button for Email Chat Panel
 *
 * A FAB that toggles the AI chat panel overlay on email thread views.
 * Shows Sparkles icon when closed, X icon when open.
 *
 * @see 06-02-PLAN Task 1
 */

import { Fab, Zoom, Badge } from '@mui/material';
import { Sparkles, X } from 'lucide-react';

interface EmailChatFabProps {
  /** Whether the chat panel is currently open */
  isOpen: boolean;
  /** Callback to toggle the chat panel */
  onClick: () => void;
  /** Disable the FAB (e.g., while loading) */
  disabled?: boolean;
  /** Show activity indicator (pulse dot) */
  hasActivity?: boolean;
}

/**
 * Floating action button for toggling email chat panel.
 * Positioned in bottom-right with safe area insets for iOS.
 */
export function EmailChatFab({ isOpen, onClick, disabled, hasActivity }: EmailChatFabProps) {
  return (
    <Zoom in={!disabled}>
      <Fab
        color="primary"
        onClick={onClick}
        disabled={disabled}
        sx={{
          position: 'fixed',
          // Bottom-right positioning with safe area insets for iOS
          bottom: { xs: `calc(16px + env(safe-area-inset-bottom, 0px))`, md: 24 },
          right: { xs: 16, md: 24 },
          // Above most content but below dialogs (MUI Dialog uses 1300)
          zIndex: 1200,
          // Smooth transition for icon swap
          transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          '&:hover': {
            transform: 'scale(1.05)',
          },
        }}
        aria-label={isOpen ? 'Close AI assistant' : 'Open AI assistant'}
      >
        <Badge
          color="secondary"
          variant="dot"
          invisible={!hasActivity || isOpen}
          sx={{
            '& .MuiBadge-dot': {
              // Pulse animation for activity indicator
              animation: hasActivity ? 'pulse 1.5s infinite' : 'none',
              '@keyframes pulse': {
                '0%': { transform: 'scale(1)', opacity: 1 },
                '50%': { transform: 'scale(1.3)', opacity: 0.7 },
                '100%': { transform: 'scale(1)', opacity: 1 },
              },
            },
          }}
        >
          {isOpen ? <X size={24} /> : <Sparkles size={24} />}
        </Badge>
      </Fab>
    </Zoom>
  );
}

export default EmailChatFab;
