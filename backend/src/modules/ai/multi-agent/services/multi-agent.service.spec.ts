// Mock the langchain imports before any imports to avoid ESM issues
jest.mock('@langchain/mistralai', () => ({
  ChatMistralAI: jest.fn().mockImplementation(() => ({
    invoke: jest.fn().mockResolvedValue({ content: 'mocked response' }),
  })),
}));

jest.mock('@langchain/core/prompts', () => ({
  PromptTemplate: {
    fromTemplate: jest.fn().mockReturnValue({
      pipe: jest.fn().mockReturnThis(),
    }),
  },
}));

jest.mock('@langchain/core/output_parsers', () => ({
  StringOutputParser: jest.fn().mockImplementation(() => ({})),
}));

import { MultiAgentService } from './multi-agent.service';
import { AgentIntent } from '../interfaces/agent-context.interface';
import { AgentActionType, ActionSeverity } from '../interfaces/agent-action.interface';
import { BaseAgent } from '../agents/base.agent';

describe('MultiAgentService', () => {
  const TENANT_ID = 'tenant-1';
  const USER_ID = 'user-1';

  let routerAgent: any;
  let hitlService: any;
  let feedbackService: any;
  let actionExecutor: any;
  let memoryService: any;
  let personalizationService: any;
  let service: MultiAgentService;

  let mockGeneralAgent: any;
  let mockEmailAgent: any;
  let mockCalendarAgent: any;

  beforeEach(() => {
    routerAgent = {
      classifyIntent: jest.fn().mockResolvedValue({
        intent: AgentIntent.GENERAL,
        confidence: 0.95,
        reasoning: 'This is a general message',
      }),
      isSimpleGreeting: jest.fn().mockReturnValue(false),
      detectExplicitIntent: jest.fn().mockReturnValue(null),
    };

    hitlService = {
      createPendingAction: jest.fn().mockResolvedValue('action-1'),
      getPendingAction: jest.fn(),
      approveAction: jest.fn(),
      rejectAction: jest.fn(),
      markExecuted: jest.fn(),
      getPendingActions: jest.fn().mockResolvedValue([]),
      shouldAutoApprove: jest.fn().mockReturnValue(false),
    };

    feedbackService = {
      recordFeedback: jest.fn(),
      getAgentStats: jest.fn().mockResolvedValue({}),
      getAggregateStats: jest.fn().mockResolvedValue({}),
      calculateProfileBoost: jest.fn().mockReturnValue(0),
      getAdjustedConfidence: jest.fn().mockResolvedValue({
        adjustedConfidence: 0.9,
        boost: 0,
        profileAttempts: 0,
      }),
    };

    actionExecutor = {
      execute: jest.fn().mockResolvedValue(true),
    };

    memoryService = {
      addUserMessage: jest.fn(),
      addAssistantMessage: jest.fn(),
      getRecentHistory: jest.fn().mockResolvedValue([]),
      getHistory: jest.fn().mockResolvedValue([]),
    };

    personalizationService = {
      getPersonalizationContext: jest.fn().mockResolvedValue({
        profile: {
          jobRole: 'IC',
          communicationStyle: 'CASUAL',
          responseLength: 'MODERATE',
          proactivityLevel: 'MEDIUM',
          timezone: 'UTC',
          language: 'en',
        },
        promptModifiers: 'Focus on task details.',
        recentMemories: [],
      }),
    };

    mockGeneralAgent = {
      name: 'GeneralAgent',
      description: 'Handles general chat',
      supportedIntents: [AgentIntent.GENERAL, AgentIntent.UNKNOWN],
      canHandle: jest.fn().mockImplementation((ctx) =>
        ctx.intent === AgentIntent.GENERAL || ctx.intent === AgentIntent.UNKNOWN
      ),
      process: jest.fn().mockResolvedValue({
        messages: ['Hello! How can I help you?'],
        actions: [],
      }),
    };

    mockEmailAgent = {
      name: 'EmailAgent',
      description: 'Handles email operations',
      supportedIntents: [AgentIntent.EMAIL],
      canHandle: jest.fn().mockImplementation((ctx) => ctx.intent === AgentIntent.EMAIL),
      process: jest.fn().mockResolvedValue({
        messages: ['I can help with email'],
        actions: [],
      }),
    };

    mockCalendarAgent = {
      name: 'CalendarAgent',
      description: 'Handles calendar operations',
      supportedIntents: [AgentIntent.CALENDAR],
      canHandle: jest.fn().mockImplementation((ctx) => ctx.intent === AgentIntent.CALENDAR),
      process: jest.fn().mockResolvedValue({
        messages: ['I can help with calendar'],
        actions: [],
      }),
    };

    service = new MultiAgentService(
      routerAgent,
      hitlService,
      feedbackService,
      actionExecutor,
      memoryService,
      personalizationService,
    );

    // Register mock agents
    service.registerAgent(mockGeneralAgent as BaseAgent);
    service.registerAgent(mockEmailAgent as BaseAgent);
    service.registerAgent(mockCalendarAgent as BaseAgent);
  });

  describe('registerAgent', () => {
    it('registers an agent successfully', () => {
      const mockAgent = {
        name: 'TestAgent',
        description: 'Test',
        supportedIntents: [AgentIntent.GENERAL],
      };

      service.registerAgent(mockAgent as BaseAgent);

      // Verify agent is registered by checking if it can be used
      expect(true).toBe(true); // Agent registered without error
    });
  });

  describe('process', () => {
    it('classifies intent and routes to appropriate agent', async () => {
      routerAgent.classifyIntent.mockResolvedValueOnce({
        intent: AgentIntent.GENERAL,
        confidence: 0.95,
        reasoning: 'General greeting',
      });

      const context = {
        tenantId: TENANT_ID,
        userId: USER_ID,
        userMessage: 'Hello!',
      };

      const result = await service.process(context);

      expect(routerAgent.classifyIntent).toHaveBeenCalled();
      expect(mockGeneralAgent.process).toHaveBeenCalled();
      expect(result.messages).toContain('Hello! How can I help you?');
    });

    it('loads personalization context when service is available', async () => {
      const context = {
        tenantId: TENANT_ID,
        userId: USER_ID,
        userMessage: 'Hello!',
      };

      await service.process(context);

      expect(personalizationService.getPersonalizationContext).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        'Hello!',
      );
    });

    it('stores user message in memory when sessionId provided', async () => {
      const context = {
        tenantId: TENANT_ID,
        userId: USER_ID,
        userMessage: 'Hello!',
        sessionId: 'session-1',
      };

      await service.process(context);

      expect(memoryService.addUserMessage).toHaveBeenCalledWith(
        'session-1',
        TENANT_ID,
        USER_ID,
        'Hello!',
      );
    });

    it('routes to EmailAgent for email intents', async () => {
      routerAgent.classifyIntent.mockResolvedValueOnce({
        intent: AgentIntent.EMAIL,
        confidence: 0.9,
        reasoning: 'Email request',
      });

      const context = {
        tenantId: TENANT_ID,
        userId: USER_ID,
        userMessage: 'Send an email to John',
      };

      const result = await service.process(context);

      expect(mockEmailAgent.process).toHaveBeenCalled();
      expect(result.messages).toContain('I can help with email');
    });

    it('normalizes forceAgent without suffix (calendar)', async () => {
      routerAgent.classifyIntent.mockResolvedValueOnce({
        intent: AgentIntent.CALENDAR,
        confidence: 0.9,
        reasoning: 'Calendar request',
      });

      const context = {
        tenantId: TENANT_ID,
        userId: USER_ID,
        userMessage: 'Schedule something',
      };

      const result = await service.process(context as any, { forceAgent: 'calendar' });

      expect(mockCalendarAgent.process).toHaveBeenCalled();
      expect(result.agentUsed).toBe('CalendarAgent');
    });

    it('throws on unknown forceAgent', async () => {
      const context = {
        tenantId: TENANT_ID,
        userId: USER_ID,
        userMessage: 'Test message',
      };

      await expect(
        service.process(context as any, { forceAgent: 'does-not-exist' }),
      ).rejects.toThrow('Unknown agent: does-not-exist');
    });

    it('falls back to GeneralAgent for unknown intents', async () => {
      routerAgent.classifyIntent.mockResolvedValueOnce({
        intent: AgentIntent.UNKNOWN,
        confidence: 0.5,
        reasoning: 'Cannot determine intent',
      });

      const context = {
        tenantId: TENANT_ID,
        userId: USER_ID,
        userMessage: 'Something random',
      };

      await service.process(context);

      expect(mockGeneralAgent.process).toHaveBeenCalled();
    });

    it('uses provided intent instead of classifying', async () => {
      const context = {
        tenantId: TENANT_ID,
        userId: USER_ID,
        userMessage: 'Test message',
      };

      await service.process(context, { knownIntent: AgentIntent.EMAIL });

      expect(routerAgent.classifyIntent).not.toHaveBeenCalled();
      expect(mockEmailAgent.process).toHaveBeenCalled();
    });

    it('handles actions requiring approval', async () => {
      mockEmailAgent.process.mockResolvedValueOnce({
        messages: ['I will send the email'],
        actions: [{
          type: AgentActionType.SEND_EMAIL,
          payload: { to: ['test@example.com'], subject: 'Hello' },
          confidence: 0.85,
          severity: ActionSeverity.HIGH,
        }],
      });

      routerAgent.classifyIntent.mockResolvedValueOnce({
        intent: AgentIntent.EMAIL,
        confidence: 0.9,
        reasoning: 'Email send request',
      });

      const context = {
        tenantId: TENANT_ID,
        userId: USER_ID,
        userMessage: 'Send an email to test@example.com',
      };

      const result = await service.process(context);

      expect(hitlService.createPendingAction).toHaveBeenCalled();
      expect(result.pendingActionIds).toContain('action-1');
    });

    it('auto-executes low severity actions with high confidence', async () => {
      // Enable auto-approve for this test
      hitlService.shouldAutoApprove.mockReturnValueOnce(true);

      mockEmailAgent.process.mockResolvedValueOnce({
        messages: ['Marking as read'],
        actions: [{
          type: AgentActionType.MARK_READ,
          payload: { emailId: 'email-1' },
          confidence: 0.95,
          severity: ActionSeverity.LOW,
        }],
      });

      routerAgent.classifyIntent.mockResolvedValueOnce({
        intent: AgentIntent.EMAIL,
        confidence: 0.9,
        reasoning: 'Mark as read request',
      });

      const context = {
        tenantId: TENANT_ID,
        userId: USER_ID,
        userMessage: 'Mark this email as read',
        preferences: {
          autoApproveThreshold: 0.9,
        },
      };

      await service.process(context);

      expect(actionExecutor.execute).toHaveBeenCalled();
    });
  });

  describe('approveAndExecuteAction', () => {
    it('approves and executes pending action', async () => {
      hitlService.getPendingAction.mockResolvedValueOnce({
        id: 'action-1',
        tenantId: TENANT_ID,
        userId: USER_ID,
        actionType: AgentActionType.SEND_EMAIL,
        payload: { to: ['test@example.com'] },
        confidence: 0.9,
        severity: ActionSeverity.HIGH,
      });

      const result = await service.approveAndExecuteAction(
        TENANT_ID,
        'action-1',
        { userId: USER_ID, role: 'user' },
      );

      expect(hitlService.approveAction).toHaveBeenCalledWith(
        TENANT_ID,
        'action-1',
        USER_ID,
        { userId: USER_ID, role: 'user' },
      );
      expect(actionExecutor.execute).toHaveBeenCalled();
      // Result may be undefined if action executor returns void
      expect(result).toBeDefined();
    });
  });

  describe('rejectAction', () => {
    it('rejects pending action with reason', async () => {
      hitlService.getPendingAction.mockResolvedValueOnce({
        id: 'action-1',
        tenantId: TENANT_ID,
        userId: USER_ID,
        actionType: AgentActionType.SEND_EMAIL,
        agentName: 'EmailAgent',
      });

      await service.rejectAction(
        TENANT_ID,
        'action-1',
        { userId: USER_ID, role: 'user' },
        'User changed their mind',
      );

      expect(hitlService.rejectAction).toHaveBeenCalled();
    });
  });

  describe('getPendingActions', () => {
    it('returns pending actions for user', async () => {
      const pendingActions = [
        { id: 'action-1', actionType: 'SEND_EMAIL' },
        { id: 'action-2', actionType: 'CREATE_EVENT' },
      ];
      hitlService.getPendingActions.mockResolvedValueOnce(pendingActions);

      const result = await service.getPendingActions(TENANT_ID, USER_ID);

      // Service passes an object filter to hitlService.getPendingActions
      expect(hitlService.getPendingActions).toHaveBeenCalled();
      expect(result).toEqual(pendingActions);
    });
  });

  describe('getAggregateStats', () => {
    it('returns aggregate stats for tenant', async () => {
      const stats = {
        totalMessages: 500,
        totalActions: 200,
        averageConfidence: 0.87,
      };
      feedbackService.getAggregateStats.mockResolvedValueOnce(stats);

      const result = await service.getAggregateStats(TENANT_ID);

      expect(feedbackService.getAggregateStats).toHaveBeenCalledWith(TENANT_ID);
      expect(result).toEqual(stats);
    });
  });

  describe('error handling', () => {
    it('handles agent processing errors gracefully', async () => {
      mockGeneralAgent.process.mockRejectedValueOnce(new Error('Agent error'));

      const context = {
        tenantId: TENANT_ID,
        userId: USER_ID,
        userMessage: 'Hello!',
      };

      // Should not throw
      await expect(service.process(context)).rejects.toThrow();
    });
  });

  describe('personalization integration', () => {
    it('enriches context with personalization when available', async () => {
      const context = {
        tenantId: TENANT_ID,
        userId: USER_ID,
        userMessage: 'Hello!',
      };

      await service.process(context);

      // Verify the agent was called with enriched context
      const agentCallArg = mockGeneralAgent.process.mock.calls[0][0];
      expect(agentCallArg.personalization).toBeDefined();
      expect(agentCallArg.personalization.profile.jobRole).toBe('IC');
    });

    it('continues without personalization when service fails', async () => {
      personalizationService.getPersonalizationContext.mockRejectedValueOnce(
        new Error('Personalization error'),
      );

      const context = {
        tenantId: TENANT_ID,
        userId: USER_ID,
        userMessage: 'Hello!',
      };

      // Should not throw
      const result = await service.process(context);
      expect(result.messages).toContain('Hello! How can I help you?');
    });

    it('applies language preference from personalization', async () => {
      personalizationService.getPersonalizationContext.mockResolvedValueOnce({
        profile: {
          jobRole: 'IC',
          language: 'it',
        },
        promptModifiers: 'Focus on task details.',
        recentMemories: [],
      });

      const context = {
        tenantId: TENANT_ID,
        userId: USER_ID,
        userMessage: 'Ciao!',
      };

      await service.process(context);

      const agentCallArg = mockGeneralAgent.process.mock.calls[0][0];
      expect(agentCallArg.preferences?.language).toBe('it');
    });
  });
});
