'use client';

import { type ReactNode, useEffect } from 'react';
import {
  useChatRuntime,
  AssistantChatTransport,
} from '@assistant-ui/react-ai-sdk';
import { AssistantRuntimeProvider } from '@assistant-ui/react';
import { getAuthToken } from '@/lib/utils/auth-token';
import { getCsrfToken } from '@/lib/api-client';
import type { UIMessage } from 'ai';

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

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
// getCsrfToken() returns cached value after first fetch.
// Token is fetched lazily on first header read, warmed eagerly on mount.
let csrfCache = '';

function getHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${getAuthToken()}`,
    'X-CSRF-Token': csrfCache,
  };
}

export function ChatRuntimeProvider({
  children,
}: {
  children: ReactNode;
}) {
  // Warm CSRF cache eagerly so it's ready when user sends first message.
  // The headers callback reads csrfCache at request time (not render time).
  useEffect(() => {
    getCsrfToken().then((t) => {
      csrfCache = t;
    });
  }, []);

  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({
      api: `${API_BASE}/api/v1/ai/chat`,
      credentials: 'include',
      headers: getHeaders,
      // Backend expects { message, conversationId }, not the AI SDK messages array.
      // See Pitfall 4 in 27-RESEARCH.md
      prepareSendMessagesRequest: ({ messages, body }) => ({
        body: {
          message: extractLastUserText(messages),
          conversationId:
            (body as Record<string, unknown>)?.conversationId ?? undefined,
        },
      }),
    }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}
