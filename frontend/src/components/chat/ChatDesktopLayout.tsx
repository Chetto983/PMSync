'use client';

import { ChatRailIntro } from './ChatRailIntro';
import { ChatThreadList } from './ChatThreadList';
import { ChatThread } from './ChatThread';
import { ChatWorkspaceBanner } from './ChatWorkspaceBanner';

/**
 * Desktop chat layout: conversation sidebar (300px) + thread (flex-1).
 * Visible only at md breakpoint and above (hidden on mobile).
 */
export function ChatDesktopLayout() {
  return (
    <div className="chat-desktop-layout h-full">
      <aside className="chat-desktop-sidebar">
        <div className="chat-desktop-sidebar-shell">
          <ChatRailIntro />
          <ChatThreadList />
        </div>
      </aside>
      <section className="chat-desktop-thread">
        <div className="chat-desktop-thread-shell">
          <ChatWorkspaceBanner />
          <div className="chat-desktop-thread-panel">
            <ChatThread />
          </div>
        </div>
      </section>
    </div>
  );
}
