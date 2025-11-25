import {
  BaseAgent,
  LANGUAGE_MAP,
  ERROR_MESSAGES,
} from './base.agent';
import { AgentContext, AgentIntent } from '../interfaces/agent-context.interface';
import { AgentResult } from '../interfaces/agent-result.interface';
import { AgentActionType, ActionSeverity } from '../interfaces/agent-action.interface';

/**
 * Concrete implementation of BaseAgent for testing
 */
class TestAgent extends BaseAgent {
  readonly name = 'TestAgent';
  readonly description = 'Test agent for unit tests';
  readonly supportedIntents = [AgentIntent.GENERAL, AgentIntent.EMAIL];

  async process(_context: AgentContext): Promise<AgentResult> {
    return this.createTextResponse('Test response');
  }

  // Expose protected methods for testing
  public testCreateTextResponse(message: string): AgentResult {
    return this.createTextResponse(message);
  }

  public testCreateActionResponse(
    message: string,
    actions: any[],
    metadata?: any,
  ): AgentResult {
    return this.createActionResponse(message, actions, metadata);
  }

  public testCreateClarificationResponse(
    message: string,
    questions: string[],
  ): AgentResult {
    return this.createClarificationResponse(message, questions);
  }

  public testDetermineSeverity(
    actionType: AgentActionType,
    payload: Record<string, any>,
  ): ActionSeverity {
    return this.determineSeverity(actionType, payload);
  }

  public testBuildAction(
    type: AgentActionType,
    payload: Record<string, any>,
    confidence: number,
    reasoningSteps?: string,
  ) {
    return this.buildAction(type, payload, confidence, reasoningSteps);
  }

  public testFormatHistory(history?: AgentContext['history'], maxMessages?: number): string {
    return this.formatHistory(history, maxMessages);
  }

  public testGetPreferences(context: AgentContext) {
    return this.getPreferences(context);
  }

  public testGetLanguageName(locale: string): string {
    return this.getLanguageName(locale);
  }

  public testGetLocalizedErrorMessage(errorType: string, locale: string): string {
    return this.getLocalizedErrorMessage(errorType, locale);
  }
}

describe('BaseAgent', () => {
  let agent: TestAgent;

  beforeEach(() => {
    agent = new TestAgent();
  });

  describe('canHandle', () => {
    it('returns true for supported intents', () => {
      expect(agent.canHandle({ userMessage: 'test', intent: AgentIntent.GENERAL })).toBe(true);
      expect(agent.canHandle({ userMessage: 'test', intent: AgentIntent.EMAIL })).toBe(true);
    });

    it('returns false for unsupported intents', () => {
      expect(agent.canHandle({ userMessage: 'test', intent: AgentIntent.CALENDAR })).toBe(false);
      expect(agent.canHandle({ userMessage: 'test', intent: AgentIntent.CONTACTS })).toBe(false);
    });

    it('returns false when intent is not provided', () => {
      expect(agent.canHandle({ userMessage: 'test' })).toBe(false);
    });
  });

  describe('createTextResponse', () => {
    it('creates response with message and empty actions', () => {
      const result = agent.testCreateTextResponse('Hello world');

      expect(result.messages).toEqual(['Hello world']);
      expect(result.actions).toEqual([]);
    });
  });

  describe('createActionResponse', () => {
    it('creates response with message and actions', () => {
      const actions = [
        { type: AgentActionType.SEND_EMAIL, payload: {}, confidence: 0.9, severity: ActionSeverity.HIGH },
      ];

      const result = agent.testCreateActionResponse('Sending email', actions);

      expect(result.messages).toEqual(['Sending email']);
      expect(result.actions).toEqual(actions);
      expect(result.metadata?.agentUsed).toBe('TestAgent');
    });

    it('includes provided metadata', () => {
      const result = agent.testCreateActionResponse(
        'Action',
        [],
        { customField: 'value' },
      );

      expect(result.metadata?.customField).toBe('value');
      expect(result.metadata?.agentUsed).toBe('TestAgent');
    });
  });

  describe('createClarificationResponse', () => {
    it('creates response asking for more info', () => {
      const questions = ['What is the subject?', 'Who should receive the email?'];

      const result = agent.testCreateClarificationResponse('I need more information', questions);

      expect(result.messages).toEqual(['I need more information']);
      expect(result.needsMoreInfo).toBe(true);
      expect(result.clarifyingQuestions).toEqual(questions);
      expect(result.actions).toEqual([]);
    });
  });

  describe('determineSeverity', () => {
    it('returns HIGH for destructive actions', () => {
      expect(agent.testDetermineSeverity(AgentActionType.SEND_EMAIL, {})).toBe(ActionSeverity.HIGH);
      expect(agent.testDetermineSeverity(AgentActionType.DELETE_EMAIL, {})).toBe(ActionSeverity.HIGH);
      expect(agent.testDetermineSeverity(AgentActionType.DELETE_EVENT, {})).toBe(ActionSeverity.HIGH);
      expect(agent.testDetermineSeverity(AgentActionType.DELETE_CONTACT, {})).toBe(ActionSeverity.HIGH);
    });

    it('returns LOW for read-only actions', () => {
      expect(agent.testDetermineSeverity(AgentActionType.MARK_READ, {})).toBe(ActionSeverity.LOW);
      expect(agent.testDetermineSeverity(AgentActionType.SEARCH_EMAILS, {})).toBe(ActionSeverity.LOW);
      expect(agent.testDetermineSeverity(AgentActionType.GET_EVENTS, {})).toBe(ActionSeverity.LOW);
      expect(agent.testDetermineSeverity(AgentActionType.GET_CONTACT, {})).toBe(ActionSeverity.LOW);
    });

    it('returns MEDIUM for other actions', () => {
      expect(agent.testDetermineSeverity(AgentActionType.CREATE_EVENT, {})).toBe(ActionSeverity.MEDIUM);
      expect(agent.testDetermineSeverity(AgentActionType.UPDATE_EVENT, {})).toBe(ActionSeverity.MEDIUM);
      expect(agent.testDetermineSeverity(AgentActionType.CREATE_CONTACT, {})).toBe(ActionSeverity.MEDIUM);
    });
  });

  describe('buildAction', () => {
    it('creates action with proper structure', () => {
      const result = agent.testBuildAction(
        AgentActionType.SEND_EMAIL,
        { to: ['test@example.com'], subject: 'Hello' },
        0.95,
        'User requested to send email',
      );

      expect(result.type).toBe(AgentActionType.SEND_EMAIL);
      expect(result.payload).toEqual({ to: ['test@example.com'], subject: 'Hello' });
      expect(result.confidence).toBe(0.95);
      expect(result.severity).toBe(ActionSeverity.HIGH);
      expect(result.reasoningSteps).toBe('User requested to send email');
    });
  });

  describe('formatHistory', () => {
    it('returns empty string for undefined history', () => {
      expect(agent.testFormatHistory(undefined)).toBe('');
    });

    it('returns empty string for empty history', () => {
      expect(agent.testFormatHistory([])).toBe('');
    });

    it('formats history with role prefixes', () => {
      const history = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ];

      const result = agent.testFormatHistory(history);

      expect(result).toBe('USER: Hello\nASSISTANT: Hi there!');
    });

    it('limits history to maxMessages', () => {
      const history = [
        { role: 'user', content: 'Message 1' },
        { role: 'assistant', content: 'Response 1' },
        { role: 'user', content: 'Message 2' },
        { role: 'assistant', content: 'Response 2' },
        { role: 'user', content: 'Message 3' },
      ];

      const result = agent.testFormatHistory(history, 2);

      // slice(-2) returns the last 2 messages
      expect(result).toBe('ASSISTANT: Response 2\nUSER: Message 3');
      expect(result).not.toContain('Message 1');
    });
  });

  describe('getPreferences', () => {
    it('returns default values when preferences not set', () => {
      const context: AgentContext = {
        tenantId: 'tenant-1',
        userId: 'user-1',
        userMessage: 'test',
      };

      const result = agent.testGetPreferences(context);

      expect(result.language).toBe('en');
      expect(result.timezone).toBe('UTC');
      expect(result.autoApproveThreshold).toBe(0.9);
    });

    it('returns provided preferences', () => {
      const context: AgentContext = {
        tenantId: 'tenant-1',
        userId: 'user-1',
        userMessage: 'test',
        preferences: {
          language: 'it',
          timezone: 'Europe/Rome',
          autoApproveThreshold: 0.8,
        },
      };

      const result = agent.testGetPreferences(context);

      expect(result.language).toBe('it');
      expect(result.timezone).toBe('Europe/Rome');
      expect(result.autoApproveThreshold).toBe(0.8);
    });
  });

  describe('getLanguageName', () => {
    it('maps locale codes to language names', () => {
      expect(agent.testGetLanguageName('en')).toBe('English');
      expect(agent.testGetLanguageName('en-US')).toBe('English');
      expect(agent.testGetLanguageName('it')).toBe('Italian');
      expect(agent.testGetLanguageName('it-IT')).toBe('Italian');
      expect(agent.testGetLanguageName('es')).toBe('Spanish');
      expect(agent.testGetLanguageName('fr')).toBe('French');
      expect(agent.testGetLanguageName('de')).toBe('German');
      expect(agent.testGetLanguageName('pt')).toBe('Portuguese');
    });

    it('falls back to English for unknown locales', () => {
      expect(agent.testGetLanguageName('unknown')).toBe('English');
      expect(agent.testGetLanguageName('xx-XX')).toBe('English');
    });
  });

  describe('getLocalizedErrorMessage', () => {
    it('returns localized error messages', () => {
      expect(agent.testGetLocalizedErrorMessage('general', 'en')).toContain('encountered an error');
      expect(agent.testGetLocalizedErrorMessage('general', 'it')).toContain('riscontrato un errore');
    });

    it('returns domain-specific error messages', () => {
      expect(agent.testGetLocalizedErrorMessage('email', 'en')).toContain('email request');
      expect(agent.testGetLocalizedErrorMessage('calendar', 'en')).toContain('calendar request');
      expect(agent.testGetLocalizedErrorMessage('contacts', 'en')).toContain('contact request');
    });

    it('falls back to English for unknown locale', () => {
      const result = agent.testGetLocalizedErrorMessage('general', 'unknown');
      expect(result).toContain('encountered an error');
    });

    it('falls back to general error for unknown error type', () => {
      const result = agent.testGetLocalizedErrorMessage('unknown_type', 'en');
      expect(result).toContain('encountered an error');
    });
  });

  describe('LANGUAGE_MAP', () => {
    it('contains mappings for common locales', () => {
      expect(LANGUAGE_MAP['en']).toBe('English');
      expect(LANGUAGE_MAP['en-US']).toBe('English');
      expect(LANGUAGE_MAP['en-GB']).toBe('English');
      expect(LANGUAGE_MAP['it']).toBe('Italian');
      expect(LANGUAGE_MAP['it-IT']).toBe('Italian');
    });
  });

  describe('ERROR_MESSAGES', () => {
    it('contains messages for all error types', () => {
      expect(ERROR_MESSAGES.general).toBeDefined();
      expect(ERROR_MESSAGES.email).toBeDefined();
      expect(ERROR_MESSAGES.calendar).toBeDefined();
      expect(ERROR_MESSAGES.contacts).toBeDefined();
      expect(ERROR_MESSAGES.clarification).toBeDefined();
    });

    it('contains messages for common languages', () => {
      expect(ERROR_MESSAGES.general.en).toBeDefined();
      expect(ERROR_MESSAGES.general.it).toBeDefined();
      expect(ERROR_MESSAGES.general.es).toBeDefined();
      expect(ERROR_MESSAGES.general.fr).toBeDefined();
      expect(ERROR_MESSAGES.general.de).toBeDefined();
      expect(ERROR_MESSAGES.general.pt).toBeDefined();
    });
  });
});
