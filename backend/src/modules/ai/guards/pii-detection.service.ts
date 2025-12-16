/**
 * PII Detection Service
 *
 * Detects and optionally redacts Personally Identifiable Information (PII)
 * before sending to LLM. Essential for GDPR/CCPA compliance.
 *
 * @see https://www.wiz.io/academy/llm-security
 */
import { Injectable, Logger } from '@nestjs/common';

export interface PiiDetectionResult {
  hasPii: boolean;
  detectedTypes: PiiType[];
  originalText: string;
  redactedText: string;
  piiCount: number;
  details: PiiMatch[];
}

export interface PiiMatch {
  type: PiiType;
  value: string;
  redactedValue: string;
  startIndex: number;
  endIndex: number;
}

export type PiiType =
  | 'EMAIL'
  | 'PHONE'
  | 'SSN'
  | 'CREDIT_CARD'
  | 'IP_ADDRESS'
  | 'IBAN';

export interface PiiDetectionConfig {
  detectTypes: PiiType[];
  enableRedaction: boolean;
  redactionStyle: 'MASK' | 'TYPE_LABEL' | 'HASH';
  enableLogging: boolean;
}

const DEFAULT_CONFIG: PiiDetectionConfig = {
  detectTypes: ['EMAIL', 'PHONE', 'SSN', 'CREDIT_CARD', 'IP_ADDRESS', 'IBAN'],
  enableRedaction: true,
  redactionStyle: 'TYPE_LABEL',
  enableLogging: true,
};

@Injectable()
export class PiiDetectionService {
  private readonly logger = new Logger(PiiDetectionService.name);
  private config: PiiDetectionConfig;

  private readonly PII_PATTERNS: Record<PiiType, RegExp> = {
    EMAIL: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    PHONE: /(?:\+?1[-.\s]?)?(?:\([0-9]{3}\)|[0-9]{3})[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g,
    SSN: /\b[0-9]{3}[-\s]?[0-9]{2}[-\s]?[0-9]{4}\b/g,
    CREDIT_CARD: /\b[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4}\b/g,
    IP_ADDRESS: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
    IBAN: /\b[A-Z]{2}[0-9]{2}[A-Z0-9]{4}[0-9]{7}([A-Z0-9]?){0,16}\b/g,
  };

  constructor() {
    this.config = DEFAULT_CONFIG;
  }

  configure(config: Partial<PiiDetectionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  detect(text: string): PiiDetectionResult {
    const matches: PiiMatch[] = [];
    let redactedText = text;

    for (const type of this.config.detectTypes) {
      const pattern = this.PII_PATTERNS[type];
      if (!pattern) continue;

      pattern.lastIndex = 0;

      let match;
      while ((match = pattern.exec(text)) !== null) {
        const value = match[0];
        const redactedValue = this.redactValue(value, type);

        matches.push({
          type,
          value,
          redactedValue,
          startIndex: match.index,
          endIndex: match.index + value.length,
        });
      }
    }

    if (this.config.enableRedaction && matches.length > 0) {
      const sortedMatches = [...matches].sort((a, b) => b.startIndex - a.startIndex);

      for (const m of sortedMatches) {
        redactedText =
          redactedText.substring(0, m.startIndex) + m.redactedValue + redactedText.substring(m.endIndex);
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

  containsPii(text: string): boolean {
    for (const type of this.config.detectTypes) {
      const pattern = this.PII_PATTERNS[type];
      if (!pattern) continue;
      pattern.lastIndex = 0;
      if (pattern.test(text)) return true;
    }
    return false;
  }

  redact(text: string): string {
    return this.detect(text).redactedText;
  }

  private redactValue(value: string, type: PiiType): string {
    switch (this.config.redactionStyle) {
      case 'MASK':
        if (value.length <= 4) return '*'.repeat(value.length);
        return value[0] + '*'.repeat(value.length - 2) + value[value.length - 1];
      case 'TYPE_LABEL':
        return `[${type}_REDACTED]`;
      case 'HASH':
        const hash = this.simpleHash(value);
        return `[${type}:${hash}]`;
      default:
        return `[REDACTED]`;
    }
  }

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
