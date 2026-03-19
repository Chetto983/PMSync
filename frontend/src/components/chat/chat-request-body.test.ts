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

  it('falls back to prepared transport id when body only contains local ids', () => {
    expect(
      resolveConversationIdFromRequestBody(
        {
          id: '__LOCALID_thread-123',
        },
        'conv-456',
      ),
    ).toBe('conv-456');
  });

  it('ignores local fallback ids', () => {
    expect(
      resolveConversationIdFromRequestBody(undefined, '__LOCALID_thread-789'),
    ).toBeUndefined();
  });
});
