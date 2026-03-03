'use client';

import { ChatThreadList } from './ChatThreadList';
import { ChatThread } from './ChatThread';

/**
 * Desktop chat layout: conversation sidebar (300px) + thread (flex-1).
 * Visible only at md breakpoint and above (hidden on mobile).
 */
export function ChatDesktopLayout() {
  return (
    <div className="hidden md:flex h-full">
      {/* Conversation sidebar */}
      <aside className="w-[300px] shrink-0 border-r border-border/50 bg-muted/30">
        <ChatThreadList />
      </aside>
      {/* Main thread area */}
      <section className="min-w-0 flex-1">
        <ChatThread />
      </section>
    </div>
  );
}
