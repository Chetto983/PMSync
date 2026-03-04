/**
 * AiRunLedgerService - Fire-and-forget telemetry for all AI calls.
 *
 * Phase 35 Plan 01: Records cost, latency, and token data for every LLM
 * invocation into the AiRunLedger table. Cost is estimated from a static
 * price map keyed by model name.
 *
 * Usage: inject into any AI service, call recordRun() without awaiting
 * in the hot path (fire-and-forget with .catch for safety).
 */
import { Injectable, Logger } from '@nestjs/common';
import { AiRunStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CorrelationContext } from '../../../common/services/correlation-context.service';

/**
 * Per-million-token pricing for Mistral models (USD).
 * Source: https://mistral.ai/technology/#pricing (as of 2025)
 */
export const COST_MAP: Record<string, { input: number; output: number }> = {
  'mistral-small-latest': { input: 0.06, output: 0.18 },
  'ministral-3b-latest': { input: 0.10, output: 0.10 },
  'mistral-large-latest': { input: 2.00, output: 6.00 },
  'mistral-embed': { input: 0.01, output: 0.01 },
};

const DEFAULT_COST = COST_MAP['mistral-small-latest'];

export interface RecordRunParams {
  tenantId: string;
  userId: string;
  runType: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  toolCallCount?: number;
  hitlRequired?: boolean;
  requestId?: string;
  status?: AiRunStatus;
  errorCode?: string;
  errorMessage?: string;
  promptVersion?: string;
}

@Injectable()
export class AiRunLedgerService {
  private readonly logger = new Logger(AiRunLedgerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record an AI run to the ledger. Fire-and-forget -- callers should
   * `.catch()` so failures never affect user responses.
   */
  async recordRun(params: RecordRunParams): Promise<void> {
    const promptTokens = this.safeInt(params.promptTokens);
    const completionTokens = this.safeInt(params.completionTokens);
    const totalTokens = this.safeInt(params.totalTokens);

    const cost = COST_MAP[params.model] ?? DEFAULT_COST;
    const estimatedCostUsd =
      (promptTokens * cost.input + completionTokens * cost.output) / 1_000_000;

    const requestId =
      params.requestId ??
      CorrelationContext.getContext()?.correlationId ??
      undefined;

    await this.prisma.aiRunLedger.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId,
        runType: params.runType,
        model: params.model,
        promptTokens,
        completionTokens,
        totalTokens,
        estimatedCostUsd,
        latencyMs: this.safeInt(params.latencyMs),
        toolCallCount: this.safeInt(params.toolCallCount ?? 0),
        hitlRequired: params.hitlRequired ?? false,
        requestId,
        status: params.status ?? AiRunStatus.SUCCESS,
        errorCode: params.errorCode,
        errorMessage: params.errorMessage,
        promptVersion: params.promptVersion,
      },
    });
  }

  /** Coerce non-finite values to 0. */
  private safeInt(value: number): number {
    return Number.isFinite(value) ? Math.round(value) : 0;
  }
}
