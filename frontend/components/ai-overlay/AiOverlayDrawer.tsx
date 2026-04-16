'use client';

import { useState, useEffect } from 'react';
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

const WIDE_THRESHOLD = 480;

/**
 * Root AI overlay component.
 * Reads state from useAiOverlay store.
 * Renders MUI Drawer (right-anchored, temporary) with:
 *   ResizeHandle | AiOverlayHeader | ChatContent
 *
 * Width >= 480: ChatDesktopLayout (thread list + thread)
 * Width <  480: ChatThread only, with toggle for thread list
 *
 * Esc key dismissal: MUI temporary Drawer fires onClose on Escape (D-12).
 */
export function AiOverlayDrawer() {
  const t = useTranslations();
  const isOpen = useAiOverlay((s) => s.isOpen);
  const width = useAiOverlay((s) => s.width);
  const close = useAiOverlay((s) => s.close);
  const setWidth = useAiOverlay((s) => s.setWidth);

  const [showThreadList, setShowThreadList] = useState(false);

  // Reset thread list view when width crosses above threshold
  useEffect(() => {
    if (width >= WIDE_THRESHOLD) {
      setShowThreadList(false);
    }
  }, [width]);

  const isWide = width >= WIDE_THRESHOLD;

  return (
    <Drawer
      anchor="right"
      open={isOpen}
      onClose={close}
      variant="temporary"
      aria-label={t.ai.overlay.title}
      PaperProps={{
        sx: {
          width,
          maxWidth: '100vw',
          display: 'flex',
          flexDirection: 'row',
          overflow: 'hidden',
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
                    px: 1,
                    py: 0.5,
                    borderBottom: 1,
                    borderColor: 'divider',
                    flexShrink: 0,
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
              <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex' }}>
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
      </Box>
    </Drawer>
  );
}
