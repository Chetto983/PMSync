'use client';

/**
 * DesktopLayout - Grid layout for desktop (lg+) screens
 *
 * Extracted from AiDashboard/index.tsx to reduce file size (CHAT-04).
 * Contains the main grid layout with chat area and sidebar widgets.
 *
 * @see 07-01-PLAN.md for refactoring context
 */

import React, { Suspense, lazy, type ReactNode } from 'react';
import {
  Box,
  Paper,
  SwipeableDrawer,
  IconButton,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import { X, MessageSquare } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

// Lazy loaded widgets
const ChatSessionList = lazy(() => import('./ChatSessionList'));
const LearningWidget = lazy(() => import('./LearningWidget'));

function WidgetSkeleton({ height = 200 }: { height?: number }) {
  const theme = useTheme();
  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 4,
        border: '1px solid',
        borderColor: alpha(theme.palette.divider, 0.08),
        bgcolor: 'background.paper',
        p: 2.5,
        height,
      }}
    />
  );
}

export interface DesktopLayoutProps {
  chatArea: ReactNode;
  conversationId: string | null;
  widgetsDrawerOpen: boolean;
  onSelectConversation: (id: string | null) => Promise<void>;
  onNewChat: () => void;
  onWidgetsDrawerClose: () => void;
  onWidgetsDrawerOpen: () => void;
}

export function DesktopLayout({
  chatArea,
  conversationId,
  widgetsDrawerOpen,
  onSelectConversation,
  onNewChat,
  onWidgetsDrawerClose,
  onWidgetsDrawerOpen,
}: DesktopLayoutProps) {
  const theme = useTheme();
  const t = useTranslations();

  return (
    <>
      {/* Main Grid Layout */}
      <Box
        sx={{
          display: 'grid',
          gap: { xs: 2, md: 3 },
          gridTemplateColumns: {
            xs: '1fr',
            md: '1fr',
            lg: '1fr minmax(300px, 380px)',
          },
          flex: 1,
          minHeight: 0,
          pb: 2,
        }}
      >
        {/* Chat Area - Fixed height with internal scroll */}
        <Paper
          elevation={0}
          sx={{
            borderRadius: 4,
            border: '1px solid',
            borderColor: alpha(theme.palette.divider, 0.08),
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            height: '100%',
            minHeight: 0,
          }}
        >
          {chatArea}
        </Paper>

        {/* Sidebar Widgets - Hidden on mobile, visible on desktop */}
        <Box
          sx={{
            display: { xs: 'none', lg: 'flex' },
            flexDirection: 'column',
            gap: 2,
            height: '100%',
            overflow: 'auto',
            minHeight: 0,
            pb: 2,
            '&::-webkit-scrollbar': { width: 6 },
            '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
            '&::-webkit-scrollbar-thumb': {
              bgcolor: alpha(theme.palette.text.secondary, 0.1),
              borderRadius: 3,
            },
          }}
        >
          <Suspense fallback={<WidgetSkeleton height={200} />}>
            <ChatSessionList
              activeConversationId={conversationId}
              onSelectConversation={onSelectConversation}
              onNewChat={onNewChat}
            />
          </Suspense>

          <Suspense fallback={<WidgetSkeleton height={60} />}>
            <LearningWidget />
          </Suspense>
        </Box>
      </Box>

      {/* Mobile Widgets Drawer (for tablet breakpoint) */}
      <SwipeableDrawer
        anchor="right"
        open={widgetsDrawerOpen}
        onClose={onWidgetsDrawerClose}
        onOpen={onWidgetsDrawerOpen}
        disableSwipeToOpen={false}
        swipeAreaWidth={20}
        ModalProps={{ keepMounted: true }}
        PaperProps={{
          sx: {
            width: { xs: '85vw', sm: 380 },
            maxWidth: 400,
            bgcolor: 'background.default',
            borderTopLeftRadius: 24,
            borderBottomLeftRadius: 24,
          },
        }}
      >
        {/* Drawer Header */}
        <Box
          sx={{
            p: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid',
            borderColor: alpha(theme.palette.divider, 0.1),
            position: 'sticky',
            top: 0,
            bgcolor: 'background.default',
            zIndex: 1,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: 2,
                background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
              }}
            >
              <MessageSquare size={20} />
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {t.ai?.widgets?.title || 'AI Tools'}
            </Typography>
          </Box>
          <IconButton
            onClick={onWidgetsDrawerClose}
            sx={{ bgcolor: alpha(theme.palette.action.active, 0.08), borderRadius: 2 }}
          >
            <X size={20} />
          </IconButton>
        </Box>

        {/* Drawer Content */}
        <Box
          sx={{
            p: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            overflow: 'auto',
            flex: 1,
          }}
        >
          <Suspense fallback={<WidgetSkeleton height={200} />}>
            <ChatSessionList
              activeConversationId={conversationId}
              onSelectConversation={(id) => {
                onSelectConversation(id);
                onWidgetsDrawerClose();
              }}
              onNewChat={() => {
                onNewChat();
                onWidgetsDrawerClose();
              }}
            />
          </Suspense>

          <Suspense fallback={<WidgetSkeleton height={60} />}>
            <LearningWidget />
          </Suspense>
        </Box>
      </SwipeableDrawer>
    </>
  );
}

export default DesktopLayout;
