'use client';

import { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import { ChatRuntimeProvider } from './ChatRuntimeProvider';
import { ChatThemeBridge } from './ChatThemeBridge';
import { AllToolUIs } from './tool-uis';
import { ChatDesktopLayout } from './ChatDesktopLayout';
import { ChatMobileLayout } from './ChatMobileLayout';

function ChatSkeleton() {
  return (
    <Box className="chat-skeleton" sx={{ animation: 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite' }}>
      <div className="chat-skeleton-header" />
      <div className="chat-skeleton-messages">
        {[1, 2, 3].map((i) => (
          <div key={i} className="chat-skeleton-msg">
            <div className="chat-skeleton-avatar" />
            <div className="chat-skeleton-lines">
              <div className="chat-skeleton-line" />
              <div className="chat-skeleton-line" />
              {i === 1 && <div className="chat-skeleton-line" />}
            </div>
          </div>
        ))}
      </div>
      <div className="chat-skeleton-composer" />
    </Box>
  );
}

/**
 * Top-level chat page composing runtime provider, tool UIs, and responsive layouts.
 * Shows a skeleton before mount to avoid flash of empty content.
 */
export function ChatPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []); // eslint-disable-line react-hooks/set-state-in-effect

  if (!mounted) {
    return (
      <div className="chat-page">
        <div className="chat-surface">
          <ChatSkeleton />
        </div>
      </div>
    );
  }

  return (
    <ChatRuntimeProvider>
      <AllToolUIs />
      <ChatThemeBridge>
        <div className="chat-page">
          <div className="chat-surface">
            <ChatDesktopLayout />
            <ChatMobileLayout />
          </div>
        </div>
      </ChatThemeBridge>
    </ChatRuntimeProvider>
  );
}
