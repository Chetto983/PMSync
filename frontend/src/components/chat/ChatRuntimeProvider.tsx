'use client';

import { type ReactNode, useRef, useEffect } from 'react';
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

export function ChatRuntimeProvider({
  children,
}: {
  children: ReactNode;
}) {
  // Cache CSRF token in ref (async init, sync read for headers callback)
  const csrfRef = useRef('');
  useEffect(() => {
    getCsrfToken().then((t) => {
      csrfRef.current = t;
    });
  }, []);

  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({
      api: `${API_BASE}/api/v1/ai/chat`,
      credentials: 'include',
      headers: () => ({
        Authorization: `Bearer ${getAuthToken()}`,
        'X-CSRF-Token': csrfRef.current,
      }),
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
