'use client';

/**
 * AI Dashboard - Modern 2025 Design
 * Clean, widget-based layout following main dashboard pattern
 * With conversation session management (PostgreSQL persistence)
 *
 * Uses Vercel AI SDK useChat hook - official VoltAgent pattern
 * Based on: https://voltagent.dev/docs/ui/ai-sdk-integration/
 *
 * REFACTORED 07-01: Split into 6 focused files (CHAT-04)
 * - useChatController.ts: All state and handlers
 * - ChatArea.tsx: Messages + error + input container (desktop)
 * - ChatInput.tsx: Input box only (shared)
 * - DesktopLayout.tsx: Grid layout for lg+ screens
 * - MobileLayout.tsx: FAB + dialog for mobile
 */

import React, { Suspense, lazy } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Skeleton,
  alpha,
  useTheme,
  IconButton,
  Badge,
  useMediaQuery,
} from '@mui/material';
import { Sparkles, Zap, PanelRightOpen } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useAuth } from '@/lib/hooks/use-auth';

// Local components
import { useChatController } from './useChatController';
import { ChatArea } from './ChatArea';
import { ChatInput } from './ChatInput';
import { DesktopLayout } from './DesktopLayout';
import { MobileLayout } from './MobileLayout';

// Lazy loaded components
const ChatCommandPalette = lazy(() => import('../ChatCommandPalette'));
const AskUserModal = lazy(() => import('./AskUserModal'));
const QuickActions = lazy(() => import('./QuickActions'));
const ChatMessages = lazy(() => import('./ChatMessages'));

// Re-export types from hook for ChatMessages
export type { AskUserData, UIMessage, MessageMetadata } from '@/hooks/use-voltagent-chat';
export { getMessageMetadata, getMessageText } from '@/hooks/use-voltagent-chat';

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
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
        <Skeleton variant="rounded" width={40} height={40} sx={{ borderRadius: 2 }} />
        <Box sx={{ flex: 1 }}>
          <Skeleton width="50%" height={20} />
          <Skeleton width="70%" height={14} sx={{ mt: 0.5 }} />
        </Box>
      </Box>
      <Skeleton variant="rounded" height={height - 100} sx={{ borderRadius: 2 }} />
    </Paper>
  );
}

export function AiDashboard() {
  const { user } = useAuth();
  const t = useTranslations();
  const theme = useTheme();

  const userName = user?.firstName || user?.email?.split('@')[0] || 'User';

  // Mobile detection
  const isMobile = useMediaQuery(theme.breakpoints.down('lg'));
  const isMobileChat = useMediaQuery(theme.breakpoints.down('md'));

  // Chat controller hook - all state and handlers
  const controller = useChatController({
    locale: t.locale,
    isMobileChat,
  });

  // Mobile: Render just the messages portion
  const renderMobileChatMessages = () =>
    controller.chatMessages.length === 0 ? (
      <Suspense fallback={<WidgetSkeleton height={300} />}>
        <QuickActions
          onSelectQuery={controller.handleSendMessage}
          userName={userName}
          viewContext={controller.viewContext}
        />
      </Suspense>
    ) : (
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Suspense fallback={<WidgetSkeleton height={300} />}>
          <ChatMessages
            messages={controller.chatMessages}
            sending={controller.sending}
            conversationId={controller.conversationId}
            onSuggestedQuestionSelect={controller.handleSendMessage}
          />
        </Suspense>
      </Box>
    );

  // Mobile: Render just the input portion (no messages, no error - those are separate slots)
  const renderMobileChatInput = () => (
    <ChatInput
      chatMessages={controller.chatMessages}
      sending={controller.sending}
      prompt={controller.prompt}
      status={controller.status}
      onSendMessage={controller.handleSendMessage}
      onPromptChange={controller.handlePromptChange}
      onStop={controller.stop}
      inputRef={controller.inputRef}
      hideQuickActions // Mobile dialog has less space
    />
  );

  // Mobile: Render error banner if needed
  const renderMobileErrorBanner = () =>
    controller.lastError && controller.lastError.retryable ? (
      <Box
        sx={{
          mx: 2,
          mb: 1,
          p: 2,
          borderRadius: 2,
          bgcolor: alpha(theme.palette.warning.main, 0.1),
          border: '1px solid',
          borderColor: alpha(theme.palette.warning.main, 0.3),
        }}
      >
        <Typography variant="body2" fontWeight={600} color="warning.main">
          {controller.lastError.code === 'CIRCUIT_OPEN'
            ? (t.ai?.errors?.circuitOpen || 'AI service temporarily unavailable')
            : (t.ai?.errors?.connectionLost || 'Connection error')}
        </Typography>
      </Box>
    ) : null;

  return (
    <Box
      sx={{
        maxWidth: 1800,
        mx: 'auto',
        px: { xs: 1.5, sm: 2, md: 4 },
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Header */}
      <Box sx={{ pt: { xs: 1.5, md: 2 }, pb: { xs: 2, md: 2.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box
            sx={{
              width: { xs: 36, md: 40 },
              height: { xs: 36, md: 40 },
              borderRadius: 2,
              background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 8px 32px ${alpha(theme.palette.primary.main, 0.35)}`,
              flexShrink: 0,
            }}
          >
            <Sparkles size={isMobile ? 18 : 20} color="white" />
          </Box>
          <Box sx={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography
              variant="h5"
              noWrap
              sx={{
                fontWeight: 700,
                fontSize: { xs: '1.1rem', md: '1.5rem' },
                background: `linear-gradient(135deg, ${theme.palette.text.primary} 0%, ${alpha(theme.palette.text.primary, 0.7)} 100%)`,
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {t.ai?.title || 'Assistente AI'}
            </Typography>
            <Chip
              icon={<Zap size={12} />}
              label={t.ai?.online || 'Online'}
              size="small"
              color="success"
              sx={{ fontWeight: 600, height: 24 }}
            />
          </Box>
          {isMobile && (
            <IconButton
              onClick={() => controller.setWidgetsDrawerOpen(true)}
              sx={{
                bgcolor: alpha(theme.palette.primary.main, 0.1),
                borderRadius: 2,
                '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.2) },
              }}
            >
              <Badge
                badgeContent={controller.chatMessages.length > 0 ? undefined : 0}
                color="primary"
                variant="dot"
                invisible={controller.chatMessages.length === 0}
              >
                <PanelRightOpen size={20} />
              </Badge>
            </IconButton>
          )}
        </Box>
      </Box>

      {/* Main Content - Mobile or Desktop Layout */}
      {isMobileChat ? (
        <MobileLayout
          open={controller.mobileChatOpen}
          onOpen={() => {
            controller.setMobileDialogDismissed(false);
            controller.setMobileChatOpen(true);
          }}
          onClose={() => {
            controller.setMobileDialogDismissed(true);
            controller.setMobileChatOpen(false);
          }}
          chatMessages={renderMobileChatMessages()}
          chatInput={renderMobileChatInput()}
          errorBanner={renderMobileErrorBanner()}
        />
      ) : (
        <DesktopLayout
          chatArea={
            <ChatArea
              chatMessages={controller.chatMessages}
              sending={controller.sending}
              conversationId={controller.conversationId}
              prompt={controller.prompt}
              status={controller.status}
              lastError={controller.lastError}
              viewContext={controller.viewContext}
              userName={userName}
              onSendMessage={controller.handleSendMessage}
              onPromptChange={controller.handlePromptChange}
              onRetry={controller.handleRetry}
              onStop={controller.stop}
              inputRef={controller.inputRef}
            />
          }
          conversationId={controller.conversationId}
          widgetsDrawerOpen={controller.widgetsDrawerOpen}
          onSelectConversation={controller.handleSelectConversation}
          onNewChat={controller.handleNewChat}
          onWidgetsDrawerClose={() => controller.setWidgetsDrawerOpen(false)}
          onWidgetsDrawerOpen={() => controller.setWidgetsDrawerOpen(true)}
        />
      )}

      {/* Command Palette - Quick commands via "/" */}
      <Suspense fallback={null}>
        <ChatCommandPalette
          open={controller.commandPaletteOpen}
          onClose={() => controller.setCommandPaletteOpen(false)}
          onSelectCommand={controller.handleCommandSelect}
        />
      </Suspense>

      {/* AskUser Modal - Claude Code style clarifying questions */}
      <Suspense fallback={null}>
        <AskUserModal
          open={controller.askUserModalOpen}
          data={controller.lastAskUser || null}
          onSubmit={controller.handleAskUserResponse}
          onClose={() => controller.setAskUserModalOpen(false)}
        />
      </Suspense>
    </Box>
  );
}

export default AiDashboard;
