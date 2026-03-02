'use client';

import { ChatThreadList } from './ChatThreadList';
import { ChatThread } from './ChatThread';

/**
 * Desktop chat layout: conversation sidebar (280px) + thread (flex-1).
 * Visible only at md breakpoint and above (hidden on mobile).
 */
export function ChatDesktopLayout() {
  return (
    <div className="chat-desktop-layout h-full">
      {/* Conversation sidebar */}
      <div className="w-[260px] shrink-0 border-r border-border/50">
        <ChatThreadList />
      </div>
      {/* Main thread area */}
      <div className="flex-1 min-w-0">
        <ChatThread />
      </div>
    </div>
  );
}
