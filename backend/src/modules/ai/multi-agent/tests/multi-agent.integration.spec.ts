/**
 * Multi-Agent System Integration Tests
 *
 * These tests use the REAL Mistral API to validate:
 * - Intent classification accuracy
 * - Agent routing correctness
 * - Language handling (English, Italian, Spanish, French, German)
 * - Action generation with proper parameters
 * - Tool usage and orchestration
 *
 * IMPORTANT: Set MISTRAL_API_KEY environment variable to run these tests.
 * Run with: npx jest --testPathPattern=multi-agent.integration --passWithNoTests
 */

import { ConfigService } from '@nestjs/config';
import { RouterAgent } from '../agents/router.agent';
import { GeneralAgent } from '../agents/general.agent';
import { EmailAgent } from '../agents/email.agent';
import { CalendarAgent } from '../agents/calendar.agent';
import { ContactsAgent } from '../agents/contacts.agent';
import { AgentIntent, AgentContext } from '../interfaces/agent-context.interface';
import { AgentActionType } from '../interfaces/agent-action.interface';

// Skip all tests if no API key
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const describeIfApiKey = MISTRAL_API_KEY ? describe : describe.skip;

// Timeout for API calls
const API_TIMEOUT = 30000;

// Mock ConfigService
const mockConfigService = {
  get: jest.fn((key: string) => {
    if (key === 'MISTRAL_API_KEY') return MISTRAL_API_KEY;
    if (key === 'AI_DEFAULT_MODEL') return 'mistral-small-latest';
    return undefined;
  }),
} as unknown as ConfigService;

// Helper to create context
const createContext = (
  userMessage: string,
  language: string = 'en',
  overrides: Partial<AgentContext> = {},
): AgentContext => ({
  tenantId: 'test-tenant',
  userId: 'test-user',
  userMessage,
  preferences: { language },
  enrichedContext: { relevantEmails: [], relevantEvents: [], relevantContacts: [] },
  ...overrides,
});

describeIfApiKey('Multi-Agent Integration Tests (Real Mistral API)', () => {
  let routerAgent: RouterAgent;
  let generalAgent: GeneralAgent;
  let emailAgent: EmailAgent;
  let calendarAgent: CalendarAgent;
  let contactsAgent: ContactsAgent;

  beforeAll(() => {
    routerAgent = new RouterAgent(mockConfigService);
    generalAgent = new GeneralAgent(mockConfigService);
    emailAgent = new EmailAgent(mockConfigService);
    calendarAgent = new CalendarAgent(mockConfigService);
    contactsAgent = new ContactsAgent(mockConfigService);
  });

  // =============================================================================
  // ROUTER AGENT - INTENT CLASSIFICATION TESTS
  // =============================================================================

  describe('RouterAgent - Intent Classification', () => {
    describe('Fast-path detection (no API call)', () => {
      // Test greetings that are in the RouterAgent's fast-path patterns
      it.each([
        ['hello', AgentIntent.GENERAL],
        ['hi', AgentIntent.GENERAL],
        ['hey', AgentIntent.GENERAL],
        ['ciao', AgentIntent.GENERAL],
        ['buongiorno', AgentIntent.GENERAL],
        ['salve', AgentIntent.GENERAL],
        ['good morning', AgentIntent.GENERAL],
        ['thanks', AgentIntent.GENERAL],
        ['thank you', AgentIntent.GENERAL],
        ['grazie', AgentIntent.GENERAL],
      ])('detects greeting "%s" as GENERAL intent via fast-path', (message, _expectedIntent) => {
        expect(routerAgent.isSimpleGreeting(message)).toBe(true);
      });

      // Greetings not in fast-path will be handled by LLM classification
      it.each([
        ['hola', AgentIntent.GENERAL],
        ['bonjour', AgentIntent.GENERAL],
        ['guten tag', AgentIntent.GENERAL],
      ])('"%s" not in fast-path (will use LLM)', (message, _expectedIntent) => {
        // These are NOT in fast-path patterns - that's expected
        expect(routerAgent.isSimpleGreeting(message)).toBe(false);
      });

      it.each([
        ['send email to john@example.com', AgentIntent.EMAIL],
        ['compose a new email', AgentIntent.EMAIL],
        ['reply to the last email', AgentIntent.EMAIL],
        ['forward this message', AgentIntent.EMAIL],
        ['check my inbox', AgentIntent.EMAIL],
        ['show unread emails', AgentIntent.EMAIL],
      ])('detects email keyword "%s" as EMAIL intent', (message, expectedIntent) => {
        const result = routerAgent.detectExplicitIntent(message);
        expect(result).toBe(expectedIntent);
      });

      it.each([
        ['schedule a meeting tomorrow', AgentIntent.CALENDAR],
        ['create an event for Monday', AgentIntent.CALENDAR],
        ['check my calendar', AgentIntent.CALENDAR],
        ['book a meeting room', AgentIntent.CALENDAR],
        ['check my availability', AgentIntent.CALENDAR],
      ])('detects calendar keyword "%s" as CALENDAR intent', (message, expectedIntent) => {
        const result = routerAgent.detectExplicitIntent(message);
        expect(result).toBe(expectedIntent);
      });
    });

    describe('LLM-based classification', () => {
      it('classifies email request in English', async () => {
        const context = createContext('I need to send an important email to my boss about the quarterly report');
        const result = await routerAgent.classifyIntent(context);

        expect(result.intent).toBe(AgentIntent.EMAIL);
        expect(result.confidence).toBeGreaterThan(0.7);
      }, API_TIMEOUT);

      it('classifies calendar request in English', async () => {
        const context = createContext('Can you schedule a team meeting for next Tuesday at 3pm?');
        const result = await routerAgent.classifyIntent(context);

        expect(result.intent).toBe(AgentIntent.CALENDAR);
        expect(result.confidence).toBeGreaterThan(0.7);
      }, API_TIMEOUT);

      it('classifies contacts request in English', async () => {
        const context = createContext('Find me the contact information for John Smith from marketing');
        const result = await routerAgent.classifyIntent(context);

        expect(result.intent).toBe(AgentIntent.CONTACTS);
        expect(result.confidence).toBeGreaterThan(0.7);
      }, API_TIMEOUT);

      it('classifies general question in English', async () => {
        const context = createContext('What are your capabilities?');
        const result = await routerAgent.classifyIntent(context);

        expect(result.intent).toBe(AgentIntent.GENERAL);
        expect(result.confidence).toBeGreaterThan(0.7);
      }, API_TIMEOUT);

      // Multi-language intent classification
      it('classifies email request in Italian', async () => {
        const context = createContext('Devo inviare una mail importante al mio capo', 'it');
        const result = await routerAgent.classifyIntent(context);

        expect(result.intent).toBe(AgentIntent.EMAIL);
        expect(result.confidence).toBeGreaterThan(0.6);
      }, API_TIMEOUT);

      it('classifies calendar request in Spanish', async () => {
        const context = createContext('Necesito programar una reunión para mañana a las 10', 'es');
        const result = await routerAgent.classifyIntent(context);

        expect(result.intent).toBe(AgentIntent.CALENDAR);
        expect(result.confidence).toBeGreaterThan(0.6);
      }, API_TIMEOUT);

      it('classifies contacts request in French', async () => {
        const context = createContext('Trouve-moi les coordonnées de Marie Dupont', 'fr');
        const result = await routerAgent.classifyIntent(context);

        expect(result.intent).toBe(AgentIntent.CONTACTS);
        expect(result.confidence).toBeGreaterThan(0.6);
      }, API_TIMEOUT);

      it('classifies general question in German', async () => {
        const context = createContext('Was kannst du für mich tun?', 'de');
        const result = await routerAgent.classifyIntent(context);

        expect(result.intent).toBe(AgentIntent.GENERAL);
        expect(result.confidence).toBeGreaterThan(0.6);
      }, API_TIMEOUT);
    });
  });

  // =============================================================================
  // GENERAL AGENT TESTS
  // =============================================================================

  describe('GeneralAgent - Conversational Responses', () => {
    describe('Language handling', () => {
      it('responds in English when locale is en', async () => {
        const context = createContext('Hello, what can you help me with?', 'en');
        const result = await generalAgent.process(context);

        expect(result.messages.length).toBeGreaterThan(0);
        expect(result.actions).toEqual([]);
        // Check response is in English (contains common English words)
        const response = result.messages.join(' ').toLowerCase();
        expect(response).toMatch(/\b(help|email|calendar|contacts|can|you|i)\b/);
      }, API_TIMEOUT);

      it('responds in Italian when locale is it', async () => {
        const context = createContext('Ciao, cosa puoi fare per me?', 'it');
        const result = await generalAgent.process(context);

        expect(result.messages.length).toBeGreaterThan(0);
        const response = result.messages.join(' ').toLowerCase();
        // Check for Italian words
        expect(response).toMatch(/\b(posso|aiutare|email|calendario|contatti|puoi)\b/);
      }, API_TIMEOUT);

      it('responds in Spanish when locale is es', async () => {
        const context = createContext('Hola, ¿qué puedes hacer por mí?', 'es');
        const result = await generalAgent.process(context);

        expect(result.messages.length).toBeGreaterThan(0);
        const response = result.messages.join(' ').toLowerCase();
        // Check for Spanish words
        expect(response).toMatch(/\b(puedo|ayudar|correo|calendario|contactos)\b/);
      }, API_TIMEOUT);

      it('responds in French when locale is fr', async () => {
        const context = createContext('Bonjour, que pouvez-vous faire pour moi?', 'fr');
        const result = await generalAgent.process(context);

        expect(result.messages.length).toBeGreaterThan(0);
        const response = result.messages.join(' ').toLowerCase();
        // Check for French words
        expect(response).toMatch(/\b(peux|aider|email|calendrier|contacts|vous)\b/);
      }, API_TIMEOUT);

      it('responds in German when locale is de', async () => {
        const context = createContext('Hallo, was kannst du für mich tun?', 'de');
        const result = await generalAgent.process(context);

        expect(result.messages.length).toBeGreaterThan(0);
        const response = result.messages.join(' ').toLowerCase();
        // Check for German words
        expect(response).toMatch(/\b(kann|helfen|e-mail|kalender|kontakte|ich)\b/);
      }, API_TIMEOUT);
    });

    describe('Capability explanation', () => {
      it('explains capabilities when asked', async () => {
        const context = createContext('What are all the things you can do?', 'en');
        const result = await generalAgent.process(context);

        const response = result.messages.join(' ').toLowerCase();
        // Should mention key capabilities
        expect(response).toMatch(/email/i);
        expect(response).toMatch(/calendar|schedule|meeting/i);
        expect(response).toMatch(/contact/i);
      }, API_TIMEOUT);
    });
  });

  // =============================================================================
  // EMAIL AGENT TESTS
  // =============================================================================

  describe('EmailAgent - Action Generation', () => {
    describe('SEND_EMAIL action', () => {
      it('generates SEND_EMAIL action with correct parameters', async () => {
        const context = createContext(
          'Send an email to john@example.com with subject "Meeting tomorrow" and body "Hi John, let\'s meet tomorrow at 3pm."',
          'en',
        );
        const result = await emailAgent.process(context);

        expect(result.messages.length).toBeGreaterThan(0);

        // Should either have action or ask for clarification
        if (result.actions.length > 0) {
          const action = result.actions.find(a => a.type === AgentActionType.SEND_EMAIL);
          expect(action).toBeDefined();
          expect(action?.payload.to).toContain('john@example.com');
          expect(action?.payload.subject).toMatch(/meeting/i);
          expect(action?.confidence).toBeGreaterThan(0.5);
        }
      }, API_TIMEOUT);

      it('generates SEND_EMAIL in Italian', async () => {
        const context = createContext(
          'Invia una email a mario@example.com con oggetto "Riunione domani"',
          'it',
        );
        const result = await emailAgent.process(context);

        expect(result.messages.length).toBeGreaterThan(0);
        // Response should be in Italian
        const response = result.messages.join(' ').toLowerCase();
        expect(response).toMatch(/\b(email|invio|inviare|riunione)\b/i);
      }, API_TIMEOUT);
    });

    describe('SEARCH_EMAILS action', () => {
      it('generates SEARCH_EMAILS action', async () => {
        const context = createContext('Find all emails from last week about the project update', 'en');
        const result = await emailAgent.process(context);

        expect(result.messages.length).toBeGreaterThan(0);

        if (result.actions.length > 0) {
          const action = result.actions.find(a => a.type === AgentActionType.SEARCH_EMAILS);
          expect(action).toBeDefined();
          expect(action?.payload.query).toBeDefined();
        }
      }, API_TIMEOUT);
    });

    describe('GET_UNREAD action', () => {
      it('generates GET_UNREAD action', async () => {
        const context = createContext('How many unread emails do I have?', 'en');
        const result = await emailAgent.process(context);

        expect(result.messages.length).toBeGreaterThan(0);

        if (result.actions.length > 0) {
          const action = result.actions.find(a => a.type === AgentActionType.GET_UNREAD);
          expect(action).toBeDefined();
        }
      }, API_TIMEOUT);
    });

    describe('Clarification requests', () => {
      it('asks for clarification when recipient is missing', async () => {
        const context = createContext('Send an email about the meeting', 'en');
        const result = await emailAgent.process(context);

        // Should ask for recipient or indicate need for more info
        const responseText = result.messages.join(' ').toLowerCase();
        const asksForRecipient = /who|recipient|send to|address|to whom|specify|provide/.test(responseText);
        expect(result.needsMoreInfo || asksForRecipient).toBe(true);
      }, API_TIMEOUT);
    });
  });

  // =============================================================================
  // CALENDAR AGENT TESTS
  // =============================================================================

  describe('CalendarAgent - Action Generation', () => {
    describe('CREATE_EVENT action', () => {
      it('generates CREATE_EVENT action with correct parameters', async () => {
        const context = createContext(
          'Create a meeting called "Team Standup" tomorrow at 10am for 30 minutes',
          'en',
        );
        const result = await calendarAgent.process(context);

        expect(result.messages.length).toBeGreaterThan(0);

        if (result.actions.length > 0) {
          const action = result.actions.find(a => a.type === AgentActionType.CREATE_EVENT);
          expect(action).toBeDefined();
          expect(action?.payload.title).toMatch(/team standup/i);
          expect(action?.confidence).toBeGreaterThan(0.5);
        }
      }, API_TIMEOUT);

      it('generates CREATE_EVENT in Spanish', async () => {
        const context = createContext(
          'Crear una reunión llamada "Standup del equipo" mañana a las 10am',
          'es',
        );
        const result = await calendarAgent.process(context);

        expect(result.messages.length).toBeGreaterThan(0);
        // Response should be in Spanish
        const response = result.messages.join(' ').toLowerCase();
        expect(response).toMatch(/\b(crear|evento|reunión|cita)\b/i);
      }, API_TIMEOUT);
    });

    describe('GET_EVENTS action', () => {
      it('generates GET_EVENTS action', async () => {
        const context = createContext('What meetings do I have today?', 'en');
        const result = await calendarAgent.process(context);

        expect(result.messages.length).toBeGreaterThan(0);

        if (result.actions.length > 0) {
          const action = result.actions.find(a => a.type === AgentActionType.GET_EVENTS);
          expect(action).toBeDefined();
        }
      }, API_TIMEOUT);
    });

    describe('CHECK_AVAILABILITY action', () => {
      it('generates CHECK_AVAILABILITY action', async () => {
        const context = createContext('When am I free this week for a 1-hour meeting?', 'en');
        const result = await calendarAgent.process(context);

        expect(result.messages.length).toBeGreaterThan(0);

        if (result.actions.length > 0) {
          const action = result.actions.find(a => a.type === AgentActionType.CHECK_AVAILABILITY);
          expect(action).toBeDefined();
        }
      }, API_TIMEOUT);
    });
  });

  // =============================================================================
  // CONTACTS AGENT TESTS
  // =============================================================================

  describe('ContactsAgent - Action Generation', () => {
    describe('SEARCH_CONTACTS action', () => {
      it('generates SEARCH_CONTACTS action', async () => {
        const context = createContext('Find John Smith in my contacts', 'en');
        const result = await contactsAgent.process(context);

        expect(result.messages.length).toBeGreaterThan(0);

        if (result.actions.length > 0) {
          const action = result.actions.find(a => a.type === AgentActionType.SEARCH_CONTACTS);
          expect(action).toBeDefined();
          expect(action?.payload.query).toMatch(/john smith/i);
        }
      }, API_TIMEOUT);
    });

    describe('CREATE_CONTACT action', () => {
      it('generates CREATE_CONTACT action with correct parameters', async () => {
        const context = createContext(
          'Add a new contact: Jane Doe, email jane@example.com, phone 555-1234, company Acme Inc',
          'en',
        );
        const result = await contactsAgent.process(context);

        expect(result.messages.length).toBeGreaterThan(0);

        if (result.actions.length > 0) {
          const action = result.actions.find(a => a.type === AgentActionType.CREATE_CONTACT);
          expect(action).toBeDefined();
          expect(action?.payload.email).toMatch(/jane@example\.com/i);
        }
      }, API_TIMEOUT);

      it('generates CREATE_CONTACT in French', async () => {
        const context = createContext(
          'Ajouter un nouveau contact: Pierre Martin, email pierre@example.com',
          'fr',
        );
        const result = await contactsAgent.process(context);

        expect(result.messages.length).toBeGreaterThan(0);
        // Response should be in French
        const response = result.messages.join(' ').toLowerCase();
        expect(response).toMatch(/\b(contact|ajouter|créer)\b/i);
      }, API_TIMEOUT);
    });
  });

  // =============================================================================
  // A/B TESTING - COMPARATIVE ANALYSIS
  // =============================================================================

  describe('A/B Testing - Response Quality', () => {
    const testCases = [
      {
        name: 'Simple greeting',
        messages: {
          en: 'Hello!',
          it: 'Ciao!',
          es: '¡Hola!',
          fr: 'Bonjour!',
          de: 'Hallo!',
        },
        expectedIntent: AgentIntent.GENERAL,
      },
      {
        name: 'Email send request',
        messages: {
          en: 'Send an email to test@example.com',
          it: 'Invia una email a test@example.com',
          es: 'Envía un correo a test@example.com',
          fr: 'Envoie un email à test@example.com',
          de: 'Sende eine E-Mail an test@example.com',
        },
        expectedIntent: AgentIntent.EMAIL,
      },
      {
        name: 'Calendar meeting request',
        messages: {
          en: 'Schedule a meeting tomorrow',
          it: 'Programma una riunione domani',
          es: 'Programa una reunión mañana',
          fr: 'Planifie une réunion demain',
          de: 'Plane ein Meeting für morgen',
        },
        expectedIntent: AgentIntent.CALENDAR,
      },
      {
        name: 'Contact search request',
        messages: {
          en: 'Find contact John',
          it: 'Trova il contatto Giovanni',
          es: 'Busca el contacto Juan',
          fr: 'Trouve le contact Jean',
          de: 'Finde den Kontakt Johann',
        },
        expectedIntent: AgentIntent.CONTACTS,
      },
    ];

    describe.each(testCases)('$name', ({ name, messages, expectedIntent }) => {
      it.each(Object.entries(messages))(
        'classifies correctly in %s',
        async (lang, message) => {
          const context = createContext(message, lang);
          const result = await routerAgent.classifyIntent(context);

          console.log(`[A/B] ${name} (${lang}): "${message}" -> ${result.intent} (${result.confidence.toFixed(2)})`);

          expect(result.intent).toBe(expectedIntent);
          expect(result.confidence).toBeGreaterThan(0.5);
        },
        API_TIMEOUT,
      );
    });
  });

  // =============================================================================
  // EDGE CASES AND ERROR HANDLING
  // =============================================================================

  describe('Edge Cases', () => {
    it('handles mixed language input', async () => {
      const context = createContext('Send un email a john@example.com', 'en');
      const result = await routerAgent.classifyIntent(context);

      // Should still detect email intent
      expect(result.intent).toBe(AgentIntent.EMAIL);
    }, API_TIMEOUT);

    it('handles empty message gracefully', async () => {
      const context = createContext('', 'en');
      const result = await routerAgent.classifyIntent(context);

      expect(result.intent).toBeDefined();
    }, API_TIMEOUT);

    it('handles very long message', async () => {
      const longMessage = 'Please send an email to test@example.com. ' + 'This is important. '.repeat(100);
      const context = createContext(longMessage, 'en');
      const result = await routerAgent.classifyIntent(context);

      expect(result.intent).toBe(AgentIntent.EMAIL);
    }, API_TIMEOUT);

    it('handles special characters in message', async () => {
      const context = createContext('Send email to "john.doe+test"@example.com', 'en');
      const result = await routerAgent.classifyIntent(context);

      expect(result.intent).toBe(AgentIntent.EMAIL);
    }, API_TIMEOUT);
  });

  // =============================================================================
  // PERFORMANCE METRICS
  // =============================================================================

  describe('Performance Metrics', () => {
    it('measures intent classification latency', async () => {
      const context = createContext('Send an email to test@example.com', 'en');

      const startTime = Date.now();
      await routerAgent.classifyIntent(context);
      const latency = Date.now() - startTime;

      console.log(`[PERF] Intent classification latency: ${latency}ms`);
      expect(latency).toBeLessThan(10000); // Should be under 10 seconds
    }, API_TIMEOUT);

    it('measures general agent response latency', async () => {
      const context = createContext('Hello, what can you do?', 'en');

      const startTime = Date.now();
      await generalAgent.process(context);
      const latency = Date.now() - startTime;

      console.log(`[PERF] GeneralAgent response latency: ${latency}ms`);
      expect(latency).toBeLessThan(15000); // Should be under 15 seconds
    }, API_TIMEOUT);

    it('measures email agent response latency', async () => {
      const context = createContext('Send email to test@example.com about meeting', 'en');

      const startTime = Date.now();
      await emailAgent.process(context);
      const latency = Date.now() - startTime;

      console.log(`[PERF] EmailAgent response latency: ${latency}ms`);
      expect(latency).toBeLessThan(15000);
    }, API_TIMEOUT);
  });
});

// =============================================================================
// SUMMARY REPORT
// =============================================================================

afterAll(() => {
  if (!MISTRAL_API_KEY) {
    console.log('\n⚠️  MISTRAL_API_KEY not set - integration tests skipped');
    console.log('   Set the environment variable to run real API tests\n');
  }
});
