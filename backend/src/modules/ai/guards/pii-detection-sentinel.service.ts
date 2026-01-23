/**
 * PII Detection Service (Sentinel-powered)
 *
 * Uses @sentinelseed/voltagent for comprehensive PII detection,
 * with custom redaction format for resolution compatibility.
 *
 * Features:
 * - 12 PII types vs original 6 (EMAIL, PHONE, SSN, CREDIT_CARD, IP_ADDRESS,
 *   DATE_OF_BIRTH, API_KEY, AWS_KEY, PRIVATE_KEY, JWT_TOKEN, PASSPORT, DRIVER_LICENSE)
 * - Battle-tested patterns from Sentinel
 * - Unique hash-based placeholders for multi-value resolution
 *
 * @see https://github.com/sentinel-seed/sentinel/tree/main/packages/voltagent
 */
import { Injectable, Logger } from '@nestjs/common';
import { detectPII, hasPII, getSupportedPIITypes } from '@sentinelseed/voltagent';

/**
 * Extended PII types from Sentinel
 * Superset of original types + new types for API keys, tokens, etc.
 */
export type PiiType =
  | 'EMAIL'
  | 'PHONE'
  | 'SSN'
  | 'CREDIT_CARD'
  | 'IP_ADDRESS'
  | 'IBAN' // Keep for backward compatibility
  | 'DATE_OF_BIRTH'
  | 'API_KEY'
  | 'AWS_KEY'
  | 'PRIVATE_KEY'
  | 'JWT_TOKEN'
  | 'PASSPORT'
  | 'DRIVER_LICENSE';

export interface PiiMatch {
  type: PiiType;
  value: string;
  redactedValue: string;
  startIndex: number;
  endIndex: number;
  confidence?: number;
}

export interface PiiDetectionResult {
  hasPii: boolean;
  detectedTypes: PiiType[];
  originalText: string;
  redactedText: string;
  piiCount: number;
  details: PiiMatch[];
}

export interface PiiDetectionConfig {
  detectTypes: PiiType[];
  enableRedaction: boolean;
  redactionStyle: 'MASK' | 'TYPE_LABEL' | 'HASH';
  enableLogging: boolean;
}

const DEFAULT_CONFIG: PiiDetectionConfig = {
  detectTypes: getSupportedPIITypes() as PiiType[],
  enableRedaction: true,
  redactionStyle: 'HASH',
  enableLogging: true,
};

@Injectable()
export class PiiDetectionService {
  private readonly logger = new Logger(PiiDetectionService.name);
  private config: PiiDetectionConfig;

  constructor() {
    this.config = DEFAULT_CONFIG;
  }

  configure(config: Partial<PiiDetectionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Detect PII using Sentinel with resolution-compatible output.
   */
  detect(text: string): PiiDetectionResult {
    if (!text) {
      return {
        hasPii: false,
        detectedTypes: [],
        originalText: text,
        redactedText: text,
        piiCount: 0,
        details: [],
      };
    }

    // Use Sentinel for detection
    const sentinelResult = detectPII(text);

    if (!sentinelResult.detected || !sentinelResult.matches.length) {
      return {
        hasPii: false,
        detectedTypes: [],
        originalText: text,
        redactedText: text,
        piiCount: 0,
        details: [],
      };
    }

    // Filter by configured types and convert to our format
    const matches: PiiMatch[] = sentinelResult.matches
      .filter((m) => this.config.detectTypes.includes(m.type as PiiType))
      .map((m) => ({
        type: m.type as PiiType,
        value: m.value,
        redactedValue: this.redactValue(m.value, m.type as PiiType),
        startIndex: m.start,
        endIndex: m.end,
        confidence: m.confidence,
      }));

    // Apply redaction with unique placeholders
    let redactedText = text;
    if (this.config.enableRedaction && matches.length > 0) {
      // Sort by position descending to replace from end
      const sortedMatches = [...matches].sort((a, b) => b.startIndex - a.startIndex);
      for (const m of sortedMatches) {
        redactedText =
          redactedText.substring(0, m.startIndex) +
          m.redactedValue +
          redactedText.substring(m.endIndex);
      }
    }

    const detectedTypes = [...new Set(matches.map((m) => m.type))];

    if (this.config.enableLogging && matches.length > 0) {
      this.logger.warn(`PII detected: ${matches.length} items of types: ${detectedTypes.join(', ')}`);
    }

    return {
      hasPii: matches.length > 0,
      detectedTypes,
      originalText: text,
      redactedText,
      piiCount: matches.length,
      details: matches,
    };
  }

  /**
   * Quick check if text contains PII (fast path).
   */
  containsPii(text: string): boolean {
    if (!text) return false;
    return hasPII(text);
  }

  /**
   * Redact PII and return redacted text only.
   */
  redact(text: string): string {
    return this.detect(text).redactedText;
  }

  /**
   * Resolve redacted placeholders using detection matches.
   * Used for rehydrating LLM outputs without stored mappings.
   */
  resolveFromMatches(text: string, matches: PiiMatch[]): string {
    if (!text || !matches || matches.length === 0) {
      return text;
    }

    const unique = new Map<string, string>();
    for (const match of matches) {
      if (!unique.has(match.redactedValue)) {
        unique.set(match.redactedValue, match.value);
      }
    }

    let resolved = text;
    for (const [placeholder, original] of unique.entries()) {
      if (resolved.includes(placeholder)) {
        resolved = resolved.replaceAll(placeholder, original);
      }
    }

    return resolved;
  }

  /**
   * Get supported PII types from Sentinel.
   */
  getSupportedTypes(): PiiType[] {
    return getSupportedPIITypes() as PiiType[];
  }

  /**
   * Create unique redacted placeholder for a value.
   * Uses hash for uniqueness to support multi-value resolution.
   */
  private redactValue(value: string, type: PiiType): string {
    switch (this.config.redactionStyle) {
      case 'MASK':
        if (value.length <= 4) return '*'.repeat(value.length);
        return value[0] + '*'.repeat(value.length - 2) + value[value.length - 1];
      case 'TYPE_LABEL':
        return `[${type}_REDACTED]`;
      case 'HASH':
        const hash = this.simpleHash(value);
        return `[${type}_REDACTED:${hash}]`;
      default:
        return `[REDACTED]`;
    }
  }

  /**
   * Simple hash for unique placeholder generation.
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).substring(0, 8);
  }
}
