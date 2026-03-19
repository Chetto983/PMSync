import { describe, it, expect, vi } from 'vitest';
import { ConversationService } from '../services/conversation.service';

describe('ConversationService tool message formatting', () => {
  it('maps stored tool results back to AI SDK tool messages', async () => {
    const service = new ConversationService({
      aiConversation: {
        findUnique: vi.fn().mockResolvedValue({ summary: null }),
      },
      aiMessage: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'msg-tool-1',
            conversationId: 'conv-1',
            role: 'tool',
            content: {
              type: 'tool-result',
              toolCallId: 'tool-1',
              toolName: 'list_email_index',
              input: { folder: 'inbox' },
              output: { count: 3 },
              dynamic: true,
            },
            toolCallId: 'tool-1',
            createdAt: new Date('2026-03-19T00:00:00.000Z'),
          },
        ]),
      },
    } as any);

    const messages = await service.getMessagesForContext('conv-1');
    const toolMessage = messages[0] as any;

    expect(toolMessage.role).toBe('tool');
    expect(toolMessage.content[0]).toMatchObject({
      type: 'tool-result',
      toolCallId: 'tool-1',
      toolName: 'list_email_index',
      input: { folder: 'inbox' },
      output: { count: 3 },
      dynamic: true,
    });
  });

  it('keeps compatibility with legacy stored result payloads', async () => {
    const service = new ConversationService({
      aiConversation: {
        findUnique: vi.fn().mockResolvedValue({ summary: null }),
      },
      aiMessage: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'msg-tool-legacy',
            conversationId: 'conv-1',
            role: 'tool',
            content: {
              toolName: 'send_email',
              result: { approved: false },
            },
            toolCallId: 'tool-legacy',
            createdAt: new Date('2026-03-19T00:00:00.000Z'),
          },
        ]),
      },
    } as any);

    const messages = await service.getMessagesForContext('conv-1');
    const toolMessage = messages[0] as any;

    expect(toolMessage.content[0]).toMatchObject({
      type: 'tool-result',
      toolCallId: 'tool-legacy',
      toolName: 'send_email',
      output: { approved: false },
    });
  });
});
