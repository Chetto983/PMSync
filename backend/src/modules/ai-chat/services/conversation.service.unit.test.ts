import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConversationService } from './conversation.service';

describe('ConversationService persistence', () => {
  const createdMessage = {
    id: 'msg-1',
    conversationId: 'conv-1',
    role: 'user',
    content: { type: 'text', text: 'hello' },
  };

  let tx: {
    aiMessage: { create: ReturnType<typeof vi.fn> };
    aiConversation: { update: ReturnType<typeof vi.fn> };
  };

  let prisma: {
    $transaction: ReturnType<typeof vi.fn>;
  };

  let service: ConversationService;

  beforeEach(() => {
    tx = {
      aiMessage: {
        create: vi.fn().mockResolvedValue(createdMessage),
      },
      aiConversation: {
        update: vi.fn().mockResolvedValue(undefined),
      },
    };

    prisma = {
      $transaction: vi.fn(async (callback: (trx: typeof tx) => unknown) =>
        callback(tx),
      ),
    };

    service = new ConversationService(prisma as any);
  });

  it('touches the conversation when saving a user message', async () => {
    const result = await service.saveUserMessage('conv-1', 'hello');

    expect(result).toBe(createdMessage);
    expect(tx.aiMessage.create).toHaveBeenCalledWith({
      data: {
        conversationId: 'conv-1',
        role: 'user',
        content: { type: 'text', text: 'hello' },
      },
    });
    expect(tx.aiConversation.update).toHaveBeenCalledTimes(1);
    expect(tx.aiConversation.update).toHaveBeenCalledWith({
      where: { id: 'conv-1' },
      data: { updatedAt: expect.any(Date) },
    });
  });
});
