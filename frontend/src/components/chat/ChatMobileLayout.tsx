'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
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
  const backBtnRef = useRef<HTMLButtonElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const t = useTranslations();
  const closeLabel = t.common?.close || 'Close';
  const openThreadListLabel = t.chat.threadList.openList || t.chat.threadList.title;
  const closeThreadListLabel = t.chat.threadList.closeList || closeLabel;

  const openSidebar = useCallback(() => setShowSidebar(true), []);
  const closeSidebar = useCallback(() => setShowSidebar(false), []);

  // Escape closes the sheet and Tab stays inside it while open.
  useEffect(() => {
    if (!showSidebar) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeSidebar();
        menuBtnRef.current?.focus();
        return;
      }

      if (e.key !== 'Tab') return;

      const focusable = sidebarRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showSidebar, closeSidebar]);

  // Auto-focus back button when sidebar opens
  useEffect(() => {
    if (showSidebar) {
      backBtnRef.current?.focus();
    }
  }, [showSidebar]);

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
              ref={menuBtnRef}
              type="button"
              onClick={openSidebar}
              className="chat-mobile-menu-btn"
              aria-label={openThreadListLabel}
              aria-expanded={showSidebar ? 'true' : 'false'}
              aria-controls="chat-mobile-sidebar"
              aria-haspopup="dialog"
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
          aria-label={closeThreadListLabel}
          tabIndex={showSidebar ? 0 : -1}
        />

        <div
          id="chat-mobile-sidebar"
          ref={sidebarRef}
          className="chat-mobile-slide-sidebar"
          data-visible={showSidebar ? 'true' : 'false'}
          aria-hidden={showSidebar ? 'false' : 'true'}
          role="dialog"
          aria-modal="true"
          aria-label={t.chat.threadList.title}
        >
          <div className="chat-mobile-sidebar-panel">
            <div className="chat-mobile-sidebar-header">
              <button
                ref={backBtnRef}
                type="button"
                onClick={closeSidebar}
                className="chat-mobile-back-btn"
                aria-label={closeThreadListLabel}
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
