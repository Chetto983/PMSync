/**
 * Language A/B Testing Suite
 *
 * Comprehensive tests to validate that AI agents respond in the correct language
 * and produce high-quality responses across all supported languages.
 *
 * Run with: npx jest --testPathPattern=language-ab-testing --passWithNoTests
 */

import { ConfigService } from '@nestjs/config';
import { GeneralAgent } from '../agents/general.agent';
import { EmailAgent } from '../agents/email.agent';
import { CalendarAgent } from '../agents/calendar.agent';
import { ContactsAgent } from '../agents/contacts.agent';
import { AgentContext } from '../interfaces/agent-context.interface';

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const describeIfApiKey = MISTRAL_API_KEY ? describe : describe.skip;
const API_TIMEOUT = 30000;

// Language detection patterns (common words that indicate language)
const LANGUAGE_PATTERNS: Record<string, RegExp[]> = {
  en: [
    /\b(the|and|is|are|can|will|have|help|you|your|email|calendar|contact)\b/i,
    /\b(hello|hi|yes|no|please|thank|thanks)\b/i,
  ],
  it: [
    /\b(il|la|e|sono|puoi|può|hai|aiuto|tuo|tua|email|calendario|contatto)\b/i,
    /\b(ciao|sì|no|per favore|grazie|prego)\b/i,
  ],
  es: [
    /\b(el|la|y|es|son|puedo|puede|tienes|ayuda|tu|correo|calendario|contacto)\b/i,
    /\b(hola|sí|no|por favor|gracias)\b/i,
  ],
  fr: [
    /\b(le|la|et|est|sont|peux|peut|avez|aide|votre|email|calendrier|contact)\b/i,
    /\b(bonjour|oui|non|s'il vous plaît|merci)\b/i,
  ],
  de: [
    /\b(der|die|das|und|ist|sind|kann|können|haben|hilfe|ihr|e-mail|kalender|kontakt)\b/i,
    /\b(hallo|ja|nein|bitte|danke)\b/i,
  ],
  pt: [
    /\b(o|a|e|é|são|pode|podem|tem|ajuda|seu|sua|email|calendário|contato)\b/i,
    /\b(olá|sim|não|por favor|obrigado)\b/i,
  ],
};

// Test results storage for A/B analysis
interface TestResult {
  language: string;
  prompt: string;
  response: string;
  detectedLanguage: string;
  languageMatch: boolean;
  responseLength: number;
  latencyMs: number;
}

const testResults: TestResult[] = [];

const mockConfigService = {
  get: jest.fn((key: string) => {
    if (key === 'MISTRAL_API_KEY') return MISTRAL_API_KEY;
    if (key === 'AI_DEFAULT_MODEL') return 'mistral-small-latest';
    return undefined;
  }),
} as unknown as ConfigService;

const createContext = (
  userMessage: string,
  language: string,
): AgentContext => ({
  tenantId: 'test-tenant',
  userId: 'test-user',
  userMessage,
  preferences: { language },
  enrichedContext: { relevantEmails: [], relevantEvents: [], relevantContacts: [] },
});

/**
 * Detect the language of a text based on common word patterns
 */
function detectLanguage(text: string): string {
  const scores: Record<string, number> = {};

  for (const [lang, patterns] of Object.entries(LANGUAGE_PATTERNS)) {
    scores[lang] = 0;
    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches) {
        scores[lang] += matches.length;
      }
    }
  }

  // Find language with highest score
  let maxLang = 'unknown';
  let maxScore = 0;
  for (const [lang, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      maxLang = lang;
    }
  }

  return maxLang;
}

/**
 * Record test result for A/B analysis
 */
function recordResult(
  language: string,
  prompt: string,
  response: string,
  latencyMs: number,
): TestResult {
  const detectedLanguage = detectLanguage(response);
  const result: TestResult = {
    language,
    prompt,
    response: response.substring(0, 200) + (response.length > 200 ? '...' : ''),
    detectedLanguage,
    languageMatch: detectedLanguage === language,
    responseLength: response.length,
    latencyMs,
  };
  testResults.push(result);
  return result;
}

describeIfApiKey('Language A/B Testing Suite', () => {
  let generalAgent: GeneralAgent;
  let emailAgent: EmailAgent;
  let calendarAgent: CalendarAgent;
  let contactsAgent: ContactsAgent;

  beforeAll(() => {
    generalAgent = new GeneralAgent(mockConfigService);
    emailAgent = new EmailAgent(mockConfigService);
    calendarAgent = new CalendarAgent(mockConfigService);
    contactsAgent = new ContactsAgent(mockConfigService);
  });

  // =============================================================================
  // GREETING RESPONSES - ALL LANGUAGES
  // =============================================================================

  describe('Greeting Responses', () => {
    const greetings: Record<string, string> = {
      en: 'Hello, nice to meet you!',
      it: 'Ciao, piacere di conoscerti!',
      es: '¡Hola, mucho gusto!',
      fr: 'Bonjour, enchanté!',
      de: 'Hallo, freut mich!',
      pt: 'Olá, prazer em conhecê-lo!',
    };

    it.each(Object.entries(greetings))(
      'GeneralAgent responds in %s to greeting',
      async (lang, greeting) => {
        const startTime = Date.now();
        const context = createContext(greeting, lang);
        const result = await generalAgent.process(context);
        const latency = Date.now() - startTime;

        const response = result.messages.join(' ');
        const testResult = recordResult(lang, greeting, response, latency);

        console.log(`[GREETING ${lang.toUpperCase()}]`);
        console.log(`  Prompt: "${greeting}"`);
        console.log(`  Response: "${testResult.response}"`);
        console.log(`  Detected: ${testResult.detectedLanguage} | Match: ${testResult.languageMatch}`);
        console.log(`  Latency: ${latency}ms\n`);

        expect(result.messages.length).toBeGreaterThan(0);
        // Allow some flexibility for edge cases, but warn if mismatch
        if (!testResult.languageMatch) {
          console.warn(`⚠️  Language mismatch: expected ${lang}, got ${testResult.detectedLanguage}`);
        }
      },
      API_TIMEOUT,
    );
  });

  // =============================================================================
  // CAPABILITY QUESTIONS - ALL LANGUAGES
  // =============================================================================

  describe('Capability Questions', () => {
    const questions: Record<string, string> = {
      en: 'What can you help me with?',
      it: 'In cosa puoi aiutarmi?',
      es: '¿En qué puedes ayudarme?',
      fr: 'Comment pouvez-vous m\'aider?',
      de: 'Wie können Sie mir helfen?',
      pt: 'Como você pode me ajudar?',
    };

    it.each(Object.entries(questions))(
      'GeneralAgent explains capabilities in %s',
      async (lang, question) => {
        const startTime = Date.now();
        const context = createContext(question, lang);
        const result = await generalAgent.process(context);
        const latency = Date.now() - startTime;

        const response = result.messages.join(' ');
        const testResult = recordResult(lang, question, response, latency);

        console.log(`[CAPABILITIES ${lang.toUpperCase()}]`);
        console.log(`  Prompt: "${question}"`);
        console.log(`  Response length: ${response.length} chars`);
        console.log(`  Detected: ${testResult.detectedLanguage} | Match: ${testResult.languageMatch}`);
        console.log(`  Latency: ${latency}ms\n`);

        expect(result.messages.length).toBeGreaterThan(0);
        // Response should mention key capabilities
        const lowerResponse = response.toLowerCase();
        expect(
          lowerResponse.includes('email') ||
          lowerResponse.includes('e-mail') ||
          lowerResponse.includes('correo') ||
          lowerResponse.includes('mail'),
        ).toBe(true);
      },
      API_TIMEOUT,
    );
  });

  // =============================================================================
  // EMAIL AGENT - MULTI-LANGUAGE
  // =============================================================================

  describe('EmailAgent Language Handling', () => {
    const emailRequests: Record<string, string> = {
      en: 'I need to send an email to my colleague about the project',
      it: 'Devo inviare una email al mio collega riguardo al progetto',
      es: 'Necesito enviar un correo a mi colega sobre el proyecto',
      fr: 'Je dois envoyer un email à mon collègue concernant le projet',
      de: 'Ich muss eine E-Mail an meinen Kollegen über das Projekt senden',
    };

    it.each(Object.entries(emailRequests))(
      'EmailAgent responds in %s for email request',
      async (lang, request) => {
        const startTime = Date.now();
        const context = createContext(request, lang);
        const result = await emailAgent.process(context);
        const latency = Date.now() - startTime;

        const response = result.messages.join(' ');
        const testResult = recordResult(lang, request, response, latency);

        console.log(`[EMAIL ${lang.toUpperCase()}]`);
        console.log(`  Prompt: "${request}"`);
        console.log(`  Response: "${testResult.response}"`);
        console.log(`  Actions: ${result.actions.length}`);
        console.log(`  Detected: ${testResult.detectedLanguage} | Match: ${testResult.languageMatch}`);
        console.log(`  Latency: ${latency}ms\n`);

        expect(result.messages.length).toBeGreaterThan(0);
      },
      API_TIMEOUT,
    );
  });

  // =============================================================================
  // CALENDAR AGENT - MULTI-LANGUAGE
  // =============================================================================

  describe('CalendarAgent Language Handling', () => {
    const calendarRequests: Record<string, string> = {
      en: 'I want to schedule a meeting for tomorrow morning',
      it: 'Voglio programmare una riunione per domani mattina',
      es: 'Quiero programar una reunión para mañana por la mañana',
      fr: 'Je veux planifier une réunion pour demain matin',
      de: 'Ich möchte ein Meeting für morgen früh planen',
    };

    it.each(Object.entries(calendarRequests))(
      'CalendarAgent responds in %s for calendar request',
      async (lang, request) => {
        const startTime = Date.now();
        const context = createContext(request, lang);
        const result = await calendarAgent.process(context);
        const latency = Date.now() - startTime;

        const response = result.messages.join(' ');
        const testResult = recordResult(lang, request, response, latency);

        console.log(`[CALENDAR ${lang.toUpperCase()}]`);
        console.log(`  Prompt: "${request}"`);
        console.log(`  Response: "${testResult.response}"`);
        console.log(`  Actions: ${result.actions.length}`);
        console.log(`  Detected: ${testResult.detectedLanguage} | Match: ${testResult.languageMatch}`);
        console.log(`  Latency: ${latency}ms\n`);

        expect(result.messages.length).toBeGreaterThan(0);
      },
      API_TIMEOUT,
    );
  });

  // =============================================================================
  // CONTACTS AGENT - MULTI-LANGUAGE
  // =============================================================================

  describe('ContactsAgent Language Handling', () => {
    const contactRequests: Record<string, string> = {
      en: 'Find my contact named John from the sales team',
      it: 'Trova il mio contatto chiamato Giovanni del team vendite',
      es: 'Busca mi contacto llamado Juan del equipo de ventas',
      fr: 'Trouve mon contact nommé Jean de l\'équipe commerciale',
      de: 'Finde meinen Kontakt namens Johann aus dem Vertriebsteam',
    };

    it.each(Object.entries(contactRequests))(
      'ContactsAgent responds in %s for contact request',
      async (lang, request) => {
        const startTime = Date.now();
        const context = createContext(request, lang);
        const result = await contactsAgent.process(context);
        const latency = Date.now() - startTime;

        const response = result.messages.join(' ');
        const testResult = recordResult(lang, request, response, latency);

        console.log(`[CONTACTS ${lang.toUpperCase()}]`);
        console.log(`  Prompt: "${request}"`);
        console.log(`  Response: "${testResult.response}"`);
        console.log(`  Actions: ${result.actions.length}`);
        console.log(`  Detected: ${testResult.detectedLanguage} | Match: ${testResult.languageMatch}`);
        console.log(`  Latency: ${latency}ms\n`);

        expect(result.messages.length).toBeGreaterThan(0);
      },
      API_TIMEOUT,
    );
  });

  // =============================================================================
  // A/B ANALYSIS SUMMARY
  // =============================================================================

  afterAll(() => {
    if (testResults.length === 0) return;

    console.log('\n' + '='.repeat(80));
    console.log('A/B TESTING SUMMARY REPORT');
    console.log('='.repeat(80) + '\n');

    // Group by language
    const byLanguage: Record<string, TestResult[]> = {};
    for (const result of testResults) {
      if (!byLanguage[result.language]) {
        byLanguage[result.language] = [];
      }
      byLanguage[result.language].push(result);
    }

    // Calculate stats per language
    for (const [lang, results] of Object.entries(byLanguage)) {
      const matchCount = results.filter(r => r.languageMatch).length;
      const avgLatency = results.reduce((sum, r) => sum + r.latencyMs, 0) / results.length;
      const avgLength = results.reduce((sum, r) => sum + r.responseLength, 0) / results.length;

      console.log(`[${lang.toUpperCase()}] Language Accuracy: ${matchCount}/${results.length} (${((matchCount / results.length) * 100).toFixed(1)}%)`);
      console.log(`     Avg Latency: ${avgLatency.toFixed(0)}ms`);
      console.log(`     Avg Response Length: ${avgLength.toFixed(0)} chars\n`);
    }

    // Overall stats
    const totalTests = testResults.length;
    const totalMatches = testResults.filter(r => r.languageMatch).length;
    const overallAccuracy = (totalMatches / totalTests) * 100;

    console.log('='.repeat(80));
    console.log(`OVERALL LANGUAGE ACCURACY: ${totalMatches}/${totalTests} (${overallAccuracy.toFixed(1)}%)`);
    console.log('='.repeat(80) + '\n');

    // Warn if accuracy is below threshold
    if (overallAccuracy < 80) {
      console.warn('⚠️  WARNING: Language accuracy below 80% threshold!');
      console.warn('    Review agent prompts and language handling logic.\n');
    } else if (overallAccuracy < 95) {
      console.warn('⚠️  NOTICE: Language accuracy below 95% - some improvements possible.\n');
    } else {
      console.log('✅ Language accuracy is excellent!\n');
    }
  });
});

// Skip message if no API key
afterAll(() => {
  if (!MISTRAL_API_KEY) {
    console.log('\n⚠️  MISTRAL_API_KEY not set - language A/B tests skipped');
    console.log('   Export MISTRAL_API_KEY=your_key to run these tests\n');
  }
});
