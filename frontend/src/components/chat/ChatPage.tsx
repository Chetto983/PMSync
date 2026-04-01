'use client';

import { ChatRuntimeProvider } from './ChatRuntimeProvider';
import { ChatThemeBridge } from './ChatThemeBridge';
import { ChatDesktopLayout } from './ChatDesktopLayout';
import { ChatMobileLayout } from './ChatMobileLayout';

/**
 * Top-level chat page composing runtime provider, tool UIs, and responsive layouts.
 * The page shell already shows a dynamic-import skeleton, so we keep the
 * runtime mounted immediately to avoid a second client-side flash.
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
