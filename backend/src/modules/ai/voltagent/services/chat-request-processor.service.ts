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
import { Injectable, Logger, Optional } from '@nestjs/common';
import { PromptGuardService, PiiDetectionService, PiiResolutionService, type PiiMatch } from '../../guards';
import { RateLimiterService } from './rate-limiter.service';
import type { AgentType } from '../types';
import type { MistralModel } from '../providers/mistral.provider';

export interface ChatRequestOptions {
  tenantId: string;
  userId: string;
  sessionId: string;
  model?: MistralModel;
  preferSpeed?: boolean;
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
}

export interface ProcessedRequest {
  processedMessage: string;
  selectedModel: MistralModel;
  suggestedAgent: AgentType;
  piiSessionId: string;
  hasPii: boolean;
  piiDetails: PiiMatch[];
  estimatedTokens: number;
}

@Injectable()
export class ChatRequestProcessorService {
  private readonly logger = new Logger(ChatRequestProcessorService.name);

  constructor(
    @Optional() private readonly promptGuardService: PromptGuardService | null,
    @Optional() private readonly piiDetectionService: PiiDetectionService | null,
    @Optional() private readonly piiResolutionService: PiiResolutionService | null,
    @Optional() private readonly rateLimiterService: RateLimiterService | null,
  ) {}

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

    // 3. Route to optimal model
    const routing = this.routeModel(piiResult.processedMessage, {
      model: options.model,
      preferSpeed: options.preferSpeed,
      preferQuality: options.preferQuality,
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
   * Route message to optimal model and agent.
   * VoltAgent 2.x handles model selection natively via agent configuration.
   */
  routeModel(
    _message: string,
    options: { model?: MistralModel; preferSpeed?: boolean; preferQuality?: boolean },
  ): ModelRoutingResult {
    // VoltAgent 2.x native model routing - model configured per agent via env vars
    return {
      recommendedModel: options.model || 'medium',
      suggestedAgent: 'Supervisor',
      estimatedTokens: 500,
    };
  }
}
