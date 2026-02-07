'use client';

/**
 * MobileLayout - FAB + dialog for mobile screens
 *
 * Extracted from AiDashboard/index.tsx to reduce file size (CHAT-04).
 * Contains the floating action button and full-screen mobile chat dialog.
 *
 * @see 07-01-PLAN.md for refactoring context
 */

import React, { Suspense, lazy, type ReactNode } from 'react';
import { Fab, alpha, useTheme } from '@mui/material';
import { MessageSquare } from 'lucide-react';

// Lazy loaded mobile dialog
const MobileChatDialog = lazy(() => import('./MobileChatDialog'));

export interface MobileLayoutProps {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  chatMessages: ReactNode;
  chatInput: ReactNode;
  errorBanner: ReactNode;
}

export function MobileLayout({
  open,
  onOpen,
  onClose,
  chatMessages,
  chatInput,
  errorBanner,
}: MobileLayoutProps) {
  const theme = useTheme();

  return (
    <>
      {/* FAB to open chat - positioned at bottom-right with safe area */}
      <Fab
        color="primary"
        aria-label="open chat"
        onClick={onOpen}
        sx={{
          position: 'fixed',
          bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
          right: 24,
          zIndex: theme.zIndex.fab,
          boxShadow: `0 8px 32px ${alpha(theme.palette.primary.main, 0.35)}`,
        }}
      >
        <MessageSquare size={24} />
      </Fab>

      {/* Full-screen mobile chat dialog */}
      <Suspense fallback={null}>
        <MobileChatDialog
          open={open}
          onClose={onClose}
          messages={chatMessages}
          input={chatInput}
          error={errorBanner}
        />
      </Suspense>
    </>
  );
}

export default MobileLayout;
