'use client';

/**
 * MobileChatDialog - Full-screen mobile chat experience
 * CHAT-03: iOS-safe viewport handling with fixed input
 *
 * Key mobile patterns:
 * - 100dvh for dynamic viewport height (handles iOS keyboard)
 * - env(safe-area-inset-bottom) for home bar padding
 * - -webkit-overflow-scrolling: touch for smooth scrolling
 * - Slide-up transition for native feel
 * - Fixed input that never scrolls away
 */

import React, { type ReactNode } from 'react';
import {
  Dialog,
  Slide,
  Box,
  AppBar,
  Toolbar,
  IconButton,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import type { TransitionProps } from '@mui/material/transitions';
import { X, Sparkles } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

const SlideTransition = React.forwardRef(function Transition(
  props: TransitionProps & { children: React.ReactElement },
  ref: React.Ref<unknown>,
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

interface MobileChatDialogProps {
  open: boolean;
  onClose: () => void;
  header?: ReactNode;
  messages: ReactNode;
  input: ReactNode;
  error?: ReactNode;
}

export function MobileChatDialog({
  open,
  onClose,
  header,
  messages,
  input,
  error,
}: MobileChatDialogProps) {
  const theme = useTheme();
  const t = useTranslations();

  return (
    <Dialog
      fullScreen
      open={open}
      onClose={onClose}
      TransitionComponent={SlideTransition}
      PaperProps={{
        sx: {
          bgcolor: 'background.default',
        },
      }}
    >
      {/* Header - fixed 56px with safe area for notch */}
      <AppBar
        position="static"
        elevation={0}
        sx={{
          bgcolor: 'background.paper',
          borderBottom: '1px solid',
          borderColor: alpha(theme.palette.divider, 0.08),
          pt: 'env(safe-area-inset-top)', // iOS notch
        }}
      >
        <Toolbar sx={{ minHeight: 56, px: 1 }}>
          <IconButton edge="start" onClick={onClose} aria-label="close">
            <X size={20} />
          </IconButton>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 1 }}>
            <Sparkles size={18} color={theme.palette.primary.main} />
            <Typography variant="subtitle1" fontWeight={600}>
              {t.ai?.title || 'AI Assistant'}
            </Typography>
          </Box>
          {header}
        </Toolbar>
      </AppBar>

      {/* Main container - uses 100dvh for dynamic viewport */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          // Full height minus header (56px + safe area top)
          height: 'calc(100dvh - 56px - env(safe-area-inset-top, 0px))',
          overflow: 'hidden',
        }}
      >
        {/* Messages - scrollable area */}
        <Box
          sx={{
            flex: 1,
            overflow: 'auto',
            WebkitOverflowScrolling: 'touch', // Smooth iOS scrolling
            p: 2,
          }}
        >
          {messages}
        </Box>

        {/* Error banner (if any) */}
        {error}

        {/* Input - fixed at bottom with safe area */}
        <Box
          sx={{
            flexShrink: 0,
            bgcolor: 'background.paper',
            borderTop: '1px solid',
            borderColor: alpha(theme.palette.divider, 0.08),
            pb: 'env(safe-area-inset-bottom)', // iOS home bar
            px: 2,
            py: 1.5,
          }}
        >
          {input}
        </Box>
      </Box>
    </Dialog>
  );
}

export default MobileChatDialog;
