/**
 * Resolve a real backend conversation ID from the request body.
 *
 * assistant-ui generates local thread IDs prefixed with `__LOCALID_` before
 * the backend assigns a real ID via `initialize()`. These local IDs must be
 * filtered out so the backend treats the request as a new conversation
 * (which it creates lazily on the first message).
 */
export function resolveConversationIdFromRequestBody(
  body: Record<string, unknown> | undefined,
): string | undefined {
  const conversationId = body?.conversationId;
  if (
    typeof conversationId === 'string' &&
    conversationId.length > 0 &&
    !conversationId.startsWith('__LOCALID_')
  ) {
    return conversationId;
  }

  const id = body?.id;
  if (
    typeof id === 'string' &&
    id.length > 0 &&
    !id.startsWith('__LOCALID_')
  ) {
    return id;
  }

  return undefined;
}
