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
import { Injectable, Logger, Optional } from '@nestjs/common';
import { AiRunStatus } from '@prisma/client';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter } from 'prom-client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CorrelationContext } from '../../../common/services/correlation-context.service';

/**
 * Per-million-token pricing (USD).
 * Chat: Qwen 3.5 via OpenRouter. Embeddings/OCR: Mistral.
 * Source: OpenRouter pricing page, Mistral pricing (2026-03)
 */
export const COST_MAP: Record<string, { input: number; output: number }> = {
  // Qwen 3.5 (OpenRouter)
  'qwen/qwen3.5-flash-02-23': { input: 0.20, output: 0.20 },
  'qwen/qwen3.5-plus-02-15': { input: 0.30, output: 0.30 },
  // Mistral (embeddings + OCR only)
  'mistral-embed': { input: 0.01, output: 0.01 },
  'mistral-ocr-latest': { input: 0.50, output: 0.50 },
  // Legacy (kept for historical ledger lookups)
  'mistral-small-latest': { input: 0.15, output: 0.60 },
  'mistral-medium-latest': { input: 2.75, output: 8.10 },
  'mistral-large-latest': { input: 0.50, output: 1.50 },
  'devstral-small-latest': { input: 0.10, output: 0.30 },
  'labs-mistral-small-creative': { input: 0.10, output: 0.30 },
};

const DEFAULT_COST = COST_MAP['qwen/qwen3.5-flash-02-23'];

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

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @InjectMetric('ai_tokens_total') private readonly tokensCounter?: Counter,
    @Optional() @InjectMetric('ai_cost_usd_total') private readonly costCounter?: Counter,
    @Optional() @InjectMetric('ai_requests_total') private readonly requestsCounter?: Counter,
  ) {}

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

    // Phase 46-02: Prometheus counters (fire-and-forget alongside DB write)
    this.tokensCounter?.inc({ model: params.model, type: 'prompt' }, promptTokens);
    this.tokensCounter?.inc({ model: params.model, type: 'completion' }, completionTokens);
    this.costCounter?.inc({ model: params.model }, estimatedCostUsd);
    this.requestsCounter?.inc({
      model: params.model,
      run_type: params.runType,
      status: (params.status ?? 'SUCCESS').toLowerCase(),
    });

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
