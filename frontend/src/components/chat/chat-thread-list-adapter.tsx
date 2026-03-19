'use client';

import { type ReactNode, useMemo } from 'react';
import { RuntimeAdapterProvider } from '@assistant-ui/core/react';
import { ExportedMessageRepository } from '@assistant-ui/core';
import type {
  ThreadMessage,
  ThreadMessageLike,
  ThreadHistoryAdapter,
} from '@assistant-ui/core';
import { createAssistantStream, type AssistantStream } from 'assistant-stream';
import { useAuiState } from '@assistant-ui/store';
import { apiClient } from '@/lib/api-client';

/**
 * RemoteThreadListAdapter types from @assistant-ui/core.
 * Declared inline to avoid deep import path issues — shapes match exactly.
 */
interface RemoteThreadMetadata {
  readonly status: 'regular' | 'archived';
  readonly remoteId: string;
  readonly externalId?: string | undefined;
  readonly title?: string | undefined;
}

interface RemoteThreadListResponse {
  threads: RemoteThreadMetadata[];
}

interface RemoteThreadInitializeResponse {
  remoteId: string;
  externalId: string | undefined;
}

const TITLE_FETCH_RETRIES = 3;
const TITLE_FETCH_RETRY_MS = 150;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Convert backend DB messages to ThreadMessageLike format for the history adapter.
 * Only keeps user and assistant messages (tool messages are internal).
 */
function convertDbMessagesToThreadMessageLike(
  messages: Array<{
    id: string;
    role: string;
    content: unknown;
    createdAt: string;
  }>,
): ThreadMessageLike[] {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => {
      const raw = m.content;
      let text = '';
      if (typeof raw === 'string') {
        text = raw;
      } else if (Array.isArray(raw)) {
        // AI SDK stores content as parts array: [{ type: 'text', text: '...' }]
        text = raw
          .filter((p: Record<string, unknown>) => p.type === 'text')
          .map((p: Record<string, unknown>) => String(p.text ?? ''))
          .join('');
      } else if (raw && typeof raw === 'object') {
        text = String((raw as Record<string, unknown>).text ?? '');
      }
      return {
        role: m.role as 'user' | 'assistant',
        content: text,
        id: m.id,
        createdAt: new Date(m.createdAt),
      };
    });
}

/**
 * Provider component that injects ThreadHistoryAdapter into each thread.
 * Loads message history from the backend when switching to a thread.
 */
function ThreadHistoryProvider({ children }: { children: ReactNode }) {
  const remoteId = useAuiState((s) => s.threadListItem.remoteId);

  const history = useMemo<ThreadHistoryAdapter>(
    () => ({
      async load() {
        if (!remoteId) return { messages: [] };
        try {
          const { data } = await apiClient.get(
            `/ai/chat/conversations/${remoteId}`,
          );
          const dbMessages = data?.conversation?.messages ?? [];
          const threadMessages =
            convertDbMessagesToThreadMessageLike(dbMessages);
          return ExportedMessageRepository.fromArray(threadMessages);
        } catch {
          return { messages: [] };
        }
      },
      async append() {
        /* no-op — backend persists during SSE streaming */
      },
    }),
    [remoteId],
  );

  return (
    <RuntimeAdapterProvider adapters={{ history }}>
      {children}
    </RuntimeAdapterProvider>
  );
}

/**
 * Factory function that creates a thread list adapter connecting assistant-ui's
 * thread management to our backend conversation API.
 *
 * Includes unstable_Provider for per-thread history loading.
 *
 * Routes:
 * - list()       -> GET /ai/chat/conversations
 * - delete()     -> DELETE /ai/chat/conversations/:id
 * - initialize() -> Returns threadId as-is (backend creates on first message)
 * - fetch()      -> GET /ai/chat/conversations/:id
 * - rename()     -> no-op (backend auto-generates titles)
 * - archive()    -> DELETE (no archive concept)
 */
export function createPmSyncThreadListAdapter() {
  async function deleteThread(remoteId: string) {
    try {
      await apiClient.delete(`/ai/chat/conversations/${remoteId}`);
    } catch {
      // Swallow delete errors so the list stays usable if the thread is already gone.
    }
  }

  async function fetchThreadMetadata(
    threadId: string,
  ): Promise<RemoteThreadMetadata> {
    try {
      const { data } = await apiClient.get(`/ai/chat/conversations/${threadId}`);
      const conv = data?.conversation ?? data?.data?.conversation;
      return {
        status: 'regular' as const,
        remoteId: conv?.id ?? threadId,
        title: conv?.title ?? undefined,
      };
    } catch {
      return {
        status: 'regular' as const,
        remoteId: threadId,
        title: undefined,
      };
    }
  }

  async function fetchThreadTitleWithRetry(
    remoteId: string,
  ): Promise<string | undefined> {
    for (let attempt = 0; attempt < TITLE_FETCH_RETRIES; attempt += 1) {
      const metadata = await fetchThreadMetadata(remoteId);
      const title = metadata.title?.trim();
      if (title) return title;

      if (attempt < TITLE_FETCH_RETRIES - 1) {
        await sleep(TITLE_FETCH_RETRY_MS);
      }
    }

    return undefined;
  }

  function createTitleStream(title?: string): AssistantStream {
    return createAssistantStream((controller) => {
      if (title) {
        controller.appendText(title);
      }
    });
  }

  return {
    unstable_Provider: ThreadHistoryProvider,

    async list(): Promise<RemoteThreadListResponse> {
      try {
        const { data } = await apiClient.get('/ai/chat/conversations', {
          params: { limit: 50 },
        });
        const conversations =
          data?.conversations ?? data?.data?.conversations ?? [];
        return {
          threads: conversations.map(
            (c: { id: string; title?: string }) => ({
              status: 'regular' as const,
              remoteId: c.id,
              title: c.title ?? undefined,
            }),
          ),
        };
      } catch {
        return { threads: [] };
      }
    },

    async rename(_remoteId: string, _newTitle: string): Promise<void> {
      // Backend auto-generates titles — no rename endpoint needed
    },

    async archive(remoteId: string): Promise<void> {
      await deleteThread(remoteId);
    },

    async unarchive(_remoteId: string): Promise<void> {
      // No-op
    },

    async delete(remoteId: string): Promise<void> {
      await deleteThread(remoteId);
    },

    async initialize(
      threadId: string,
    ): Promise<RemoteThreadInitializeResponse> {
      // Backend creates conversation on first POST /ai/chat message.
      return { remoteId: threadId, externalId: undefined };
    },

    async generateTitle(
      remoteId: string,
      _messages: readonly ThreadMessage[],
    ): Promise<AssistantStream> {
      const title = await fetchThreadTitleWithRetry(remoteId);
      return createTitleStream(title);
    },

    async fetch(threadId: string): Promise<RemoteThreadMetadata> {
      return fetchThreadMetadata(threadId);
    },
  };
}
