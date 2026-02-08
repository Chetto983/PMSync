/** MistralRagService - RAG completion with context retrieval (Phase 11-02). */
import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { Mistral } from '@mistralai/mistralai';
import type { Messages as MistralChatMessage } from '@mistralai/mistralai/models/components/chatcompletionrequest.js';
import type { AssistantMessage } from '@mistralai/mistralai/models/components/assistantmessage.js';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmbeddingsService } from './embeddings.service';
import { CorrelationContext } from '../../../common/services/correlation-context.service';
import { getLocale, getTranslations, type SupportedLocale } from '../voltagent/locales';
import { getAiCircuitBreaker, withRetry } from '../utils';
import { AiError, AiErrorCode } from '../errors';
import { UsageTrackingService } from '../../subscription/services/usage-tracking.service';
import { CostProtectionService } from '../../subscription/services/cost-protection.service';

type ConversationMessage = { role: 'assistant' | 'user'; content: string };

@Injectable()
export class MistralRagService {
  private readonly logger = new Logger(MistralRagService.name);
  private createClientFn!: () => Mistral;
  private generateEmbeddingFn!: (text: string, client: Mistral | undefined, ctx: { tenantId: string; userId?: string }) => Promise<number[]>;
  private getModelFn!: (tier: 'fast' | 'creative' | 'router' | 'default') => string;
  private getEmbeddingModelFn!: () => string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingsService: EmbeddingsService,
    @Optional() @Inject(UsageTrackingService) private usageTrackingService?: UsageTrackingService,
    @Optional() @Inject(CostProtectionService) private costProtectionService?: CostProtectionService,
  ) {}

  /** Set dependencies (injected by MistralService to avoid circular dependency). */
  setDependencies(deps: {
    createClient: () => Mistral;
    generateEmbedding: (text: string, client: Mistral | undefined, ctx: { tenantId: string; userId?: string }) => Promise<number[]>;
    getModel: (tier: 'fast' | 'creative' | 'router' | 'default') => string;
    getEmbeddingModel: () => string;
  }): void {
    this.createClientFn = deps.createClient;
    this.generateEmbeddingFn = deps.generateEmbedding;
    this.getModelFn = deps.getModel;
    this.getEmbeddingModelFn = deps.getEmbeddingModel;
  }

  private normaliseConversation(history: Array<{ role?: string; content?: unknown }>): MistralChatMessage[] {
    const result = history
      .filter((item): item is ConversationMessage =>
        item && typeof item.content === 'string' && (item.role === 'assistant' || item.role === 'user'))
      .map((item) => item.role === 'assistant'
        ? { role: 'assistant' as const, content: item.content }
        : { role: 'user' as const, content: item.content });
    return result as MistralChatMessage[];
  }

  private extractAssistantContent(message: AssistantMessage | undefined): string {
    if (!message || message.content == null) return '';
    if (typeof message.content === 'string') return message.content;
    if (Array.isArray(message.content)) {
      return message.content
        .map((chunk) => chunk && typeof chunk === 'object' && 'text' in chunk && typeof chunk.text === 'string' ? chunk.text : '')
        .join('').trim();
    }
    return '';
  }

  /** GDPR-compliant: Get similar embeddings and hydrate with content from source tables. */
  async searchSimilarContent(
    tenantId: string,
    embedding: number[],
    limit: number = 5,
  ): Promise<Array<{ documentName: string | null; content: string; distance?: number }>> {
    try {
      const matches = await this.embeddingsService.findSimilarContent<{
        id: string; documentName: string | null; metadata: unknown; distance?: number;
        emailId?: string | null; contactId?: string | null;
      }>(tenantId, embedding, limit);

      if (!matches.length) return [];

      const emailIds = matches.filter((m) => m.emailId).map((m) => m.emailId as string);
      const contactIds = matches.filter((m) => m.contactId).map((m) => m.contactId as string);

      // Batch fetch email content
      const emailMap = new Map<string, string>();
      if (emailIds.length > 0) {
        const emails = await this.prisma.email.findMany({
          where: { id: { in: emailIds }, tenantId },
          select: { id: true, subject: true, snippet: true, from: true },
        });
        emails.forEach((e) => emailMap.set(e.id, `${e.subject || 'No subject'}\nFrom: ${e.from || 'Unknown'}\n${e.snippet || ''}`));
      }

      // Batch fetch contact content
      const contactMap = new Map<string, string>();
      if (contactIds.length > 0) {
        const contacts = await this.prisma.contact.findMany({
          where: { id: { in: contactIds }, tenantId },
          select: { id: true, displayName: true, company: true, notes: true },
        });
        contacts.forEach((c) => contactMap.set(c.id, `Contact: ${c.displayName || 'Unknown'}\nCompany: ${c.company || ''}\n${c.notes || ''}`));
      }

      return matches
        .map((match) => {
          let content: string | null = null;
          if (match.emailId) content = emailMap.get(match.emailId) || null;
          else if (match.contactId) content = contactMap.get(match.contactId) || null;
          if (!content) return null;
          return { documentName: match.documentName, content, distance: match.distance };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const corrId = CorrelationContext.getCorrelationId();
      this.logger.error(`[${corrId}] [tenant:${tenantId}] Similarity search failed: ${errorMessage}`);
      return [];
    }
  }

  /** Call Mistral API with RAG context and timeout protection. */
  async generateResponse(
    tenantId: string,
    userId: string,
    userPrompt: string,
    conversationHistory: Array<{ role?: string; content?: unknown }> = [],
    options?: { conversationId?: string; locale?: string; timeoutMs?: number },
    apiKey?: string,
  ): Promise<string> {
    const model = this.getModelFn('fast');
    const supportedLocale = getLocale(options?.locale);
    const t = getTranslations(supportedLocale);
    const timeoutMs = options?.timeoutMs ?? 60000;

    if (!apiKey) {
      const fallbackResponse = t.mistral.errors.notConfigured;
      this.logger.warn('Mistral API key missing. Responded with fallback message.');
      return fallbackResponse;
    }

    // P10: Check cost cap BEFORE making RAG + LLM call
    if (tenantId && this.costProtectionService) {
      const costCheck = await this.costProtectionService.canProceed(tenantId, 'smartReply');
      if (!costCheck.allowed) {
        this.logger.warn(`[tenant:${tenantId}] Cost cap reached: ${costCheck.reason}`);
        return costCheck.reason || 'Daily cost limit reached. Please upgrade your plan.';
      }
    }

    const cb = getAiCircuitBreaker('mistral', 'rag_completion');

    try {
      return await cb.execute(async () => {
        const executeCall = async () => {
          const mistralClient = this.createClientFn();
          let ragContext = '';

          try {
            // Generate embedding for user prompt
            const userEmbedding = await this.generateEmbeddingFn(userPrompt, mistralClient, { tenantId, userId });

            // GDPR-compliant: No content stored for user prompts (ephemeral)
            await this.embeddingsService.saveEmbedding({
              tenantId, embedding: userEmbedding, model: this.getEmbeddingModelFn(),
              documentName: 'user_prompt', metadata: { source: 'user_prompt', createdBy: userId },
            });

            // Search for similar content in knowledge base
            const similarContent = await this.searchSimilarContent(tenantId, userEmbedding);

            if (similarContent.length > 0) {
              const contextBlocks = similarContent
                .map((contentItem, index) => {
                  const title = contentItem.documentName || t.mistral.rag.sourceLabel(index + 1);
                  return `### ${title}\n${contentItem.content}`;
                }).join('\n\n');
              ragContext = `\n\n---\n${t.mistral.rag.contextIntro}\n\n${contextBlocks}\n\n---\n`;
            }
          } catch (ragError) {
            const ragMessage = ragError instanceof Error ? ragError.message : String(ragError);
            this.logger.warn(`Unable to build RAG context: ${ragMessage}`);
          }

          const historyMessages = this.normaliseConversation(conversationHistory);
          const messages: MistralChatMessage[] = [
            ...historyMessages,
            { role: 'user', content: userPrompt + ragContext } as MistralChatMessage,
          ];

          const completionPromise = mistralClient.chat.complete({
            model, messages, temperature: 0.7, maxTokens: 1024, safePrompt: true,
          });

          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new AiError(`LLM request timed out after ${timeoutMs}ms`, AiErrorCode.PROVIDER_TIMEOUT)), timeoutMs);
          });

          const completion = await Promise.race([completionPromise, timeoutPromise]);
          const assistantMessage = completion.choices?.[0]?.message;
          const assistantResponse = this.extractAssistantContent(assistantMessage) || t.mistral.errors.tryAgain;
          return { response: assistantResponse, usage: completion.usage };
        };

        const result = await withRetry(async () => await executeCall(), {
          maxRetries: 3, isRetryable: (err: unknown) => AiError.fromError(err).retryable, initialDelayMs: 500,
        });

        const corrId = CorrelationContext.getCorrelationId();
        this.logger.log(`[${corrId}] [tenant:${tenantId}] Generated response for user: ${userId}`);

        // P10: Track successful AI usage
        if (tenantId && this.usageTrackingService) {
          await this.usageTrackingService.trackUsage(tenantId, 'ai-calls', 1).catch((err: Error) => {
            this.logger.warn(`[tenant:${tenantId}] Failed to track RAG response usage: ${err.message}`);
          });
        }

        return result.response;
      });
    } catch (error) {
      const aiError = AiError.fromError(error);
      const corrId = CorrelationContext.getCorrelationId();
      this.logger.error(`[${corrId}] [tenant:${tenantId}] Failed to generate response: ${aiError.message}`);

      if (aiError.code === AiErrorCode.PROVIDER_UNAVAILABLE || aiError.code === AiErrorCode.CIRCUIT_BREAKER_OPEN) {
        return t.mistral.errors.unavailable;
      }
      if (aiError.code === AiErrorCode.PROVIDER_TIMEOUT) return t.mistral.errors.serverError;
      if (aiError.code === AiErrorCode.AUTH_FAILED) return t.mistral.errors.unauthorized;
      return t.mistral.errors.serverError;
    }
  }

  /** Generate graceful fallback response when LLM times out (RACE-04). */
  getGracefulTimeoutResponse(message: string, locale: string = 'en'): string {
    const lowerMessage = message.toLowerCase();
    const responses: Record<string, Record<string, string>> = {
      en: {
        email: "I'm processing your email request, but it's taking longer than expected. Please try again in a moment, or try a simpler question.",
        calendar: "I'm working on your calendar request. This is taking a bit longer than usual. Please try again shortly.",
        search: "Your search is taking longer than expected. Please try again with a more specific query.",
        default: "I'm having trouble completing your request right now. Please try again in a moment.",
      },
      it: {
        email: "Sto elaborando la tua richiesta email, ma sta richiedendo piu tempo del previsto. Riprova tra poco, o prova una domanda piu semplice.",
        calendar: "Sto lavorando sulla tua richiesta calendario. Sta richiedendo piu tempo del solito. Riprova tra poco.",
        search: "La tua ricerca sta richiedendo piu tempo del previsto. Riprova con una query piu specifica.",
        default: "Ho difficolta a completare la tua richiesta. Riprova tra poco.",
      },
    };
    const localeResponses = responses[locale] || responses.en;
    if (lowerMessage.includes('email') || lowerMessage.includes('mail')) return localeResponses.email;
    if (lowerMessage.includes('calendar') || lowerMessage.includes('evento') || lowerMessage.includes('event')) return localeResponses.calendar;
    if (lowerMessage.includes('search') || lowerMessage.includes('cerca') || lowerMessage.includes('find')) return localeResponses.search;
    return localeResponses.default;
  }
}
