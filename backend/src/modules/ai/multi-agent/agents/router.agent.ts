import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatMistralAI } from '@langchain/mistralai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import {
  AgentContext,
  AgentIntent,
} from '../interfaces/agent-context.interface';

/**
 * Result of intent classification by the RouterAgent.
 */
export interface IntentClassificationResult {
  intent: AgentIntent;
  confidence: number;
  reasoning: string;
  suggestedAgents: string[];
}

/**
 * RouterAgent is the orchestrator for the PMS (PMSync) multi-agent system.
 * Responsible for classifying user intent and routing requests to the
 * appropriate specialized agent (Email, Calendar, Contacts, Knowledge, General).
 *
 * Uses Mistral AI for natural language understanding.
 * Supports multi-language intents (en, it, es, fr, de).
 */
@Injectable()
export class RouterAgent {
  private readonly logger = new Logger(RouterAgent.name);
  private model: ChatMistralAI | null = null;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Initialize the Mistral model lazily.
   */
  private getModel(): ChatMistralAI {
    if (!this.model) {
      const apiKey = this.configService.get<string>('MISTRAL_API_KEY');
      if (!apiKey) {
        throw new Error('MISTRAL_API_KEY is not configured');
      }

      this.model = new ChatMistralAI({
        apiKey,
        model: 'mistral-small-latest', // Fast model for classification
        temperature: 0.1, // Low temperature for consistent classification
      });
    }
    return this.model;
  }

  /**
   * Classify the user's intent from their message.
   * Returns the most likely intent with confidence score.
   */
  async classifyIntent(context: AgentContext): Promise<IntentClassificationResult> {
    const startTime = Date.now();
    this.logger.debug(
      `Classifying intent for tenant ${context.tenantId}, user ${context.userId}`,
    );

    try {
      const model = this.getModel();

      // Build context for classification
      const historyContext = this.formatHistory(context.history);
      const availableProviders = this.formatProviders(context.providers);

      const prompt = PromptTemplate.fromTemplate(`
You are the PMS (PMSync) intent classifier - an orchestrator for a multi-agent email/calendar/contacts assistant.
Analyze the user's message and determine their primary intent to route to the correct specialized agent.

Note: The user may write in any language (English, Italian, Spanish, French, German). Understand the intent regardless of language.

Available intents:
- EMAIL: Email-related tasks (send, read, search, reply, forward, delete, organize emails)
- CALENDAR: Calendar/scheduling tasks (create events, check availability, schedule meetings, view calendar)
- CONTACTS: Contact management (add, search, update, merge contacts)
- KNOWLEDGE: Knowledge base queries (search internal documents, company information)
- GENERAL: General questions, greetings, help requests, capabilities questions
- MULTI: Multiple intents detected (needs orchestration across multiple agents)
- UNKNOWN: Cannot determine intent

User's connected capabilities:
{availableProviders}

Conversation history (last few messages):
{historyContext}

Current user message:
{userMessage}

Analyze the message and respond with ONLY a JSON object (no markdown, no explanation):
{{
  "intent": "EMAIL|CALENDAR|CONTACTS|KNOWLEDGE|GENERAL|MULTI|UNKNOWN",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation",
  "suggestedAgents": ["agent names that could handle this"]
}}
`);

      const chain = prompt.pipe(model).pipe(new StringOutputParser());

      const result = await chain.invoke({
        userMessage: context.userMessage,
        historyContext: historyContext || 'No previous context',
        availableProviders: availableProviders || 'Email, Calendar, Contacts',
      });

      // Parse the JSON response
      const parsed = this.parseClassificationResult(result);

      this.logger.log(
        `Intent classified: ${parsed.intent} (confidence: ${parsed.confidence}) in ${Date.now() - startTime}ms`,
      );

      return parsed;
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Intent classification failed: ${err.message}`,
        err.stack,
      );

      // Return fallback classification
      return {
        intent: AgentIntent.UNKNOWN,
        confidence: 0.0,
        reasoning: `Classification failed: ${err.message}`,
        suggestedAgents: [],
      };
    }
  }

  /**
   * Parse and validate the classification result from LLM.
   */
  private parseClassificationResult(result: string): IntentClassificationResult {
    try {
      // Clean up the response (remove markdown if present)
      let cleaned = result.trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.slice(7);
      }
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.slice(3);
      }
      if (cleaned.endsWith('```')) {
        cleaned = cleaned.slice(0, -3);
      }
      cleaned = cleaned.trim();

      const parsed = JSON.parse(cleaned);

      // Validate and normalize the intent
      const intent = this.normalizeIntent(parsed.intent);
      const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5));

      return {
        intent,
        confidence,
        reasoning: parsed.reasoning || '',
        suggestedAgents: Array.isArray(parsed.suggestedAgents)
          ? parsed.suggestedAgents
          : [],
      };
    } catch {
      this.logger.warn(`Failed to parse classification result: ${result}`);
      return {
        intent: AgentIntent.UNKNOWN,
        confidence: 0.3,
        reasoning: 'Failed to parse LLM response',
        suggestedAgents: [],
      };
    }
  }

  /**
   * Normalize intent string to AgentIntent enum.
   */
  private normalizeIntent(intent: string): AgentIntent {
    const normalized = String(intent).toUpperCase().trim();
    if (Object.values(AgentIntent).includes(normalized as AgentIntent)) {
      return normalized as AgentIntent;
    }

    // Fuzzy matching for common variations
    if (normalized.includes('EMAIL') || normalized.includes('MAIL')) {
      return AgentIntent.EMAIL;
    }
    if (normalized.includes('CALENDAR') || normalized.includes('SCHEDULE') || normalized.includes('MEETING')) {
      return AgentIntent.CALENDAR;
    }
    if (normalized.includes('CONTACT')) {
      return AgentIntent.CONTACTS;
    }
    if (normalized.includes('KNOWLEDGE') || normalized.includes('DOCUMENT')) {
      return AgentIntent.KNOWLEDGE;
    }
    if (normalized.includes('GENERAL') || normalized.includes('CHAT') || normalized.includes('HELP')) {
      return AgentIntent.GENERAL;
    }
    if (normalized.includes('MULTI')) {
      return AgentIntent.MULTI;
    }

    return AgentIntent.UNKNOWN;
  }

  /**
   * Format conversation history for prompt context.
   */
  private formatHistory(
    history?: AgentContext['history'],
    maxMessages = 5,
  ): string {
    if (!history || history.length === 0) {
      return '';
    }

    return history
      .slice(-maxMessages)
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join('\n');
  }

  /**
   * Format available providers for context.
   */
  private formatProviders(providers?: AgentContext['providers']): string {
    if (!providers || providers.length === 0) {
      return 'No providers connected';
    }

    const capabilities: string[] = [];
    providers.forEach((p) => {
      if (p.supportsEmail) capabilities.push(`Email (${p.type})`);
      if (p.supportsCalendar) capabilities.push(`Calendar (${p.type})`);
      if (p.supportsContacts) capabilities.push(`Contacts (${p.type})`);
    });

    return [...new Set(capabilities)].join(', ');
  }

  /**
   * Quick check if a message is likely a simple greeting/general chat.
   * Used for fast-path routing without LLM call.
   */
  isSimpleGreeting(message: string): boolean {
    const greetingPatterns = [
      /^(hi|hello|hey|ciao|buongiorno|salve)[\s!.,]*$/i,
      /^(good\s+(morning|afternoon|evening))[\s!.,]*$/i,
      /^(how are you|come stai|how's it going)[\s?]*$/i,
      /^(thanks|thank you|grazie)[\s!.,]*$/i,
    ];

    return greetingPatterns.some((pattern) => pattern.test(message.trim()));
  }

  /**
   * Quick check if message contains explicit intent keywords.
   * Used for fast-path routing without LLM call.
   */
  detectExplicitIntent(message: string): AgentIntent | null {
    const lowerMessage = message.toLowerCase();

    // Email keywords
    if (
      /\b(send|compose|write|reply|forward|email|mail|inbox|unread)\b/.test(lowerMessage)
    ) {
      return AgentIntent.EMAIL;
    }

    // Calendar keywords
    if (
      /\b(schedule|meeting|appointment|calendar|event|book|availability|free time)\b/.test(
        lowerMessage,
      )
    ) {
      return AgentIntent.CALENDAR;
    }

    // Contact keywords
    if (
      /\b(contact|phone|number|address|person|people|colleague)\b/.test(lowerMessage) &&
      /\b(find|search|add|update|get|show)\b/.test(lowerMessage)
    ) {
      return AgentIntent.CONTACTS;
    }

    return null;
  }
}
