'use client';

import { ChatRuntimeProvider } from './ChatRuntimeProvider';
import { AllToolUIs } from './tool-uis';
import { ChatDesktopLayout } from './ChatDesktopLayout';
import { ChatMobileLayout } from './ChatMobileLayout';
/**
 * Top-level chat page composing runtime provider, tool UIs, and responsive layouts.
 * Tailwind responsive switching: desktop (md+) shows sidebar+thread, mobile shows full-screen.
 */
export function ChatPage() {
  return (
    <ChatRuntimeProvider>
      <AllToolUIs />
      <div className="relative h-full p-2.5 isolate bg-background">
        <div className="relative h-full overflow-hidden rounded-3xl border border-border/65 bg-card/95 shadow-xl backdrop-blur-sm">
          <ChatDesktopLayout />
          <ChatMobileLayout />
        </div>
      </div>
    </ChatRuntimeProvider>
  );
}
