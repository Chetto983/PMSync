'use client';

import { type ReactNode, useMemo } from 'react';
import { RuntimeAdapterProvider } from '@assistant-ui/core/react';
import { ExportedMessageRepository } from '@assistant-ui/core';
import type {
  GenericThreadHistoryAdapter,
  MessageFormatAdapter,
  MessageFormatRepository,
  ThreadMessage,
  ThreadMessageLike,
  ThreadHistoryAdapter,
} from '@assistant-ui/core';
import { createAssistantStream, type AssistantStream } from 'assistant-stream';
import { useAuiState } from '@assistant-ui/store';
import type { UIMessage } from 'ai';
import { apiClient } from '@/lib/api-client';

/**
 * RemoteThreadListAdapter types from @assistant-ui/core.
 * Declared inline to avoid deep import path issues - shapes match exactly.
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

interface DbConversationMessage {
  id: string;
  role: string;
  content: unknown;
  createdAt: string;
  toolCallId?: string | null;
}

const TITLE_FETCH_RETRIES = 8;
const TITLE_FETCH_RETRY_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeTextParts(content: unknown): UIMessage['parts'] {
  if (Array.isArray(content)) {
    return content.filter(
      (part): part is UIMessage['parts'][number] =>
        Boolean(
          part &&
            typeof part === 'object' &&
            'type' in part &&
            typeof (part as { type?: unknown }).type === 'string',
        ),
    );
  }

  if (typeof content === 'string') {
    return content.length > 0 ? [{ type: 'text', text: content }] : [];
  }

  if (content && typeof content === 'object') {
    const record = content as Record<string, unknown>;
    const text =
      typeof record.text === 'string'
        ? record.text
        : typeof record.content === 'string'
          ? record.content
          : '';

    return text.length > 0 ? [{ type: 'text', text }] : [];
  }

  return [];
}

function convertStoredToolResultToUIMessage(
  message: DbConversationMessage,
): UIMessage | null {
  const content =
    message.content && typeof message.content === 'object'
      ? (message.content as Record<string, unknown>)
      : null;

  if (!content) return null;

  const toolName =
    typeof content.toolName === 'string' ? content.toolName : 'unknown';
  const toolCallId =
    typeof content.toolCallId === 'string'
      ? content.toolCallId
      : message.toolCallId || message.id;

  return {
    id: message.id,
    role: 'assistant',
    parts: [
      {
        type: 'dynamic-tool',
        toolName,
        toolCallId,
        state: 'output-available',
        input: content.input ?? {},
        output: content.output ?? content.result ?? content,
        ...(typeof content.preliminary === 'boolean'
          ? { preliminary: content.preliminary }
          : {}),
        ...(typeof content.providerExecuted === 'boolean'
          ? { providerExecuted: content.providerExecuted }
          : {}),
        ...(typeof content.title === 'string' ? { title: content.title } : {}),
      },
    ],
  };
}

function convertDbMessagesToUIMessages(
  messages: DbConversationMessage[],
): UIMessage[] {
  return messages
    .map((message) => {
      if (message.role === 'tool') {
        return convertStoredToolResultToUIMessage(message);
      }

      if (message.role !== 'user' && message.role !== 'assistant') {
        return null;
      }

      return {
        id: message.id,
        role: message.role,
        parts: normalizeTextParts(message.content),
      } satisfies UIMessage;
    })
    .filter((message): message is UIMessage => Boolean(message));
}

function convertDbMessagesToMessageFormatRepository(
  messages: DbConversationMessage[],
): MessageFormatRepository<UIMessage> {
  const uiMessages = convertDbMessagesToUIMessages(messages);

  return {
    ...(uiMessages.length > 0 ? { headId: uiMessages.at(-1)?.id ?? null } : {}),
    messages: uiMessages.map((message, index) => ({
      parentId: index === 0 ? null : uiMessages[index - 1]?.id ?? null,
      message,
    })),
  };
}

/**
 * Convert backend DB messages to ThreadMessageLike format for the legacy history adapter.
 * Only keeps user and assistant text messages.
 */
function convertDbMessagesToThreadMessageLike(
  messages: DbConversationMessage[],
): ThreadMessageLike[] {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => {
      const raw = m.content;
      let text = '';
      if (typeof raw === 'string') {
        text = raw;
      } else if (Array.isArray(raw)) {
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
  const threadId = useAuiState((s) => s.threadListItem.id);

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
      withFormat<TMessage, TStorageFormat extends Record<string, unknown>>(
        _formatAdapter: MessageFormatAdapter<TMessage, TStorageFormat>,
      ): GenericThreadHistoryAdapter<TMessage> {
        return {
          async load() {
            if (!remoteId) return { messages: [] };

            try {
              const { data } = await apiClient.get(
                `/ai/chat/conversations/${remoteId}`,
              );
              const dbMessages = data?.conversation?.messages ?? [];
              return convertDbMessagesToMessageFormatRepository(
                dbMessages,
              ) as MessageFormatRepository<TMessage>;
            } catch {
              return { messages: [] };
            }
          },
          async append() {
            /* no-op - backend persists during SSE streaming */
          },
        };
      },
      async append() {
        /* no-op - backend persists during SSE streaming */
      },
    }),
    [remoteId],
  );

  return (
    <RuntimeAdapterProvider
      key={`${threadId}:${remoteId ?? 'pending'}`}
      adapters={{ history }}
    >
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
 * - initialize() -> POST /ai/chat/conversations (eagerly creates, returns real CUID)
 * - fetch()      -> GET /ai/chat/conversations/:id
 * - rename()     -> no-op (backend auto-generates titles)
 * - archive()    -> DELETE (no archive concept)
 */
export function createPmSyncThreadListAdapter() {
  // Serialize delete calls to avoid 429 rate-limit errors when bulk-deleting
  let deleteQueue: Promise<void> = Promise.resolve();
  async function deleteThread(remoteId: string) {
    deleteQueue = deleteQueue.then(async () => {
      try {
        await apiClient.delete(`/ai/chat/conversations/${remoteId}`);
      } catch {
        // Swallow delete errors so the list stays usable if the thread is already gone.
      }
      // Small delay between deletes to stay under rate limit (30 write/min)
      await new Promise((r) => setTimeout(r, 250));
    });
    return deleteQueue;
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
      // Backend auto-generates titles - no rename endpoint needed
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
      _threadId: string,
    ): Promise<RemoteThreadInitializeResponse> {
      // Eagerly create the conversation on the backend so we get a real
      // server-assigned CUID. assistant-ui calls this before the first
      // message send; the returned remoteId is then forwarded as
      // conversationId on every subsequent request.
      const { data } = await apiClient.post('/ai/chat/conversations');
      const remoteId: string = data?.conversation?.id ?? _threadId;
      return { remoteId, externalId: undefined };
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
