import { resolveConversationIdFromRequestBody } from './chat-request-body';

describe('resolveConversationIdFromRequestBody', () => {
  it('prefers explicit conversationId when present', () => {
    expect(
      resolveConversationIdFromRequestBody({
        conversationId: 'conv-123',
        id: 'thread-456',
      }),
    ).toBe('conv-123');
  });

  it('falls back to assistant-ui thread id when conversationId is absent', () => {
    expect(
      resolveConversationIdFromRequestBody({
        id: 'conv-123',
      }),
    ).toBe('conv-123');
  });

  it('returns undefined when neither id is usable', () => {
    expect(resolveConversationIdFromRequestBody(undefined)).toBeUndefined();
    expect(
      resolveConversationIdFromRequestBody({
        conversationId: '',
        id: 123,
      }),
    ).toBeUndefined();
  });
});
