/**
 * DraftGenerationService - Reply draft generation via generateText + parseJsonOutput
 *
 * Generates a reply draft for a given email, using the original email thread
 * context, user instruction, and optional tone preference. User-triggered
 * (not auto-generated).
 *
 * Single LLM call with pre-fetched email context.
 * JSON extracted from raw text via parseJsonOutput (Qwen 3.5 via OpenRouter).
 */
import { BadRequestException, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { generateObject, generateText } from 'ai';
import { AiRunStatus } from '@prisma/client';
import { z } from 'zod';
import { OpenRouterProviderService } from '../../openrouter/openrouter-provider.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { UsageTrackingService } from '../../subscription/services/usage-tracking.service';
import { AiRunLedgerService } from './ai-run-ledger.service';
import { parseJsonOutput } from '../utils/parse-json-output';
import { promptHash } from '../utils/prompt-hash';
import { buildAiResponseMeta, type AiServiceResult } from '../utils/ai-response-meta';

// ============ Zod Schema (co-located, exported for frontend type derivation) ============

export const draftGenerationSchema = z.object({
  subject: z.string().describe('Reply subject line (typically Re: original subject)'),
  body: z.string().describe('Draft reply body text'),
  suggestedRecipients: z.array(z.object({
    email: z.string().describe('Recipient email address'),
    name: z.string().nullable().default(null).describe('Recipient display name'),
  })).default([]).describe('Suggested recipients for the reply'),
  confidence: z.number().default(0.5).describe('Confidence score 0-1 for draft quality'),
  tone: z.enum(['formal', 'casual', 'technical', 'friendly']).default('formal').describe('Detected tone of the draft'),
});

export type DraftGenerationOutput = z.infer<typeof draftGenerationSchema>;

// ============ Safe Fallback ============

const SAFE_FALLBACK: DraftGenerationOutput = {
  subject: '',
  body: '',
  suggestedRecipients: [],
  confidence: 0,
  tone: 'formal',
};

const SYSTEM_PROMPT = `You are a professional email assistant. Generate a reply draft based on the original email thread and the user's instruction.

Return a JSON object with EXACTLY these fields:

{
  "subject": string,
  "body": string,
  "suggestedRecipients": [{"email": string, "name": string|null}],
  "confidence": number,
  "tone": "formal"|"casual"|"technical"|"friendly"
}

Rules:
- Match the requested tone (formal, casual, technical, friendly).
- Subject should be "Re: [original subject]" unless the user specifies otherwise.
- Body should be a complete, ready-to-send reply.
- Suggest recipients based on the original email's From/To/CC fields.
- Set confidence based on how well the instruction matches the context:
  - 1.0 = instruction is clear and context is complete (e.g., "reply yes to this meeting invite")
  - 0.7-0.9 = instruction is clear but context has some ambiguity
  - 0.4-0.6 = instruction is vague or context is incomplete (e.g., "reply to this")
  - 0.1-0.3 = instruction contradicts context or is very unclear
- Do NOT include the original email in the reply body (no quoting).
- Keep the reply concise and professional.

Return valid JSON matching the exact schema.`;

// Prompt length limits
const INSTRUCTION_SOFT_LIMIT = 2000;
const INSTRUCTION_HARD_LIMIT = 10000;

export interface GenerateDraftParams {
  emailId: string;
  instruction: string;
  tone?: string;
}

@Injectable()
export class DraftGenerationService {
  private readonly logger = new Logger(DraftGenerationService.name);
  private readonly draftVersion = 'draft-generation-v1';

  constructor(
    private readonly mistralProvider: OpenRouterProviderService,
    private readonly prisma: PrismaService,
    @Optional() @Inject(UsageTrackingService) private readonly usageTrackingService?: UsageTrackingService,
    @Optional() private readonly ledgerService?: AiRunLedgerService,
  ) {}

  /**
   * Generate a reply draft for a specific email.
   * @param tenantId Tenant ID
   * @param params Email ID, user instruction, and optional tone
   */
  async generateDraft(
    tenantId: string,
    params: GenerateDraftParams,
  ): Promise<AiServiceResult<DraftGenerationOutput>> {
    // 0. Enforce instruction length limits
    if (params.instruction && params.instruction.length > INSTRUCTION_HARD_LIMIT) {
      throw new BadRequestException(
        `Instruction exceeds maximum length (${INSTRUCTION_HARD_LIMIT} chars)`,
      );
    }
    if (params.instruction && params.instruction.length > INSTRUCTION_SOFT_LIMIT) {
      this.logger.warn(
        `Draft instruction truncated from ${params.instruction.length} to ${INSTRUCTION_SOFT_LIMIT} chars`,
      );
      params = { ...params, instruction: params.instruction.slice(0, INSTRUCTION_SOFT_LIMIT) };
    }

    // 1. Load the original email
    const email = await this.prisma.email.findFirst({
      where: { id: params.emailId, tenantId },
      select: {
        id: true,
        subject: true,
        from: true,
        to: true,
        cc: true,
        bodyText: true,
        threadId: true,
        receivedAt: true,
      },
    });

    if (!email) {
      this.logger.warn(`Email ${params.emailId} not found for tenant ${tenantId}`);
      return {
        data: SAFE_FALLBACK,
        meta: buildAiResponseMeta({
          operation: 'draft-generation',
          version: this.draftVersion,
          source: 'fallback',
          model: this.mistralProvider.getChatModelName(),
          degraded: true,
          warnings: ['email_not_found'],
        }),
        error: 'Email not found',
      };
    }

    // 2. Load thread context if available (up to 5 most recent messages)
    let threadContext: Array<{ from: string; subject: string; snippet: string; date: string }> = [];
    if (email.threadId) {
      const threadEmails = await this.prisma.email.findMany({
        where: { tenantId, threadId: email.threadId, isDeleted: false },
        orderBy: { receivedAt: 'desc' },
        take: 5,
        select: { from: true, subject: true, bodyText: true, receivedAt: true },
      });
      threadContext = threadEmails.map(e => ({
        from: e.from,
        subject: e.subject,
        snippet: e.bodyText?.slice(0, 300) || '',
        date: e.receivedAt.toISOString(),
      }));
    }

    // 3. Build reply context
    const replyContext = JSON.stringify({
      originalEmail: {
        id: email.id,
        subject: email.subject,
        from: email.from,
        to: email.to,
        cc: email.cc,
        body: email.bodyText?.slice(0, 1000) || '',
        receivedAt: email.receivedAt.toISOString(),
      },
      threadContext,
      userInstruction: params.instruction,
      requestedTone: params.tone || 'formal',
    }, null, 0);

    // 4. Generate with graceful fallback
    return this.generateWithFallback(replyContext, tenantId);
  }

  private async generateWithFallback(
    replyContext: string,
    tenantId = 'system',
  ): Promise<AiServiceResult<DraftGenerationOutput>> {
    const modelName = this.mistralProvider.getChatModelName();

    // Attempt 1: generateObject (structured output)
    const attempt1 = await this.tryGenerateObject(replyContext, modelName, tenantId);
    if (attempt1) {
      await this.trackUsage();
      return {
        data: attempt1,
        meta: buildAiResponseMeta({
          operation: 'draft-generation',
          version: this.draftVersion,
          source: 'live',
          model: modelName,
        }),
      };
    }

    // Attempt 2: generateText + manual JSON extraction (fallback)
    const attempt2 = await this.tryGenerateText(replyContext, modelName, tenantId);
    if (attempt2) {
      await this.trackUsage();
      return {
        data: attempt2,
        meta: buildAiResponseMeta({
          operation: 'draft-generation',
          version: this.draftVersion,
          source: 'live',
          model: modelName,
          warnings: ['structured_output_unavailable'],
        }),
      };
    }

    this.logger.error('Draft generation failed on all attempts');
    return {
      data: SAFE_FALLBACK,
      meta: buildAiResponseMeta({
        operation: 'draft-generation',
        version: this.draftVersion,
        source: 'fallback',
        model: modelName,
        degraded: true,
        warnings: ['draft_generation_failed'],
      }),
      error: 'Draft generation failed',
    };
  }

  private async tryGenerateObject(
    prompt: string, modelName: string, tenantId: string,
  ): Promise<DraftGenerationOutput | null> {
    const startTime = Date.now();
    try {
      const result = await generateObject({
        model: this.mistralProvider.getChatModel(),
        schema: draftGenerationSchema,
        schemaName: 'DraftGeneration',
        system: SYSTEM_PROMPT,
        prompt,
        temperature: 0.3,
        abortSignal: AbortSignal.timeout(45_000),
      });
      this.ledgerService?.recordRun({
        tenantId, userId: 'system', runType: 'draft-generation', model: modelName,
        promptTokens: result.usage?.inputTokens ?? 0, completionTokens: result.usage?.outputTokens ?? 0,
        totalTokens: result.usage?.totalTokens ?? 0, latencyMs: Date.now() - startTime,
        promptVersion: promptHash(SYSTEM_PROMPT),
      }).catch(err => this.logger.warn(`Ledger: ${err.message}`));
      return result.object;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`generateObject failed for draft generation: ${msg}`);
      this.ledgerService?.recordRun({
        tenantId, userId: 'system', runType: 'draft-generation', model: modelName,
        promptTokens: 0, completionTokens: 0, totalTokens: 0, latencyMs: Date.now() - startTime,
        status: AiRunStatus.FAILED, errorMessage: `generateObject: ${msg}`,
        promptVersion: promptHash(SYSTEM_PROMPT),
      }).catch(err => this.logger.warn(`Ledger: ${err.message}`));
      return null;
    }
  }

  private async tryGenerateText(
    prompt: string, modelName: string, tenantId: string,
  ): Promise<DraftGenerationOutput | null> {
    const startTime = Date.now();
    try {
      const result = await generateText({
        model: this.mistralProvider.getChatModel(),
        system: SYSTEM_PROMPT,
        prompt: prompt + '\n\nReturn valid JSON.',
        abortSignal: AbortSignal.timeout(45_000),
      });
      this.ledgerService?.recordRun({
        tenantId, userId: 'system', runType: 'draft-generation', model: modelName,
        promptTokens: result.usage?.inputTokens ?? 0, completionTokens: result.usage?.outputTokens ?? 0,
        totalTokens: result.usage?.totalTokens ?? 0, latencyMs: Date.now() - startTime,
        promptVersion: promptHash(SYSTEM_PROMPT),
      }).catch(err => this.logger.warn(`Ledger: ${err.message}`));
      return parseJsonOutput(result.text, draftGenerationSchema);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`generateText fallback failed for draft generation: ${msg}`);
      this.ledgerService?.recordRun({
        tenantId, userId: 'system', runType: 'draft-generation', model: modelName,
        promptTokens: 0, completionTokens: 0, totalTokens: 0, latencyMs: Date.now() - startTime,
        status: AiRunStatus.FAILED, errorMessage: `generateText: ${msg}`,
        promptVersion: promptHash(SYSTEM_PROMPT),
      }).catch(err => this.logger.warn(`Ledger: ${err.message}`));
      return null;
    }
  }

  private async trackUsage() {
    if (this.usageTrackingService) {
      try {
        await this.usageTrackingService.trackUsage(
          'system',
          'ai-calls',
          1,
        );
      } catch (err) {
        this.logger.warn(`Failed to track draft generation usage: ${err}`);
      }
    }
  }
}
