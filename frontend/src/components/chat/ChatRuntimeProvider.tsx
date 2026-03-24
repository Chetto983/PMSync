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
    // For EXISTING threads, _remoteId is the real backend conversation ID.
    // Override the body to use it, bypassing the transport's internal
    // initialize() chain which can be fragile.
    if (_remoteId) {
      return {
        body: {
          ...options.body,
          id: _remoteId,
          messages: options.messages,
          trigger: options.trigger,
          messageId: options.messageId,
          metadata: options.requestMetadata,
        },
      };
    }

    // For NEW threads (_remoteId is undefined), return body=null.
    // The outer AssistantChatTransport uses `preparedRequest?.body ?? defaultBody`:
    //   - null is nullish → falls through to defaultBody
    //   - defaultBody includes `id` from initialize() which creates the
    //     backend conversation via the adapter
    return { body: null } as never;
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

  // Set the OUTER runtime on the transport so that initialize() can reach
  // the thread list adapter for new threads. For existing threads, the
  // prepareSendMessagesRequest above uses _remoteId directly.
  if (transport instanceof AssistantChatTransport) {
    transport.setRuntime(runtime);
  }

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
