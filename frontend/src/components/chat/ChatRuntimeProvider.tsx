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

// Module-scoped CSRF token cache.
let csrfCache = '';

function getHeaders(): Record<string, string> {
  return { 'X-CSRF-Token': csrfCache };
}

/**
 * Module-scoped remoteId — synced from React state on every render.
 *
 * The transport's prepareSendMessagesRequest reads this at send-time
 * to inject the real backend conversation ID into the request body.
 * This follows the AI SDK persistence pattern where the chat ID sent
 * to the server is the real DB identifier, not the client-side UUID.
 *
 * @see https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence
 */
let _remoteId: string | undefined;

// Singleton transport — reused across thread switches.
// Stable reference prevents useChat from re-initializing on re-renders.
const transport = new AssistantChatTransport({
  api: `${API_BASE_URL}/api/v1/ai/chat`,
  credentials: 'include',
  headers: getHeaders,
  prepareSendMessagesRequest(options) {
    // When we have a real backend conversation ID (set by the adapter's
    // initialize() or list()), override the body to use it.
    // This bypasses the transport's internal initialize() chain which
    // requires setRuntime(outerRuntime) — fragile with
    // useRemoteThreadListRuntime.
    return {
      body: {
        ...options.body,
        // Use real backend ID when available, otherwise fall back to
        // the useChat id (which the transport's outer code may override
        // with initialize()'s remoteId for new threads).
        id: _remoteId ?? options.id,
        messages: options.messages,
        trigger: options.trigger,
        messageId: options.messageId,
        metadata: options.requestMetadata,
      },
    };
  },
});

/**
 * Inner hook: creates the per-thread AI SDK runtime.
 * Called by useRemoteThreadListRuntime each time the active thread changes.
 */
function useThreadRuntime() {
  const id = useAuiState((s) => s.threadListItem.id);
  const remoteId = useAuiState((s) => s.threadListItem.remoteId);

  // Sync remoteId to module scope so the transport can read it at send-time.
  // Safe because React renders synchronously — by the time the user triggers
  // a message send, this has already been updated.
  _remoteId = remoteId;

  const chat = useChat({
    id,
    transport,
    // Auto-resubmit after user approves/denies a tool requiring action.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });

  const runtime = useAISDKRuntime(chat);

  // Set inner runtime for model context (system prompt, tools).
  // ID mapping is handled by _remoteId + prepareSendMessagesRequest above.
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
