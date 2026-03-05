/**
 * InsightUtilsService - Shared utilities for email insight sub-services.
 * Error mapping, strip markdown, label linking, smart reply formatting.
 * Extracted from EmailInsightsService (Phase 43).
 */
import { BadRequestException, HttpException, HttpStatus, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { AiError, AiErrorCode } from '../errors';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class InsightUtilsService {
  private readonly logger = new Logger(InsightUtilsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Map AiError codes to appropriate HTTP exceptions */
  mapAiErrorToHttpException(error: unknown, operation: string): HttpException {
    if (error instanceof HttpException) return error;
    const aiError = error instanceof AiError ? error : AiError.fromError(error);

    switch (aiError.code) {
      case AiErrorCode.CIRCUIT_BREAKER_OPEN:
        return new ServiceUnavailableException({ message: 'AI service temporarily unavailable. Please try again in a minute.', code: aiError.code, retryable: true });
      case AiErrorCode.QUOTA_EXCEEDED:
        return new HttpException({ message: aiError.message || 'AI usage quota exceeded.', code: aiError.code, retryable: false }, HttpStatus.PAYMENT_REQUIRED);
      case AiErrorCode.RATE_LIMITED:
        return new HttpException({ message: 'Too many AI requests. Please wait a moment.', code: aiError.code, retryable: true }, HttpStatus.TOO_MANY_REQUESTS);
      case AiErrorCode.PROVIDER_TIMEOUT:
        return new HttpException({ message: 'AI service timed out. Please try again.', code: aiError.code, retryable: true }, HttpStatus.GATEWAY_TIMEOUT);
      case AiErrorCode.PROVIDER_UNAVAILABLE:
        return new ServiceUnavailableException({ message: 'AI provider is currently unavailable.', code: aiError.code, retryable: true });
      case AiErrorCode.PROVIDER_ERROR:
        return new ServiceUnavailableException({ message: aiError.message || 'AI provider error.', code: aiError.code, retryable: false });
      case AiErrorCode.PROMPT_BLOCKED:
      case AiErrorCode.OUTPUT_BLOCKED:
        return new BadRequestException({ message: 'Request blocked by security filters.', code: aiError.code, retryable: false });
      case AiErrorCode.CONTEXT_TOO_LONG:
        return new BadRequestException({ message: 'Input too long for AI processing.', code: aiError.code, retryable: false });
      case AiErrorCode.EMPTY_RESPONSE:
        return new ServiceUnavailableException({ message: 'AI returned an empty response.', code: aiError.code, retryable: true });
      case AiErrorCode.AUTH_FAILED:
        return new ServiceUnavailableException({ message: 'AI service authentication failed.', code: aiError.code, retryable: false });
      default:
        return new HttpException({ message: `Unable to ${operation}: ${aiError.message}`, code: aiError.code || 'INTERNAL_ERROR', retryable: aiError.retryable }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /** Strip markdown formatting from AI-generated text */
  stripMarkdown(text: string): string {
    return text
      .replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1').replace(/_([^_]+)_/g, '$1')
      .replace(/^#{1,6}\s+/gm, '').replace(/^\s*[\-\*\u2022]\s+/gm, '- ')
      .replace(/^\s*\d+\.\s+/gm, '').replace(/```[\s\S]*?```/g, '')
      .replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\n{3,}/g, '\n\n').trim();
  }

  /** Deduplicate and clean smart reply candidates */
  formatSmartReplyCandidates(candidates: string[]): string[] {
    const normalized: string[] = [];
    const seen = new Set<string>();
    candidates.forEach((candidate) => {
      if (!candidate) return;
      const cleaned = candidate
        .replace(/```/g, '').replace(/^"+|"+$/g, '').replace(/\\n/g, ' ')
        .replace(/\\"/g, '"').replace(/\s*\n+\s*/g, ' ').replace(/\s{2,}/g, ' ')
        .replace(/^[\-\*\d.\s]+/, '').trim();
      if (!cleaned) return;
      const dedupeKey = cleaned.toLowerCase();
      if (!seen.has(dedupeKey)) { normalized.push(cleaned); seen.add(dedupeKey); }
    });
    return normalized;
  }

  /** Extract lines from raw AI text output */
  extractLines(payload: string): string[] {
    return payload.split(/\n+/)
      .map((line) => line.replace(/^[\-\*\d.\s]+/, '').trim())
      .filter(Boolean).filter((line) => !/^```/.test(line))
      .filter((line) => !/^[\{\}\[\]]+$/.test(line))
      .filter((line) => !/^"?(replies|labels|subject|body|text|message|reply|content)"?\s*:/.test(line));
  }

  /** Link email to UserLabel records via EmailLabel junction table */
  async linkEmailToUserLabels(tenantId: string, emailId: string, labelNames: string[]): Promise<void> {
    if (labelNames.length === 0) return;
    try {
      const matchingLabels = await this.prisma.userLabel.findMany({
        where: { tenantId, isArchived: false, OR: labelNames.map((name) => ({ name: { equals: name, mode: 'insensitive' as const } })) },
        select: { id: true, name: true },
      });
      if (matchingLabels.length === 0) {
        this.logger.debug(`[tenant:${tenantId}] No matching UserLabel records for AI labels: ${labelNames.join(', ')}`);
        return;
      }
      const result = await this.prisma.emailLabel.createMany({
        data: matchingLabels.map((label) => ({ tenantId, emailId, labelId: label.id })),
        skipDuplicates: true,
      });
      this.logger.debug(`[tenant:${tenantId}] Linked email ${emailId} to ${result.count} UserLabel(s): ${matchingLabels.map((l) => l.name).join(', ')}`);
    } catch (error) {
      this.logger.warn(`[tenant:${tenantId}] Failed to link email ${emailId} to labels: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  truncate(value: string, limit = 6000): string {
    return value.length > limit ? `${value.slice(0, limit)}...` : value;
  }
}
