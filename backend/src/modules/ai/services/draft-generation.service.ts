/**
 * DraftGenerationService - Reply draft generation via generateText + Output.object()
 *
 * Generates a reply draft for a given email, using the original email thread
 * context, user instruction, and optional tone preference. User-triggered
 * (not auto-generated).
 *
 * Single LLM call with pre-fetched email context.
 */
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { generateText } from 'ai';
import { AiRunStatus } from '@prisma/client';
import { z } from 'zod';
import { MistralProviderService } from '../../mistral/mistral-provider.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { UsageTrackingService } from '../../subscription/services/usage-tracking.service';
import { AiRunLedgerService } from './ai-run-ledger.service';
import { parseJsonOutput } from '../utils/parse-json-output';

// ============ Zod Schema (co-located, exported for frontend type derivation) ============

export const draftGenerationSchema = z.object({
  subject: z.string().describe('Reply subject line (typically Re: original subject)'),
  body: z.string().describe('Draft reply body text'),
  suggestedRecipients: z.array(z.object({
    email: z.string().describe('Recipient email address'),
    name: z.string().nullable().describe('Recipient display name'),
  })).describe('Suggested recipients for the reply'),
  confidence: z.number().describe('Confidence score 0-1 for draft quality'),
  tone: z.enum(['formal', 'casual', 'technical', 'friendly']).describe('Detected tone of the draft'),
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

export interface GenerateDraftParams {
  emailId: string;
  instruction: string;
  tone?: string;
}

@Injectable()
export class DraftGenerationService {
  private readonly logger = new Logger(DraftGenerationService.name);

  constructor(
    private readonly mistralProvider: MistralProviderService,
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
  ): Promise<{ data: DraftGenerationOutput; error?: string }> {
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
      return { data: SAFE_FALLBACK, error: 'Email not found' };
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
  ): Promise<{ data: DraftGenerationOutput; error?: string }> {
    const startTime = Date.now();
    try {
      const result = await generateText({
        model: this.mistralProvider.getChatModel(),
        system: SYSTEM_PROMPT,
        prompt: replyContext + '\n\nReturn valid JSON.',
      });

      this.ledgerService?.recordRun({
        tenantId,
        userId: 'system',
        runType: 'draft-generation',
        model: this.mistralProvider.getChatModelName(),
        promptTokens: result.usage?.inputTokens ?? 0,
        completionTokens: result.usage?.outputTokens ?? 0,
        totalTokens: result.usage?.totalTokens ?? 0,
        latencyMs: Date.now() - startTime,
      }).catch(err => this.logger.warn(`Ledger: ${err.message}`));

      const parsed = parseJsonOutput(result.text, draftGenerationSchema);
      await this.trackUsage();
      return { data: parsed };
    } catch (error) {
      this.ledgerService?.recordRun({
        tenantId,
        userId: 'system',
        runType: 'draft-generation',
        model: this.mistralProvider.getChatModelName(),
        promptTokens: 0, completionTokens: 0, totalTokens: 0,
        latencyMs: Date.now() - startTime,
        status: AiRunStatus.FAILED,
        errorMessage: error instanceof Error ? error.message : String(error),
      }).catch(err => this.logger.warn(`Ledger: ${err.message}`));

      this.logger.error(`Draft generation failed: ${error}`);
      return { data: SAFE_FALLBACK, error: 'Draft generation failed' };
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
