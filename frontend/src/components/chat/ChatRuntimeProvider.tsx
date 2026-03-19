'use client';

import { type ReactNode, useEffect, useMemo } from 'react';
import { useChat } from '@ai-sdk/react';
import { useAuiState } from '@assistant-ui/store';
import { useAISDKRuntime, AssistantChatTransport } from '@assistant-ui/react-ai-sdk';
import { useRemoteThreadListRuntime } from '@assistant-ui/core/react';
import { AssistantRuntimeProvider } from '@assistant-ui/react';
import { API_BASE_URL, getCsrfToken } from '@/lib/api-client';
import type { UIMessage } from 'ai';
import { lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai';
import { createPmSyncThreadListAdapter } from './chat-thread-list-adapter';

/**
 * Extract plain text from the last user message in AI SDK message array.
 * Messages use UIMessage format with parts array.
 */
function extractLastUserText(messages: UIMessage[]): string {
  const last = messages[messages.length - 1];
  if (!last?.parts) return '';
  return last.parts
    .filter((p) => p.type === 'text')
    .map((p) => (p as { type: 'text'; text: string }).text)
    .join('');
}

// Module-scoped CSRF token cache.
let csrfCache = '';

function getHeaders(): Record<string, string> {
  return { 'X-CSRF-Token': csrfCache };
}

// Singleton transport — reused across thread switches.
const transport = new AssistantChatTransport({
  api: `${API_BASE_URL}/api/v1/ai/chat`,
  credentials: 'include',
  headers: getHeaders,
  prepareSendMessagesRequest: ({ messages, body }) => ({
    body: {
      message: extractLastUserText(messages),
      conversationId:
        (body as Record<string, unknown>)?.conversationId ?? undefined,
    },
  }),
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

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}
