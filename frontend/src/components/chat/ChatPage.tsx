'use client';

import { ChatThemeBridge } from './ChatThemeBridge';
import { ChatDesktopLayout } from './ChatDesktopLayout';
import { ChatMobileLayout } from './ChatMobileLayout';

/**
 * Top-level chat page composing theme bridge and responsive layouts.
 * ChatRuntimeProvider is now at Layout level (Phase 144) so the runtime
 * persists across route changes and is shared with the AI overlay drawer.
 */
export function ChatPage() {
  return (
    <ChatThemeBridge>
      <div className="chat-page">
        <div className="chat-surface">
          <ChatDesktopLayout />
          <ChatMobileLayout />
        </div>
      </div>
    </ChatThemeBridge>
  );
}
