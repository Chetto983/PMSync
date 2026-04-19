'use client';

import { useState, useEffect, useRef } from 'react';
import { Drawer, Box, IconButton, Tooltip } from '@mui/material';
import { MessagesSquare } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useAiOverlay } from '@/stores/ai-overlay-store';
import { AiOverlayHeader } from './AiOverlayHeader';
import { ResizeHandle } from './ResizeHandle';
import { ChatRuntimeProvider } from '@/src/components/chat/ChatRuntimeProvider';
import { ChatThemeBridge } from '@/src/components/chat/ChatThemeBridge';
import { ChatDesktopLayout } from '@/src/components/chat/ChatDesktopLayout';
import { ChatThread } from '@/src/components/chat/ChatThread';
import { ChatThreadList } from '@/src/components/chat/ChatThreadList';

const WIDE_THRESHOLD = 560;

/**
 * Root AI overlay component.
 *
 * Uses keepMounted so the ChatRuntimeProvider mounts once and persists
 * across open/close cycles — avoids the destroy/recreate infinite loop
 * triggered by StrictMode + MUI transition re-renders (assistant-ui #3395).
 *
 * The chatReady flag defers the runtime mount until the FIRST slide-in
 * animation completes (via requestAnimationFrame after onEntered).
 * Once mounted, it stays alive for all subsequent opens.
 */
export function AiOverlayDrawer() {
  const t = useTranslations();
  const isOpen = useAiOverlay((s) => s.isOpen);
  const width = useAiOverlay((s) => s.width);
  const close = useAiOverlay((s) => s.close);
  const setWidth = useAiOverlay((s) => s.setWidth);

  const [showThreadList, setShowThreadList] = useState(false);
  // Mount ChatRuntimeProvider once on first open, then keep alive.
  const [chatReady, setChatReady] = useState(false);
  const chatMountedRef = useRef(false);

  // Reset thread list view when width crosses above threshold
  useEffect(() => {
    if (width >= WIDE_THRESHOLD) {
      setShowThreadList(false);
    }
  }, [width]);

  const isWide = width >= WIDE_THRESHOLD;

  const handleEntered = () => {
    if (chatMountedRef.current) return;
    // Extra frame lets StrictMode double-mount settle before runtime init
    requestAnimationFrame(() => {
      chatMountedRef.current = true;
      setChatReady(true);
    });
  };

  return (
    <Drawer
      anchor="right"
      open={isOpen}
      onClose={close}
      variant="temporary"
      keepMounted
      aria-label={t.ai.overlay.title}
      SlideProps={{ onEntered: handleEntered }}
      PaperProps={{
        sx: {
          width,
          maxWidth: '100vw',
          display: 'flex',
          flexDirection: 'row',
          overflow: 'hidden',
          borderLeft: 1,
          borderColor: 'divider',
          background:
            'linear-gradient(180deg, color-mix(in srgb, var(--mui-palette-background-paper) 96%, white 4%) 0%, var(--mui-palette-background-paper) 100%)',
          boxShadow: '-18px 0 44px rgba(15, 23, 42, 0.14)',
        },
      }}
    >
      <ResizeHandle currentWidth={width} onResize={setWidth} />

      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
        <AiOverlayHeader />

        {chatReady ? (
          <ChatRuntimeProvider>
            <ChatThemeBridge>
              <Box
                sx={{
                  flex: 1,
                  minHeight: 0,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {/* Narrow mode: thread list toggle */}
                {!isWide && (
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      px: 1.5,
                      py: 1,
                      borderBottom: 1,
                      borderColor: 'divider',
                      flexShrink: 0,
                      backgroundColor: 'background.paper',
                    }}
                  >
                    <Tooltip
                      title={
                        showThreadList
                          ? t.ai.overlay.close
                          : t.ai.overlay.newConversation
                      }
                    >
                      <IconButton
                        size="small"
                        onClick={() => setShowThreadList((v) => !v)}
                        aria-label={t.ai.overlay.newConversation}
                      >
                        <MessagesSquare size={18} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                )}

                {/* Chat content area */}
                <Box
                  sx={{
                    flex: 1,
                    minHeight: 0,
                    overflow: 'hidden',
                    display: 'flex',
                    backgroundColor: 'background.paper',
                  }}
                >
                  {isWide ? (
                    <ChatDesktopLayout />
                  ) : showThreadList ? (
                    <Box
                      sx={{ width: '100%', height: '100%' }}
                      onClick={() => setShowThreadList(false)}
                    >
                      <ChatThreadList />
                    </Box>
                  ) : (
                    <ChatThread />
                  )}
                </Box>
              </Box>
            </ChatThemeBridge>
          </ChatRuntimeProvider>
        ) : (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Box
              sx={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                border: 2,
                borderColor: 'primary.main',
                borderTopColor: 'transparent',
                animation: 'spin 0.8s linear infinite',
                '@keyframes spin': { to: { transform: 'rotate(360deg)' } },
              }}
            />
          </Box>
        )}
      </Box>
    </Drawer>
  );
}
