'use client';

import { useState, useCallback } from 'react';
import { Menu, ArrowLeft } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { ChatThreadList } from './ChatThreadList';
import { ChatThread } from './ChatThread';

/**
 * Mobile chat layout: full-screen thread with hamburger toggle for sidebar.
 * Visible only below md breakpoint (hidden on desktop).
 *
 * - Default view: full-screen ChatThread with hamburger button
 * - Sidebar view: full-screen ChatThreadList with back button
 * - Selecting a conversation returns to thread view
 */
export function ChatMobileLayout() {
  const [showSidebar, setShowSidebar] = useState(false);
  const t = useTranslations();

  const openSidebar = useCallback(() => setShowSidebar(true), []);
  const closeSidebar = useCallback(() => setShowSidebar(false), []);

  return (
    <div className="flex md:hidden h-full relative">
      {showSidebar ? (
        <div className="flex w-full h-full flex-col bg-background/95 backdrop-blur-sm">
          {/* Back button header */}
          <div className="flex items-center gap-2.5 border-b border-border/70 px-3.5 py-3">
            <button
              type="button"
              onClick={closeSidebar}
              className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
              aria-label={t.chat.threadList.title}
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {t.chat.threadList.title}
            </p>
          </div>
          {/* Thread list - clicking a conversation triggers runtime switch, close sidebar */}
          <div className="flex-1 min-h-0" onClick={closeSidebar}>
            <ChatThreadList />
          </div>
        </div>
      ) : (
        <div className="relative flex h-full w-full">
          {/* Hamburger button overlaid on thread */}
          <button
            type="button"
            onClick={openSidebar}
            className="absolute top-3 left-3 z-30 inline-flex size-9 items-center justify-center rounded-xl border border-border/70 bg-card/90 text-muted-foreground shadow-md backdrop-blur-sm transition-colors hover:bg-card hover:text-foreground hover:border-primary/40"
            aria-label={t.chat.threadList.title}
          >
            <Menu className="h-5 w-5" />
          </button>
          <ChatThread />
        </div>
      )}
    </div>
  );
}
