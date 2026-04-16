'use client';

import { ChatRuntimeProvider } from './ChatRuntimeProvider';
import { ChatThemeBridge } from './ChatThemeBridge';
import { ChatDesktopLayout } from './ChatDesktopLayout';
import { ChatMobileLayout } from './ChatMobileLayout';

/**
 * Top-level chat page composing theme bridge and responsive layouts.
 * ChatRuntimeProvider wraps this page. The AI overlay has its own
 * independent provider — both share conversations via the backend API.
 */
export function ChatPage() {
  return (
    <ChatRuntimeProvider>
      <ChatThemeBridge>
        <div className="chat-page">
          <div className="chat-surface">
            <ChatDesktopLayout />
            <ChatMobileLayout />
          </div>
        </div>
      </ChatThemeBridge>
    </ChatRuntimeProvider>
  );
}
