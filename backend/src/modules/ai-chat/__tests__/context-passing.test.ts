import { describe, it, expect, vi } from 'vitest';
import { ConversationService } from '../services/conversation.service';

/**
 * Context-passing regression tests.
 *
 * Bug: reasoning parts saved in assistant messages are not valid ModelMessage
 * content parts (only 'text' and 'tool-call' are). When loaded as history,
 * they caused InvalidPromptError, which triggered the fallback that stripped
 * ALL context — making the AI respond with a fresh greeting.
 */
describe('Context passing: reasoning part stripping', () => {
  /**
   * Helper: messages must be in DESC createdAt order (newest first)
   * because getMessagesForContext uses `orderBy: desc` then `reverse()`.
   */
  function createService(messagesDescOrder: any[]) {
    return new ConversationService({
      aiConversation: {
        findUnique: vi.fn().mockResolvedValue({ summary: null }),
      },
      aiMessage: {
        findMany: vi.fn().mockResolvedValue(messagesDescOrder),
      },
    } as any);
  }

  it('strips reasoning parts from assistant messages in history', async () => {
    const service = createService([
      // DESC order: newest first
      {
        id: 'msg-asst-1',
        conversationId: 'conv-1',
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'The user wants Vercel emails...' },
          { type: 'text', text: 'Cercando le email di Vercel...' },
          {
            type: 'tool-call',
            toolCallId: 'tc-1',
            toolName: 'search_emails',
            input: { query: 'Vercel' },
          },
        ],
        toolCallId: null,
        createdAt: new Date('2026-03-24T08:00:01.000Z'),
      },
      {
        id: 'msg-user-1',
        conversationId: 'conv-1',
        role: 'user',
        content: { type: 'text', text: 'cerca le email di Vercel' },
        toolCallId: null,
        createdAt: new Date('2026-03-24T08:00:00.000Z'),
      },
    ]);

    const messages = await service.getMessagesForContext('conv-1');

    // After reverse: user first, then assistant
    expect(messages[0]).toEqual({ role: 'user', content: 'cerca le email di Vercel' });

    // Assistant message should NOT have reasoning parts
    const assistantMsg = messages[1] as any;
    expect(assistantMsg.role).toBe('assistant');
    expect(Array.isArray(assistantMsg.content)).toBe(true);

    const types = assistantMsg.content.map((p: any) => p.type);
    expect(types).toEqual(['text', 'tool-call']);
    expect(types).not.toContain('reasoning');
  });

  it('converts reasoning-only assistant message to empty text', async () => {
    const service = createService([
      {
        id: 'msg-asst-reason-only',
        conversationId: 'conv-1',
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'Thinking about this...' },
        ],
        toolCallId: null,
        createdAt: new Date('2026-03-24T08:00:00.000Z'),
      },
    ]);

    const messages = await service.getMessagesForContext('conv-1');
    const assistantMsg = messages[0] as any;

    expect(assistantMsg.role).toBe('assistant');
    expect(assistantMsg.content).toBe('');
  });

  it('preserves text and tool-call parts while stripping unknown types', async () => {
    const service = createService([
      {
        id: 'msg-asst-mixed',
        conversationId: 'conv-1',
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'internal thinking' },
          { type: 'text', text: 'Here are the results' },
          { type: 'tool-call', toolCallId: 'tc-2', toolName: 'view_calendar', input: {} },
          { type: 'unknown-future-type', data: 'something' },
        ],
        toolCallId: null,
        createdAt: new Date('2026-03-24T08:00:00.000Z'),
      },
    ]);

    const messages = await service.getMessagesForContext('conv-1');
    const assistantMsg = messages[0] as any;

    expect(assistantMsg.content).toHaveLength(2);
    expect(assistantMsg.content[0]).toEqual({ type: 'text', text: 'Here are the results' });
    expect(assistantMsg.content[1]).toEqual({
      type: 'tool-call',
      toolCallId: 'tc-2',
      toolName: 'view_calendar',
      input: {},
    });
  });

  it('full multi-turn conversation preserves context across turns', async () => {
    // Simulates the exact bug scenario: search + follow-up "sì"
    // Messages in DESC order (newest first)
    const service = createService([
      {
        id: 'msg-a2',
        conversationId: 'conv-1',
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'Found 4 Vercel emails, presenting results.' },
          { type: 'text', text: 'Ho trovato 4 email relative a Vercel.' },
        ],
        toolCallId: null,
        createdAt: new Date('2026-03-24T08:00:03.000Z'),
      },
      {
        id: 'msg-t1',
        conversationId: 'conv-1',
        role: 'tool',
        content: {
          type: 'tool-result',
          toolCallId: 'tc-search',
          toolName: 'search_emails',
          input: { query: 'Vercel' },
          output: { results: [{ subject: 'Failed deployment' }] },
        },
        toolCallId: 'tc-search',
        createdAt: new Date('2026-03-24T08:00:02.000Z'),
      },
      {
        id: 'msg-a1',
        conversationId: 'conv-1',
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'User wants Vercel emails, I should search.' },
          { type: 'text', text: 'Cercando le email di Vercel...' },
          {
            type: 'tool-call',
            toolCallId: 'tc-search',
            toolName: 'search_emails',
            input: { query: 'Vercel' },
          },
        ],
        toolCallId: null,
        createdAt: new Date('2026-03-24T08:00:01.000Z'),
      },
      {
        id: 'msg-u1',
        conversationId: 'conv-1',
        role: 'user',
        content: { type: 'text', text: 'cerca le email di Vercel' },
        toolCallId: null,
        createdAt: new Date('2026-03-24T08:00:00.000Z'),
      },
    ]);

    const messages = await service.getMessagesForContext('conv-1');

    // Should have 4 messages: user, assistant (with tool-call), tool, assistant (text)
    expect(messages).toHaveLength(4);

    // All messages should have correct roles (chronological after reverse)
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);

    // No reasoning parts anywhere
    for (const msg of messages) {
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        for (const part of msg.content as any[]) {
          expect(part.type).not.toBe('reasoning');
        }
      }
    }

    // Tool-call in first assistant message should survive
    const firstAssistant = messages[1] as any;
    expect(firstAssistant.content).toHaveLength(2); // text + tool-call (reasoning stripped)
    expect(firstAssistant.content.map((p: any) => p.type)).toEqual(['text', 'tool-call']);

    // Tool result should reference the surviving toolCallId
    const toolMsg = messages[2] as any;
    expect(toolMsg.content[0].toolCallId).toBe('tc-search');

    // Second assistant message: reasoning stripped, only text part remains as array
    const secondAssistant = messages[3] as any;
    expect(secondAssistant.content).toEqual([
      { type: 'text', text: 'Ho trovato 4 email relative a Vercel.' },
    ]);
  });
});
