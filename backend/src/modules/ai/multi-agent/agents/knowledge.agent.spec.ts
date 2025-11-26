import { KnowledgeAgent } from './knowledge.agent';
import { KnowledgeBaseService } from '../../services/knowledge-base.service';
import { AgentIntent } from '../interfaces/agent-context.interface';

describe('KnowledgeAgent', () => {
  const TENANT_ID = 'tenant-1';
  const USER_ID = 'user-1';

  let knowledgeBaseService: any;
  let agent: KnowledgeAgent;

  beforeEach(() => {
    knowledgeBaseService = {
      searchKnowledgeBase: jest.fn(),
    };

    agent = new KnowledgeAgent(knowledgeBaseService as unknown as KnowledgeBaseService);
  });

  it('returns bullets when knowledge results are found', async () => {
    knowledgeBaseService.searchKnowledgeBase.mockResolvedValue({
      items: [
        {
          id: 'hit-1',
          subject: 'Doc 1',
          snippet: 'Some content here',
          source: 'email',
          score: 0.9,
          metadata: { emailId: 'e1' },
        },
        {
          id: 'hit-2',
          subject: 'Doc 2',
          snippet: 'Other content',
          source: 'email',
          score: 0.8,
          metadata: { emailId: 'e2' },
        },
      ],
    });

    const result = await agent.process({
      tenantId: TENANT_ID,
      userId: USER_ID,
      userMessage: 'test query',
      intent: AgentIntent.KNOWLEDGE,
    });

    expect(result.messages[0]).toContain('I found these references');
    expect(result.messages.some((m) => m.includes('Doc 1'))).toBe(true);
    expect(result.messages.some((m) => m.includes('Doc 2'))).toBe(true);
    expect(result.actions).toHaveLength(0);
    expect(result.knowledgeHits).toHaveLength(2);
    expect(result.knowledgeHits?.[0]).toMatchObject({
      id: 'hit-1',
      source: 'email',
      metadata: { emailId: 'e1' },
    });
  });

  it('returns clarification message when no results found', async () => {
    knowledgeBaseService.searchKnowledgeBase.mockResolvedValue({
      items: [],
    });

    const result = await agent.process({
      tenantId: TENANT_ID,
      userId: USER_ID,
      userMessage: 'nothing here',
      intent: AgentIntent.KNOWLEDGE,
    });

    expect(result.messages[0]).toContain('No relevant results found');
    expect(result.actions).toHaveLength(0);
  });

  it('returns localized error message on failure', async () => {
    knowledgeBaseService.searchKnowledgeBase.mockRejectedValue(new Error('boom'));

    const result = await agent.process({
      tenantId: TENANT_ID,
      userId: USER_ID,
      userMessage: 'fail please',
      intent: AgentIntent.KNOWLEDGE,
      preferences: { language: 'en' },
    });

    expect(result.messages[0]).toMatch(/sorry/i);
  });
});
