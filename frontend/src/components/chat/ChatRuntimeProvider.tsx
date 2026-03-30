'use client';

import { type ReactNode, useEffect, useMemo, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { useAuiState } from '@assistant-ui/store';
import {
  useAISDKRuntime,
  AssistantChatTransport,
} from '@assistant-ui/react-ai-sdk';
import { useRemoteThreadListRuntime } from '@assistant-ui/core/react';
import { AssistantRuntimeProvider } from '@assistant-ui/react';
import { API_BASE_URL, getCsrfToken } from '@/lib/api-client';
import { lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai';
import { createPmSyncThreadListAdapter } from './chat-thread-list-adapter';
import {
  resetManualNewThreadRequested,
  shouldSkipInitialThreadRestore,
} from './thread-restore-guard';

// Module-scoped CSRF token cache.
let csrfCache = '';

function getHeaders(): Record<string, string> {
  return { 'X-CSRF-Token': csrfCache };
}

/**
 * Module-scoped ref for AI SDK tool approval responses.
 *
 * assistant-ui's `addResult` routes through `onAddToolResult` -> `addToolOutput`
 * which sets tool state to 'output-available'. But the AI SDK's
 * `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses`
 * checks for state 'approval-responded'. Only `chat.addToolApprovalResponse`
 * sets this state correctly. We expose it here for HitlApprovalCard.
 */
let _addToolApprovalResponse:
  | ((opts: { id: string; approved: boolean; reason?: string }) => void)
  | undefined;

export function getAddToolApprovalResponse() {
  return _addToolApprovalResponse;
}

// Singleton transport reused across thread switches.
// Stable reference prevents useChat from re-initializing on re-renders.
const transport = new AssistantChatTransport({
  api: `${API_BASE_URL}/api/v1/ai/chat`,
  credentials: 'include',
  headers: getHeaders,
  prepareSendMessagesRequest() {
    // Preserve the transport's default request body so initialize() resolves
    // the active thread's remoteId immediately before each send.
    return { body: null } as never;
  },
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
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });

  // Only update the module-scoped ref when THIS Chat has an active approval-request.
  // This prevents thread switching from pointing the ref at a Chat without approvals.
  useEffect(() => {
    const hasApproval = chat.messages.some(
      (m) =>
        m.role === 'assistant' &&
        m.parts?.some(
          (p: { type?: string; state?: string }) =>
            p.type?.includes('tool') && p.state === 'approval-requested',
        ),
    );
    if (hasApproval) {
      _addToolApprovalResponse = chat.addToolApprovalResponse;
    }
  }, [chat.messages, chat.addToolApprovalResponse]);

  return useAISDKRuntime(chat);
}

export function ChatRuntimeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const restoredInitialThreadRef = useRef(false);

  // Warm CSRF cache eagerly.
  useEffect(() => {
    resetManualNewThreadRequested();
    getCsrfToken().then((t) => {
      csrfCache = t;
    });
  }, []);

  // Singleton adapter survives re-renders but not page reloads.
  const adapter = useMemo(() => createPmSyncThreadListAdapter(), []);

  const runtime = useRemoteThreadListRuntime({
    runtimeHook: useThreadRuntime,
    adapter,
  });

  // Set the outer runtime so initialize() can resolve the current thread's
  // remoteId through the adapter before each request.
  if (transport instanceof AssistantChatTransport) {
    transport.setRuntime(runtime);
  }

  useEffect(() => {
    const restoreMostRecentConversation = () => {
      if (restoredInitialThreadRef.current) return;

      const state = runtime.threads.getState();
      if (state.isLoading || state.threadIds.length === 0) return;

      if (shouldSkipInitialThreadRestore()) {
        restoredInitialThreadRef.current = true;
        resetManualNewThreadRequested();
        return;
      }

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
