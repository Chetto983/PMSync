import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatMistralAI } from '@langchain/mistralai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { BaseAgent } from './base.agent';
import { AgentContext, AgentIntent } from '../interfaces/agent-context.interface';
import { AgentResult } from '../interfaces/agent-result.interface';


/**
 * GeneralAgent handles general chat, greetings, and help requests.
 * It provides a friendly conversational interface without proposing actions.
 * Bot name: PMS (PMSync)
 */
@Injectable()
export class GeneralAgent extends BaseAgent {
  readonly name = 'GeneralAgent';
  readonly description = 'Handles general chat, greetings, and help requests';
  readonly supportedIntents = [AgentIntent.GENERAL, AgentIntent.UNKNOWN];

  private model: ChatMistralAI | null = null;

  constructor(private readonly configService: ConfigService) {
    super();
  }

  private getModel(): ChatMistralAI {
    if (!this.model) {
      const apiKey = this.configService.get<string>('MISTRAL_API_KEY');
      if (!apiKey) {
        throw new Error('MISTRAL_API_KEY is not configured');
      }

      this.model = new ChatMistralAI({
        apiKey,
        model: 'mistral-small-latest',
        temperature: 0.7, // More creative for general chat
      });
    }
    return this.model;
  }

  async process(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now();
    this.logger.debug(`GeneralAgent processing message for tenant ${context.tenantId}`);

    try {
      const model = this.getModel();
      const { language } = this.getPreferences(context);
      const languageName = this.getLanguageName(language);

      const prompt = PromptTemplate.fromTemplate(`
You are PMS, the intelligent AI assistant for PMSync - a unified workspace for email, calendar, and contacts.

CRITICAL: You MUST respond ONLY in {languageName}. Never respond in a different language.

Conversation history:
{history}

Current user message:
{userMessage}

Your capabilities:
- Send, read, search, and organize emails across multiple providers (Gmail, Outlook, IMAP)
- Schedule meetings and manage calendar events
- Find and manage contacts
- Answer questions about emails, schedules, and contacts
- Help with email drafting and smart replies

Respond in a friendly, professional manner. Keep responses concise but helpful.
If the user is greeting you, respond warmly and briefly mention what you can help with.
If they ask what you can do, explain your capabilities clearly.
If they need help with a specific task, guide them appropriately.

IMPORTANT: Your entire response MUST be in {languageName}.

Response:
`);

      const chain = prompt.pipe(model).pipe(new StringOutputParser());

      const response = await chain.invoke({
        userMessage: context.userMessage,
        history: this.formatHistory(context.history) || 'No previous messages',
        languageName,
      });

      this.logger.log(`GeneralAgent responded in ${Date.now() - startTime}ms`);

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
