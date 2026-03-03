'use client';

import { useState, useCallback } from 'react';
import { MessagesSquare, ArrowLeft } from 'lucide-react';
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

  const openSidebar = useCallback(() => setShowSidebar(true), []);
  const closeSidebar = useCallback(() => setShowSidebar(false), []);

  return (
    <div className="chat-mobile-layout">
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
              <MessagesSquare className="h-5 w-5" />
            </button>
            <ChatThread />
          </div>
        </div>

        {/* Sidebar panel — slides over from left */}
        <div
          className="chat-mobile-slide-sidebar"
          data-visible={showSidebar ? 'true' : 'false'}
        >
          <div className="chat-mobile-sidebar-panel">
            <div className="chat-mobile-sidebar-header">
              <button
                type="button"
                onClick={closeSidebar}
                className="chat-mobile-back-btn"
                aria-label={t.chat.threadList.title}
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <p className="chat-mobile-sidebar-title">
                {t.chat.threadList.title}
              </p>
            </div>
            <div className="flex-1 min-h-0" onClick={closeSidebar}>
              <ChatThreadList />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
