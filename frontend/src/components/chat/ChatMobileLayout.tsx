'use client';

import { useState, useCallback } from 'react';
import { Menu, ArrowLeft } from 'lucide-react';
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

  const openSidebar = useCallback(() => setShowSidebar(true), []);
  const closeSidebar = useCallback(() => setShowSidebar(false), []);

  return (
    <div className="chat-mobile-layout h-full relative">
      {showSidebar ? (
        <div className="flex flex-col h-full w-full">
          {/* Back button header */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-background">
            <button
              type="button"
              onClick={closeSidebar}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Back to chat"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          </div>
          {/* Thread list - clicking a conversation triggers runtime switch, close sidebar */}
          <div className="flex-1 min-h-0" onClick={closeSidebar}>
            <ChatThreadList />
          </div>
        </div>
      ) : (
        <div className="flex flex-col h-full w-full">
          {/* Hamburger button overlaid on thread */}
          <button
            type="button"
            onClick={openSidebar}
            className="absolute top-2 left-2 z-10 p-2 rounded-md bg-background/80 backdrop-blur-sm border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Open conversations"
          >
            <Menu className="h-5 w-5" />
          </button>
          <ChatThread />
        </div>
      )}
    </div>
  );
}
