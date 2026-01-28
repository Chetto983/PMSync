/**
 * ChatRequestProcessor Service
 *
 * Handles input processing for chat requests:
 * - Prompt injection validation
 * - PII detection and redaction
 * - Rate limit checking
 * - Model routing
 *
 * Part of VoltAgentService refactoring (2302 → <500 lines)
 * Created: 2026-01-22
 */
import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { PromptGuardService, PiiDetectionService, PiiResolutionService, type PiiMatch } from '../../guards';
import { RateLimiterService } from './rate-limiter.service';
import { TaskComplexityClassifierService, type TaskIntent } from './task-complexity-classifier.service';
import type { AgentType } from '../types';
import type { MistralModel } from '../providers/mistral.provider';

export interface ChatRequestOptions {
  tenantId: string;
  userId: string;
  sessionId: string;
  model?: MistralModel;
  preferSpeed?: boolean;
  locale?: string;
  preferQuality?: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  riskScore?: number;
  requiresHumanReview?: boolean;
  detectedPatterns?: string[];
  errorMessage?: string;
}

export interface PiiProcessingResult {
  processedMessage: string;
  hasPii: boolean;
  piiDetails: PiiMatch[];
  detectedTypes: string[];
}

export interface ChatRateLimitResult {
  allowed: boolean;
  resetInSeconds?: number;
}

export interface ModelRoutingResult {
  recommendedModel: MistralModel;
  suggestedAgent: AgentType;
  estimatedTokens: number;
  /** RLM: Detected intent for minimal prompt loading */
  intent: TaskIntent;
}

export interface ProcessedRequest {
  processedMessage: string;
  selectedModel: MistralModel;
  suggestedAgent: AgentType;
  piiSessionId: string;
  hasPii: boolean;
  piiDetails: PiiMatch[];
  estimatedTokens: number;
  /** RLM: Detected intent for minimal prompt loading */
  intent: TaskIntent;
}

@Injectable()
export class ChatRequestProcessorService {
  private readonly logger = new Logger(ChatRequestProcessorService.name);

  constructor(
    @Optional() private readonly promptGuardService: PromptGuardService | null,
    @Optional() private readonly piiDetectionService: PiiDetectionService | null,
    @Optional() private readonly piiResolutionService: PiiResolutionService | null,
    @Optional() private readonly rateLimiterService: RateLimiterService | null,
    // CRITICAL: Use @Inject() to force NestJS to resolve this dependency explicitly
    @Inject(TaskComplexityClassifierService) private readonly taskClassifier: TaskComplexityClassifierService,
  ) {
    this.logger.log(`[INIT] TaskClassifier injected: ${!!this.taskClassifier}`);
  }

  /**
   * Process a chat request - validate, redact PII, check rate limits, route model.
   *
   * @param message - Raw user message
   * @param options - Request options with tenant/user context
   * @returns Processed request ready for agent execution
   * @throws Error if validation fails or rate limit exceeded
   */
  async process(message: string, options: ChatRequestOptions): Promise<ProcessedRequest> {
    const logPrefix = `[tenant:${options.tenantId}]`;

    // 1. Validate input for prompt injection (OWASP LLM01:2025)
    const validation = this.validateInput(message);
    if (!validation.isValid) {
      this.logger.warn(
        `${logPrefix} Prompt injection blocked: score=${validation.riskScore}, patterns=${validation.detectedPatterns?.join(', ')}`,
      );
      throw new Error(validation.errorMessage || 'Invalid input detected');
    }

    if (validation.requiresHumanReview) {
      this.logger.warn(`${logPrefix} High-risk prompt flagged for review: score=${validation.riskScore}`);
    }

    // 2. Detect and redact PII
    const piiResult = await this.processAndStorePii(message, options.tenantId, options.sessionId);

    // 3. Route to optimal model (with async LLM fallback for unknown intents)
    const routing = await this.routeModel(piiResult.processedMessage, {
      model: options.model,
      preferSpeed: options.preferSpeed,
      preferQuality: options.preferQuality,
      locale: options.locale,
    });

    // 4. Check rate limits
    const rateLimit = await this.checkRateLimit(options.tenantId, routing.estimatedTokens);
    if (!rateLimit.allowed) {
      throw new Error(`Rate limit exceeded. Please try again in ${rateLimit.resetInSeconds} seconds.`);
    }

    return {
      processedMessage: piiResult.processedMessage,
      selectedModel: options.model || routing.recommendedModel,
      suggestedAgent: routing.suggestedAgent,
      piiSessionId: options.sessionId,
      hasPii: piiResult.hasPii,
      piiDetails: piiResult.piiDetails,
      estimatedTokens: routing.estimatedTokens,
      intent: routing.intent, // RLM: Pass intent for minimal prompt
    };
  }

  /**
   * Validate input for prompt injection attacks.
   */
  validateInput(message: string): ValidationResult {
    if (!this.promptGuardService) {
      return { isValid: true };
    }

    const result = this.promptGuardService.validateInput(message);
    return {
      isValid: result.isValid,
      riskScore: result.riskScore,
      requiresHumanReview: result.requiresHumanReview,
      detectedPatterns: result.detectedPatterns,
      errorMessage: result.isValid ? undefined : 'I cannot process this request. Please rephrase your message.',
    };
  }

  /**
   * Detect PII in message and store mapping for later rehydration.
   */
  async processAndStorePii(
    message: string,
    tenantId: string,
    sessionId: string,
  ): Promise<PiiProcessingResult> {
    if (!this.piiDetectionService) {
      return {
        processedMessage: message,
        hasPii: false,
        piiDetails: [],
        detectedTypes: [],
      };
    }

    const piiResult = this.piiDetectionService.detect(message);

    if (piiResult.hasPii) {
      this.logger.log(
        `[tenant:${tenantId}] PII detected and redacted: types=${piiResult.detectedTypes.join(', ')}`,
      );

      // Store mapping for tool execution resolution
      if (this.piiResolutionService && piiResult.details.length > 0) {
        await this.piiResolutionService
          .storeMapping(tenantId, sessionId, piiResult.details)
          .catch(err => {
            this.logger.warn(`[tenant:${tenantId}] Failed to store PII mapping: ${err}`);
          });
      }
    }

    return {
      processedMessage: piiResult.redactedText,
      hasPii: piiResult.hasPii,
      piiDetails: piiResult.details,
      detectedTypes: piiResult.detectedTypes,
    };
  }

  /**
   * Check rate limits for the tenant.
   */
  async checkRateLimit(tenantId: string, estimatedTokens: number): Promise<ChatRateLimitResult> {
    if (!this.rateLimiterService) {
      return { allowed: true };
    }

    const result = await this.rateLimiterService.checkLimit(tenantId, estimatedTokens);
    return {
      allowed: result.allowed,
      resetInSeconds: result.resetInSeconds,
    };
  }

  /**
   * Route message to optimal model and agent using intelligent classification.
   *
   * Uses TaskComplexityClassifierService with hybrid approach:
   * 1. Pattern matching (instant, free) - handles 85%+ of requests
   * 2. LLM fallback with Ministral 3B (~$0.04/M tokens) - for unknown intents
   *
   * Model routing:
   * - Greetings/Search → small model (75% cost savings)
   * - Email composition → creative model (96% cost savings vs devstral)
   * - Orchestration → medium model (required for tool delegation)
   *
   * @param message - User's input message
   * @param options - Routing options including explicit model override
   * @returns Model routing result with recommended model and agent
   */
  async routeModel(
    message: string,
    options: { model?: MistralModel; preferSpeed?: boolean; preferQuality?: boolean; locale?: string },
  ): Promise<ModelRoutingResult> {
    // Honor explicit model override
    if (options.model) {
      return {
        recommendedModel: options.model,
        suggestedAgent: 'Supervisor',
        estimatedTokens: this.estimateTokens(message),
        intent: 'unknown', // RLM: Unknown intent when model is overridden
      };
    }

    // Use intelligent classification if available
    if (this.taskClassifier) {
      // Use SYNC classify() - zero dependencies, instant pattern matching
      const result = this.taskClassifier.classify(message, options.locale);
      this.logger.log(
        `[ModelRouting] CLASSIFIER: intent=${result.intent}, model=${result.recommendedModel}, agent=${result.recommendedAgent}, confidence=${result.confidence}`,
      );

      // Apply preference overrides
      let recommendedModel = result.recommendedModel;
      if (options.preferSpeed && recommendedModel !== 'small') {
        // For speed, downgrade to small unless it's supervisor (needs medium)
        if (result.recommendedAgent !== 'Supervisor') {
          recommendedModel = 'small';
        }
      }
      if (options.preferQuality) {
        // For quality, upgrade creative → medium, small → medium
        if (recommendedModel === 'small' || recommendedModel === 'creative') {
          recommendedModel = 'medium';
        }
      }

      return {
        recommendedModel,
        suggestedAgent: result.recommendedAgent,
        estimatedTokens: this.estimateTokens(message),
        intent: result.intent, // RLM: Pass detected intent
      };
    }

    // Fallback: default to medium for safety (supervisor compatibility)
    this.logger.warn(`[ModelRouting] FALLBACK: taskClassifier not injected, using Supervisor/medium`);
    return {
      recommendedModel: 'medium',
      suggestedAgent: 'Supervisor',
      estimatedTokens: this.estimateTokens(message),
      intent: 'unknown', // RLM: Unknown intent when fallback
    };
  }

  /**
   * Estimate token count for a message (rough approximation).
   * Uses ~4 chars per token as industry standard.
   */
  private estimateTokens(message: string): number {
    return Math.ceil(message.length / 4) + 100; // +100 for system prompt overhead
  }
}
