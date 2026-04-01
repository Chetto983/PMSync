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
import { detectPII, getSupportedPIITypes } from '@sentinelseed/voltagent';

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
  | 'DRIVER_LICENSE'
  | 'CODICE_FISCALE'
  | 'PARTITA_IVA'
  | 'IBAN_IT'
  | 'PHONE_IT';

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

const ITALIAN_PII_TYPES: PiiType[] = ['CODICE_FISCALE', 'PARTITA_IVA', 'IBAN_IT', 'PHONE_IT'];

const DEFAULT_CONFIG: PiiDetectionConfig = {
  detectTypes: [...(getSupportedPIITypes() as PiiType[]), ...ITALIAN_PII_TYPES],
  enableRedaction: true,
  redactionStyle: 'HASH',
  enableLogging: true,
};

/**
 * Italian PII patterns (SEC-H1).
 * Sentinel only covers US-centric patterns; these add Italian document types.
 */
interface ItalianPiiPattern {
  type: PiiType;
  regex: RegExp;
  validate?: (match: string) => boolean;
  confidence: number;
}

const ITALIAN_PII_PATTERNS: ItalianPiiPattern[] = [
  {
    // Codice Fiscale: 6 alpha + 2 digits + 1 alpha + 2 digits + 1 alpha + 3 digits + 1 alpha
    type: 'CODICE_FISCALE',
    regex: /\b[A-Z]{6}\d{2}[A-EHLMPR-T]\d{2}[A-Z]\d{3}[A-Z]\b/gi,
    validate: (match: string) => {
      // Basic structural validation: must be exactly 16 chars
      return match.length === 16;
    },
    confidence: 0.9,
  },
  {
    // Partita IVA: exactly 11 digits, optionally prefixed by "IT" or "P.IVA"
    type: 'PARTITA_IVA',
    regex: /(?:(?:IT|P\.?\s?IVA\s*:?\s*)(\d{11})\b|\b(\d{11})\b)/gi,
    validate: (match: string) => {
      // Extract just the 11 digits
      const digits = match.replace(/\D/g, '');
      if (digits.length !== 11) return false;
      // Luhn-like check digit validation for Italian P.IVA
      let sum = 0;
      for (let i = 0; i < 11; i++) {
        const d = parseInt(digits[i], 10);
        if (i % 2 === 0) {
          sum += d;
        } else {
          const doubled = d * 2;
          sum += doubled > 9 ? doubled - 9 : doubled;
        }
      }
      return sum % 10 === 0;
    },
    confidence: 0.85,
  },
  {
    // Italian IBAN: IT + 2 check digits + 1 CIN letter + 5 ABI + 5 CAB + 12 account
    type: 'IBAN_IT',
    regex: /\bIT\s?\d{2}\s?[A-Z]\s?\d{5}\s?\d{5}\s?[A-Z0-9]{12}\b/gi,
    confidence: 0.95,
  },
  {
    // Italian phone: +39 prefix with various formats (mobile + landline)
    type: 'PHONE_IT',
    regex: /(?:\+39\s?|0039\s?)(?:3\d{2}|0\d{1,3})[\s.-]?\d{2,4}[\s.-]?\d{3,4}\b/g,
    confidence: 0.85,
  },
];

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

    // Filter Sentinel matches by configured types and convert to our format
    const matches: PiiMatch[] = (sentinelResult.detected && sentinelResult.matches.length > 0)
      ? sentinelResult.matches
          .filter((m) => this.config.detectTypes.includes(m.type as PiiType))
          .filter((m) => !this.shouldIgnoreMatch(m.value, m.type as PiiType))
          .map((m) => ({
            type: m.type as PiiType,
            value: m.value,
            redactedValue: this.redactValue(m.value, m.type as PiiType),
            startIndex: m.start,
            endIndex: m.end,
            confidence: m.confidence,
          }))
      : [];

    // Italian PII patterns (SEC-H1) — always run alongside Sentinel
    const italianMatches = this.detectItalianPii(text);
    matches.push(...italianMatches);

    if (matches.length === 0) {
      return {
        hasPii: false,
        detectedTypes: [],
        originalText: text,
        redactedText: text,
        piiCount: 0,
        details: [],
      };
    }

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
    return this.detect(text).hasPii;
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

  /**
   * Detect Italian PII patterns not covered by Sentinel.
   */
  private detectItalianPii(text: string): PiiMatch[] {
    const results: PiiMatch[] = [];
    for (const pattern of ITALIAN_PII_PATTERNS) {
      if (!this.config.detectTypes.includes(pattern.type)) continue;
      // Reset regex lastIndex for global patterns
      pattern.regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.regex.exec(text)) !== null) {
        const value = match[0];
        if (pattern.validate && !pattern.validate(value)) continue;
        results.push({
          type: pattern.type,
          value,
          redactedValue: this.redactValue(value, pattern.type),
          startIndex: match.index,
          endIndex: match.index + value.length,
          confidence: pattern.confidence,
        });
      }
    }
    return results;
  }

  private shouldIgnoreMatch(value: string, type: PiiType): boolean {
    if (type === 'PHONE' && this.looksLikeTimestampId(value)) {
      return true;
    }
    return false;
  }

  private looksLikeTimestampId(value: string): boolean {
    const trimmed = String(value || '').trim();
    if (!/^\d{12,14}$/.test(trimmed)) {
      return false;
    }

    const year = Number(trimmed.slice(0, 4));
    const month = Number(trimmed.slice(4, 6));
    const day = Number(trimmed.slice(6, 8));
    const hour = Number(trimmed.slice(8, 10));
    const minute = Number(trimmed.slice(10, 12));
    const second = trimmed.length >= 14 ? Number(trimmed.slice(12, 14)) : 0;

    return year >= 2000
      && year <= 2100
      && month >= 1
      && month <= 12
      && day >= 1
      && day <= 31
      && hour >= 0
      && hour <= 23
      && minute >= 0
      && minute <= 59
      && second >= 0
      && second <= 59;
  }
}
