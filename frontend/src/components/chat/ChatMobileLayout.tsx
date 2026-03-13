'use client';

import { useState, useCallback } from 'react';
import { MessagesSquare, ArrowLeft } from 'lucide-react';
import Box from '@mui/material/Box';
import { useTranslations } from '@/lib/hooks/use-translations';
import { ChatThreadList } from './ChatThreadList';
import { ChatThread } from './ChatThread';

/**
 * Mobile chat layout: always-mounted sidebar + thread with CSS slide transition.
 * Default view: full-screen ChatThread with hamburger button.
 * Sidebar slides in from left when toggled.
 */
export function ChatMobileLayout() {
  const [showSidebar, setShowSidebar] = useState(false);
  const t = useTranslations();
  const closeLabel = t.common?.close || 'Close';

  const openSidebar = useCallback(() => setShowSidebar(true), []);
  const closeSidebar = useCallback(() => setShowSidebar(false), []);

  return (
    <div
      className="chat-mobile-layout"
      data-sidebar-open={showSidebar ? 'true' : 'false'}
    >
      <div className="chat-mobile-slide-container">
        {/* Thread panel — base layer, always visible */}
        <div className="chat-mobile-slide-thread">
          <div className="chat-mobile-thread-panel">
            <button
              type="button"
              onClick={openSidebar}
              className="chat-mobile-menu-btn"
              aria-label={t.chat.threadList.title}
            >
              <Box component={MessagesSquare} sx={{ width: 20, height: 20 }} />
            </button>
            <ChatThread />
          </div>
        </div>

        {/* Sidebar panel — slides over from left */}
        <button
          type="button"
          className="chat-mobile-backdrop"
          onClick={closeSidebar}
          aria-label={closeLabel}
          tabIndex={showSidebar ? 0 : -1}
        />

        <div
          className="chat-mobile-slide-sidebar"
          data-visible={showSidebar ? 'true' : 'false'}
          aria-hidden={showSidebar ? 'false' : 'true'}
        >
          <div className="chat-mobile-sidebar-panel">
            <div className="chat-mobile-sidebar-header">
              <button
                type="button"
                onClick={closeSidebar}
                className="chat-mobile-back-btn"
                aria-label={t.chat.threadList.title}
              >
                <Box component={ArrowLeft} sx={{ width: 20, height: 20 }} />
              </button>
              <p className="chat-mobile-sidebar-title">
                {t.chat.threadList.title}
              </p>
            </div>
            <Box sx={{ flex: 1, minHeight: 0 }} onClick={closeSidebar}>
              <ChatThreadList />
            </Box>
          </div>
        </div>
      </div>
    </div>
  );
}
