import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Mistral } from '@mistralai/mistralai';
import { BaseAgent } from './base.agent';
import { AgentContext, AgentIntent } from '../interfaces/agent-context.interface';
import { AgentResult } from '../interfaces/agent-result.interface';

// Keywords that suggest the user wants real-time/current information
const WEB_SEARCH_TRIGGERS = [
  'today', 'current', 'latest', 'recent', 'now', 'live', 'breaking',
  'news', 'weather', 'stock', 'price', 'rate', 'exchange',
  'oggi', 'attuale', 'ultimo', 'recente', 'ora', 'notizie', 'tempo', 'meteo',
  'hoy', 'actual', 'último', 'reciente', 'ahora', 'noticias',
  'what is', 'who is', "what's happening", 'tell me about',
  'cos\'è', 'chi è', 'cosa succede', 'dimmi',
];

/**
 * GeneralAgent handles general chat, greetings, and help requests.
 * It provides a friendly conversational interface without proposing actions.
 * Features web_search capability for real-time information queries.
 * Bot name: PMS (PMSync)
 */
@Injectable()
export class GeneralAgent extends BaseAgent {
  readonly name = 'GeneralAgent';
  readonly description = 'Handles general chat, greetings, help requests, and web searches';
  readonly supportedIntents = [AgentIntent.GENERAL, AgentIntent.UNKNOWN];

  private client: Mistral | null = null;

  constructor(private readonly configService: ConfigService) {
    super();
  }

  private getClient(): Mistral {
    if (!this.client) {
      const apiKey = this.configService.get<string>('MISTRAL_API_KEY');
      if (!apiKey) {
        throw new Error('MISTRAL_API_KEY is not configured');
      }
      this.client = new Mistral({ apiKey });
    }
    return this.client;
  }

  /**
   * Check if the query might benefit from web search
   */
  private shouldUseWebSearch(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    return WEB_SEARCH_TRIGGERS.some(trigger => lowerMessage.includes(trigger));
  }

  async process(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now();
    this.logger.debug(`GeneralAgent processing message for tenant ${context.tenantId}`);

    try {
      const client = this.getClient();
      const { language } = this.getPreferences(context);
      const languageName = this.getLanguageName(language);
      const useWebSearch = this.shouldUseWebSearch(context.userMessage);

      if (useWebSearch) {
        this.logger.debug('GeneralAgent: Using web_search tool for real-time info');
      }

      const systemPrompt = `You are PMS, the intelligent AI assistant for PMSync - a unified workspace for email, calendar, and contacts.

CRITICAL: You MUST respond ONLY in ${languageName}. Never respond in a different language.

Your capabilities:
- Send, read, search, and organize emails across multiple providers (Gmail, Outlook, IMAP)
- Schedule meetings and manage calendar events
- Find and manage contacts
- Answer questions about emails, schedules, and contacts
- Help with email drafting and smart replies
${useWebSearch ? '- Search the web for current information when needed' : ''}

Respond in a friendly, professional manner. Keep responses concise but helpful.
If the user is greeting you, respond warmly and briefly mention what you can help with.
If they ask what you can do, explain your capabilities clearly.
If they need help with a specific task, guide them appropriately.

IMPORTANT: Your entire response MUST be in ${languageName}.`;

      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: systemPrompt },
      ];

      // Add conversation history
      if (context.history && context.history.length > 0) {
        for (const msg of context.history.slice(-10)) {
          if (msg.role === 'user' || msg.role === 'assistant') {
            messages.push({ role: msg.role, content: msg.content });
          }
        }
      }

      messages.push({ role: 'user', content: context.userMessage });

      // Call Mistral with optional web_search tool
      // Note: web_search is a built-in Mistral tool, SDK types are incomplete
      const chatOptions: Parameters<typeof client.chat.complete>[0] = {
        model: this.configService.get<string>('AI_DEFAULT_MODEL') || 'mistral-small-latest',
        messages,
        temperature: 0.7,
        maxTokens: 1024,
      };

      // Add web_search tool if needed (type assertion needed as SDK types don't include web_search)
      if (useWebSearch) {
        (chatOptions as any).tools = [{ type: 'web_search' }];
      }

      const completion = await client.chat.complete(chatOptions);

      const assistantMessage = completion.choices?.[0]?.message;
      let response = '';

      if (assistantMessage?.content) {
        if (typeof assistantMessage.content === 'string') {
          response = assistantMessage.content;
        } else if (Array.isArray(assistantMessage.content)) {
          response = assistantMessage.content
            .map((chunk) => {
              if (chunk && typeof chunk === 'object' && 'text' in chunk) {
                return (chunk as { text: string }).text;
              }
              return '';
            })
            .join('')
            .trim();
        }
      }

      if (!response) {
        response = this.getLocalizedErrorMessage('general', language);
      }

      this.logger.log(`GeneralAgent responded in ${Date.now() - startTime}ms${useWebSearch ? ' (with web search)' : ''}`);

      return this.createTextResponse(response.trim());
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`GeneralAgent error: ${err.message}`, err.stack);

      // Use base class localized error message
      const { language } = this.getPreferences(context);
      return this.createTextResponse(this.getLocalizedErrorMessage('general', language));
    }
  }
}
