'use client';

import { type ReactNode, useEffect, useMemo, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { useAuiState } from '@assistant-ui/store';
import { useAISDKRuntime, AssistantChatTransport } from '@assistant-ui/react-ai-sdk';
import { useRemoteThreadListRuntime } from '@assistant-ui/core/react';
import { AssistantRuntimeProvider } from '@assistant-ui/react';
import { API_BASE_URL, getCsrfToken } from '@/lib/api-client';
import { lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai';
import { createPmSyncThreadListAdapter } from './chat-thread-list-adapter';

// Module-scoped CSRF token cache.
let csrfCache = '';

function getHeaders(): Record<string, string> {
  return { 'X-CSRF-Token': csrfCache };
}

// Singleton transport — reused across thread switches.
// Uses standard AI SDK protocol: sends { id, messages[], trigger } body.
// No custom prepareSendMessagesRequest — let AssistantChatTransport handle it.
const transport = new AssistantChatTransport({
  api: `${API_BASE_URL}/api/v1/ai/chat`,
  credentials: 'include',
  headers: getHeaders,
});

/**
 * Inner hook: creates the per-thread AI SDK runtime.
 * Called by useRemoteThreadListRuntime each time the active thread changes.
 */
function useThreadRuntime() {
  const id = useAuiState((s) => s.threadListItem.id);

  const chat = useChat({
    id,
    transport,
    // Auto-resubmit after user approves/denies a tool requiring action.
    // SDK helper handles edge cases: multiple tool calls, partial approvals.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });

  const runtime = useAISDKRuntime(chat);

  if (transport instanceof AssistantChatTransport) {
    transport.setRuntime(runtime);
  }

  return runtime;
}

export function ChatRuntimeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const restoredInitialThreadRef = useRef(false);

  // Warm CSRF cache eagerly.
  useEffect(() => {
    getCsrfToken().then((t) => {
      csrfCache = t;
    });
  }, []);

  // Singleton adapter — survives re-renders but not page reloads.
  const adapter = useMemo(() => createPmSyncThreadListAdapter(), []);

  const runtime = useRemoteThreadListRuntime({
    runtimeHook: useThreadRuntime,
    adapter,
  });

  useEffect(() => {
    const restoreMostRecentConversation = () => {
      if (restoredInitialThreadRef.current) return;

      const state = runtime.threads.getState();
      if (state.isLoading || state.threadIds.length === 0) return;

      restoredInitialThreadRef.current = true;

      if (state.newThreadId && state.mainThreadId === state.newThreadId) {
        void runtime.threads.switchToThread(state.threadIds[0]!);
      }
    };

    restoreMostRecentConversation();
    return runtime.threads.subscribe(restoreMostRecentConversation);
  }, [runtime]);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}
