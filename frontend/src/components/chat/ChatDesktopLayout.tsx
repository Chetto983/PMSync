'use client';

import { ChatThreadList } from './ChatThreadList';
import { ChatThread } from './ChatThread';

/**
 * Desktop chat layout: conversation sidebar (300px) + thread (flex-1).
 * Visible only at md breakpoint and above (hidden on mobile).
 */
export function ChatDesktopLayout() {
  return (
    <div className="chat-desktop-layout h-full">
      {/* Conversation sidebar */}
      <aside className="chat-desktop-sidebar">
        <ChatThreadList />
      </aside>
      {/* Main thread area */}
      <section className="chat-desktop-thread">
        <ChatThread />
      </section>
    </div>
  );
}
