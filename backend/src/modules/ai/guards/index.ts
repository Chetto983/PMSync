/**
 * AI Security Guards
 *
 * Services for securing AI/LLM interactions:
 * - Prompt injection prevention
 * - PII detection and redaction
 *
 * @see OWASP LLM Top 10 2025
 */

export { PromptGuardService, type PromptValidationResult, type PromptGuardConfig } from './prompt-guard-sentinel.service';
export {
  PiiDetectionService,
  type PiiDetectionResult,
  type PiiDetectionConfig,
  type PiiMatch,
  type PiiType,
} from './pii-detection-sentinel.service';
export {
  PiiResolutionService,
  type PiiMapping,
  type SessionPiiStore,
} from './pii-resolution.service';
