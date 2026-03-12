/**
 * ConversationToolsService Unit Tests
 *
 * Tests the ask_user tool for structured clarification requests.
 */
import { ConversationToolsService } from './conversation-tools.service';

describe('ConversationToolsService', () => {
  let service: ConversationToolsService;

  beforeEach(() => {
    service = new ConversationToolsService();
  });

  describe('getTools', () => {
    it('returns an object with ask_user tool', () => {
      const tools = service.getTools();
      expect(tools).toHaveProperty('ask_user');
    });

    it('ask_user tool has execute function', () => {
      const tools = service.getTools();
      expect(typeof tools.ask_user.execute).toBe('function');
    });
  });

  describe('ask_user tool execution', () => {
    it('returns clarification_request with question', async () => {
      const tools = service.getTools();
      const result = await tools.ask_user.execute(
        { question: 'Which email?', options: undefined, context: undefined },
        { toolCallId: 'test-1', messages: [], abortSignal: undefined as any },
      );

      expect(result).toEqual({
        type: 'clarification_request',
        question: 'Which email?',
        options: [],
        context: null,
      });
    });

    it('returns options when provided', async () => {
      const tools = service.getTools();
      const result = await tools.ask_user.execute(
        {
          question: 'Which Monica?',
          options: ['Monica Ricotto', 'Monica Bellucci'],
          context: 'Multiple contacts match',
        },
        { toolCallId: 'test-2', messages: [], abortSignal: undefined as any },
      );

      expect(result).toEqual({
        type: 'clarification_request',
        question: 'Which Monica?',
        options: ['Monica Ricotto', 'Monica Bellucci'],
        context: 'Multiple contacts match',
      });
    });

    it('handles empty options array', async () => {
      const tools = service.getTools();
      const result = await tools.ask_user.execute(
        { question: 'What do you mean?', options: [], context: undefined },
        { toolCallId: 'test-3', messages: [], abortSignal: undefined as any },
      );

      expect(result.options).toEqual([]);
    });

    it('handles missing optional fields', async () => {
      const tools = service.getTools();
      const result = await tools.ask_user.execute(
        { question: 'Can you clarify?' } as any,
        { toolCallId: 'test-4', messages: [], abortSignal: undefined as any },
      );

      expect(result.type).toBe('clarification_request');
      expect(result.question).toBe('Can you clarify?');
    });
  });
});
