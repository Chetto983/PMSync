'use client';

import { ChatRuntimeProvider } from './ChatRuntimeProvider';
import { AllToolUIs } from './tool-uis';
import { ChatDesktopLayout } from './ChatDesktopLayout';
import { ChatMobileLayout } from './ChatMobileLayout';
import './chat-styles.css';

/**
 * Top-level chat page composing runtime provider, tool UIs, and responsive layouts.
 * CSS-only responsive switching: desktop (md+) shows sidebar+thread, mobile shows full-screen.
 */
export function ChatPage() {
  return (
    <ChatRuntimeProvider>
      <AllToolUIs />
      <div className="h-full overflow-hidden">
        <ChatDesktopLayout />
        <ChatMobileLayout />
      </div>
    </ChatRuntimeProvider>
  );
}
