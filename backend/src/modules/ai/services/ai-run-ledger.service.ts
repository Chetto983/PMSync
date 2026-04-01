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
import { AiRunStatus, PredictionType } from '@prisma/client';
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
  // NVIDIA Nemotron (OpenRouter) — primary simple/fast model
  'nvidia/nemotron-3-nano-30b-a3b': { input: 0.05, output: 0.20 },
  // Google Gemini (OpenRouter)
  'google/gemini-3.1-flash-lite-preview': { input: 0.25, output: 1.50 },
  'google/gemini-2.5-flash-lite': { input: 0.25, output: 1.00 },
  // Mistral Small 3.1 (OpenRouter) — simple/fast model
  'mistralai/mistral-small-3.1-24b-instruct': { input: 0.10, output: 0.30 },
  // MiniMax M2.7 (OpenRouter) — main chat model
  'minimax/minimax-m2.7': { input: 1.00, output: 5.00 },
  // Qwen 3.5 (OpenRouter) — legacy, kept for historical lookups
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

const DEFAULT_COST = COST_MAP['nvidia/nemotron-3-nano-30b-a3b'];

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
  /** Phase 109: Raw context tokens before assembly */
  rawContextTokens?: number;
  /** Phase 109: Assembled context tokens after budget enforcement */
  assembledContextTokens?: number;
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

  /** Max retries for DB writes before giving up. */
  private static readonly MAX_RETRIES = 1;
  /** Delay between retries in ms. */
  private static readonly RETRY_DELAY_MS = 500;

  /**
   * Record an AI run to the ledger. Fire-and-forget -- callers should
   * `.catch()` so failures never affect user responses.
   *
   * Retries once on DB failure with 500ms delay to avoid silent telemetry loss (OBS-H1).
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

    const data = {
      tenantId: params.tenantId,
      userId: params.userId,
      runType: params.runType,
      predictionType: this.resolvePredictionType(params.runType),
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
      rawContextTokens: params.rawContextTokens != null ? this.safeInt(params.rawContextTokens) : null,
      assembledContextTokens: params.assembledContextTokens != null ? this.safeInt(params.assembledContextTokens) : null,
    };

    for (let attempt = 0; attempt <= AiRunLedgerService.MAX_RETRIES; attempt++) {
      try {
        await this.prisma.aiRunLedger.create({ data });
        return;
      } catch (error) {
        if (attempt < AiRunLedgerService.MAX_RETRIES) {
          this.logger.warn(
            `Ledger write failed (attempt ${attempt + 1}), retrying in ${AiRunLedgerService.RETRY_DELAY_MS}ms: ${error instanceof Error ? error.message : error}`,
          );
          await this.delay(AiRunLedgerService.RETRY_DELAY_MS);
        } else {
          this.logger.error(
            `Ledger write permanently failed after ${AiRunLedgerService.MAX_RETRIES + 1} attempts — telemetry lost for ${params.runType} (model=${params.model}, tenant=${params.tenantId})`,
            error instanceof Error ? error.stack : undefined,
          );
        }
      }
    }
  }

  /** Map runType to PredictionType enum for governance attribution. */
  private resolvePredictionType(runType: string): PredictionType {
    switch (runType) {
      case 'lead-scoring':
        return PredictionType.LEAD_SCORE;
      case 'churn-prediction':
        return PredictionType.CHURN;
      case 'forecast':
        return PredictionType.FORECAST;
      case 'nba':
        return PredictionType.NBA;
      case 'chat':
        return PredictionType.CHAT;
      default:
        return PredictionType.OTHER;
    }
  }

  /** Coerce non-finite values to 0. */
  private safeInt(value: number): number {
    return Number.isFinite(value) ? Math.round(value) : 0;
  }

  /** Non-blocking delay for retry backoff. */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
