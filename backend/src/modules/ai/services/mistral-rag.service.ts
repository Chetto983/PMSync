/**
 * MistralRagService - RAG completion with context retrieval (Phase 23 rewire).
 *
 * Uses AI SDK generateText() via MistralProviderService. No direct
 * @mistralai/mistralai imports.
 */
import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { generateText } from 'ai';
import { MistralProviderService } from '../../mistral/mistral-provider.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmbeddingsService } from './embeddings.service';
import { CorrelationContext } from '../../../common/services/correlation-context.service';
import { getLocale, getTranslations } from '../voltagent/locales';
import { getAiCircuitBreaker, withRetry } from '../utils';
import { AiError, AiErrorCode } from '../errors';
import { UsageTrackingService } from '../../subscription/services/usage-tracking.service';
import { CostProtectionService } from '../../subscription/services/cost-protection.service';

@Injectable()
export class MistralRagService {
  private readonly logger = new Logger(MistralRagService.name);

  // Injected lazily by MistralService.onModuleInit to avoid circular deps
  private generateEmbeddingFn!: (text: string, ctx: { tenantId: string; userId?: string }) => Promise<number[]>;
  private getModelFn!: (tier: 'fast' | 'creative' | 'router' | 'default') => string;
  private getEmbeddingModelFn!: () => string;

  constructor(
    private readonly mistralProvider: MistralProviderService,
    private readonly prisma: PrismaService,
    private readonly embeddingsService: EmbeddingsService,
    @Optional() @Inject(UsageTrackingService) private usageTrackingService?: UsageTrackingService,
    @Optional() @Inject(CostProtectionService) private costProtectionService?: CostProtectionService,
  ) {}

  /** Set dependencies (injected by MistralService to avoid circular dependency). */
  setDependencies(deps: {
    generateEmbedding: (text: string, ctx: { tenantId: string; userId?: string }) => Promise<number[]>;
    getModel: (tier: 'fast' | 'creative' | 'router' | 'default') => string;
    getEmbeddingModel: () => string;
  }): void {
    this.generateEmbeddingFn = deps.generateEmbedding;
    this.getModelFn = deps.getModel;
    this.getEmbeddingModelFn = deps.getEmbeddingModel;
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

  /** Call Mistral via AI SDK generateText() with RAG context. */
  async generateResponse(
    tenantId: string,
    userId: string,
    userPrompt: string,
    conversationHistory: Array<{ role?: string; content?: unknown }> = [],
    options?: { conversationId?: string; locale?: string; timeoutMs?: number },
  ): Promise<string> {
    const modelId = this.getModelFn('fast');
    const supportedLocale = getLocale(options?.locale);
    const t = getTranslations(supportedLocale);
    const timeoutMs = options?.timeoutMs ?? 60000;

    // Cost cap check
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
          let ragContext = '';

          try {
            // Generate embedding for user prompt
            const userEmbedding = await this.generateEmbeddingFn(userPrompt, { tenantId, userId });

            // GDPR-compliant: ephemeral embedding for RAG retrieval
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

          // Build messages for AI SDK
          const historyMessages = conversationHistory
            .filter((item): item is { role: 'assistant' | 'user'; content: string } =>
              !!item && typeof item.content === 'string' && (item.role === 'assistant' || item.role === 'user'))
            .map((item) => ({
              role: item.role as 'assistant' | 'user',
              content: item.content,
            }));

          const messages = [
            ...historyMessages,
            { role: 'user' as const, content: userPrompt + ragContext },
          ];

          const { text } = await generateText({
            model: this.mistralProvider.getChatModel(modelId),
            messages,
            temperature: 0.7,
            maxOutputTokens: 1024,
            abortSignal: AbortSignal.timeout(timeoutMs),
            providerOptions: { mistral: { safePrompt: true } },
          });

          return text || t.mistral.errors.tryAgain;
        };

        const response = await withRetry(async () => await executeCall(), {
          maxRetries: 3, isRetryable: (err: unknown) => AiError.fromError(err).retryable, initialDelayMs: 500,
        });

        const corrId = CorrelationContext.getCorrelationId();
        this.logger.log(`[${corrId}] [tenant:${tenantId}] Generated response for user: ${userId}`);

        // Track successful AI usage
        if (tenantId && this.usageTrackingService) {
          await this.usageTrackingService.trackUsage(tenantId, 'ai-calls', 1).catch((err: Error) => {
            this.logger.warn(`[tenant:${tenantId}] Failed to track RAG response usage: ${err.message}`);
          });
        }

        return response;
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
