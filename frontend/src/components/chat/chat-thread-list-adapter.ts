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

/**
 * Custom thread list adapter that connects assistant-ui's thread management
 * to our backend conversation API (Vercel AI SDK transport).
 *
 * Routes:
 * - list()       → GET /ai/chat/conversations
 * - delete()     → DELETE /ai/chat/conversations/:id
 * - initialize() → Returns threadId as-is (backend creates on first message)
 * - fetch()      → GET /ai/chat/conversations/:id
 * - rename()     → no-op (backend auto-generates titles)
 * - archive()    → DELETE (no archive concept)
 */
export class PmSyncThreadListAdapter {
  async list(): Promise<RemoteThreadListResponse> {
    try {
      const { data } = await apiClient.get('/ai/chat/conversations', {
        params: { limit: 50 },
      });
      const conversations = data?.conversations ?? data?.data?.conversations ?? [];
      return {
        threads: conversations.map((c: { id: string; title?: string }) => ({
          status: 'regular' as const,
          remoteId: c.id,
          title: c.title ?? undefined,
        })),
      };
    } catch {
      return { threads: [] };
    }
  }

  async rename(_remoteId: string, _newTitle: string): Promise<void> {
    // Backend auto-generates titles — no rename endpoint needed
  }

  async archive(remoteId: string): Promise<void> {
    await this.delete(remoteId);
  }

  async unarchive(_remoteId: string): Promise<void> {
    // No-op
  }

  async delete(remoteId: string): Promise<void> {
    try {
      await apiClient.delete(`/ai/chat/conversations/${remoteId}`);
    } catch {
      // Swallow — thread may already be deleted
    }
  }

  async initialize(threadId: string): Promise<RemoteThreadInitializeResponse> {
    // Backend creates conversation on first POST /ai/chat message.
    return { remoteId: threadId, externalId: undefined };
  }

  async generateTitle(): Promise<never> {
    // Backend auto-generates titles after ~4 messages.
    throw new Error('Title generation handled by backend');
  }

  async fetch(threadId: string): Promise<RemoteThreadMetadata> {
    try {
      const { data } = await apiClient.get(`/ai/chat/conversations/${threadId}`);
      const conv = data?.conversation ?? data?.data?.conversation;
      return {
        status: 'regular' as const,
        remoteId: conv.id,
        title: conv.title ?? undefined,
      };
    } catch {
      return { status: 'regular' as const, remoteId: threadId, title: undefined };
    }
  }
}
