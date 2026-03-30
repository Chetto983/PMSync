/**
 * PII Resolution Service
 *
 * Stores PII mappings in Redis (tenant+session scoped) so that:
 * 1. LLM receives redacted text (GDPR/CCPA compliant)
 * 2. Tool execution can resolve placeholders back to real values
 *
 * Flow:
 * - User: "Send email to john@example.com"
 * - PII Detection: Redacts to "Send email to [EMAIL_REDACTED:abcd1234]"
 * - This Service: Stores mapping { "[EMAIL_REDACTED:abcd1234]": "john@example.com" }
 * - LLM: Sees redacted text, generates tool call with [EMAIL_REDACTED:abcd1234]
 * - Tool Execution: Resolves [EMAIL_REDACTED:abcd1234] -> john@example.com
 * - Action: Sends email to john@example.com
 *
 * @security Mappings are tenant-isolated and session-scoped
 * @see pii-detection.service.ts
 */
import { Injectable, Logger } from '@nestjs/common';
import { CacheService, CacheNamespace } from '../../../common/services/cache.service';
import { PiiMatch, PiiType } from './pii-detection-sentinel.service';

export interface PiiMapping {
  /** Redacted placeholder (e.g., "[EMAIL_REDACTED:abcd1234]") */
  placeholder: string;
  /** Original value (e.g., "john@example.com") */
  originalValue: string;
  /** PII type for context */
  type: PiiType;
  /** Timestamp for debugging */
  detectedAt: string;
}

export interface SessionPiiStore {
  /** All PII mappings for this session */
  mappings: PiiMapping[];
  /** When the store was created */
  createdAt: string;
  /** Last update time */
  updatedAt: string;
}

/** TTL for PII mappings (30 minutes - longer than typical conversation) */
const PII_MAPPING_TTL_SECONDS = 1800;

@Injectable()
export class PiiResolutionService {
  private readonly logger = new Logger(PiiResolutionService.name);

  constructor(private readonly cacheService: CacheService) {}

  /**
   * Generate Redis key for PII store (tenant+session isolated)
   */
  private getStoreKey(tenantId: string, sessionId: string): string {
    return `pii:${tenantId}:${sessionId}`;
  }

  private replacePlaceholdersInString(
    value: string,
    mappings: PiiMapping[],
  ): { value: string; resolutionCount: number } {
    let resolved = value;
    let resolutionCount = 0;

    for (const mapping of mappings) {
      const noBrackets = mapping.placeholder.replace(/^\[|\]$/g, '');
      if (resolved.includes(mapping.placeholder)) {
        resolved = resolved.replaceAll(mapping.placeholder, mapping.originalValue);
        resolutionCount++;
      } else if (resolved.includes(noBrackets)) {
        resolved = resolved.replaceAll(noBrackets, mapping.originalValue);
        resolutionCount++;
        this.logger.warn(
          `[PII-DEBUG] Resolved bracket-stripped placeholder: "${noBrackets}" -> originalValue`,
        );
      }
    }

    return { value: resolved, resolutionCount };
  }

  private resolveWithMappings<T>(
    value: T,
    mappings: PiiMapping[],
    stats?: { resolutionCount: number },
  ): T {
    if (typeof value === 'string') {
      const result = this.replacePlaceholdersInString(value, mappings);
      if (stats) stats.resolutionCount += result.resolutionCount;
      return result.value as T;
    }

    if (Array.isArray(value)) {
      return value.map((item) =>
        this.resolveWithMappings(item, mappings, stats),
      ) as T;
    }

    if (value && typeof value === 'object') {
      const resolved: Record<string, unknown> = {};
      for (const [key, nestedValue] of Object.entries(
        value as Record<string, unknown>,
      )) {
        resolved[key] = this.resolveWithMappings(nestedValue, mappings, stats);
      }
      return resolved as T;
    }

    return value;
  }

  /**
   * Store PII mappings from detection result.
   * Call this after PiiDetectionService.detect() and before sending to LLM.
   *
   * @param tenantId - Tenant isolation
   * @param sessionId - Session/conversation ID for scoping
   * @param matches - PII matches from PiiDetectionService.detect()
   */
  async storeMapping(
    tenantId: string,
    sessionId: string,
    matches: PiiMatch[],
  ): Promise<void> {
    if (!matches || matches.length === 0) {
      return;
    }

    const key = this.getStoreKey(tenantId, sessionId);
    const now = new Date().toISOString();

    try {
      let store = await this.cacheService.get<SessionPiiStore>(key, {
        namespace: CacheNamespace.PII_RESOLUTION,
      });

      if (!store) {
        store = {
          mappings: [],
          createdAt: now,
          updatedAt: now,
        };
      }

      const existingPlaceholders = new Set(
        store.mappings.map((mapping) => mapping.placeholder),
      );

      for (const match of matches) {
        if (!existingPlaceholders.has(match.redactedValue)) {
          store.mappings.push({
            placeholder: match.redactedValue,
            originalValue: match.value,
            type: match.type,
            detectedAt: now,
          });
          existingPlaceholders.add(match.redactedValue);
        }
      }

      store.updatedAt = now;

      await this.cacheService.set(key, store, {
        namespace: CacheNamespace.PII_RESOLUTION,
        ttl: PII_MAPPING_TTL_SECONDS,
      });

      this.logger.debug(
        `Stored ${matches.length} PII mappings for session ${sessionId}, total: ${store.mappings.length}`,
      );
    } catch (error) {
      this.logger.error(`Failed to store PII mapping: ${error}`);
    }
  }

  /**
   * Resolve a single placeholder back to its original value.
   *
   * @param tenantId - Tenant isolation
   * @param sessionId - Session/conversation ID
   * @param placeholder - The redacted placeholder (e.g., "[EMAIL_REDACTED:abcd1234]")
   * @returns Original value or null if not found
   */
  async resolveOne(
    tenantId: string,
    sessionId: string,
    placeholder: string,
  ): Promise<string | null> {
    const key = this.getStoreKey(tenantId, sessionId);

    try {
      const store = await this.cacheService.get<SessionPiiStore>(key, {
        namespace: CacheNamespace.PII_RESOLUTION,
      });

      if (!store) {
        return null;
      }

      const mapping = store.mappings.find((m) => m.placeholder === placeholder);
      return mapping?.originalValue ?? null;
    } catch (error) {
      this.logger.error(`Failed to resolve PII placeholder: ${error}`);
      return null;
    }
  }

  /**
   * Resolve all PII placeholders in a text string.
   * Replaces all [TYPE_REDACTED] placeholders with original values.
   *
   * @param tenantId - Tenant isolation
   * @param sessionId - Session/conversation ID
   * @param text - Text containing placeholders
   * @returns Text with placeholders resolved to original values
   */
  async resolveText(
    tenantId: string,
    sessionId: string,
    text: string,
  ): Promise<string> {
    if (!text) return text;

    const key = this.getStoreKey(tenantId, sessionId);

    try {
      const store = await this.cacheService.get<SessionPiiStore>(key, {
        namespace: CacheNamespace.PII_RESOLUTION,
      });

      if (!store || store.mappings.length === 0) {
        return text;
      }

      const { value: resolved, resolutionCount } =
        this.replacePlaceholdersInString(text, store.mappings);

      if (resolutionCount > 0) {
        this.logger.debug(
          `Resolved ${resolutionCount} PII placeholders in text for session ${sessionId}`,
        );
      }

      return resolved;
    } catch (error) {
      this.logger.error(`Failed to resolve PII in text: ${error}`);
      return text;
    }
  }

  /**
   * Resolve PII in an object's string values.
   * Useful for resolving tool payloads before execution.
   *
   * @param tenantId - Tenant isolation
   * @param sessionId - Session/conversation ID
   * @param payload - Object with string values that may contain placeholders
   * @returns Object with resolved string values
   */
  async resolvePayload<T extends Record<string, unknown>>(
    tenantId: string,
    sessionId: string,
    payload: T,
  ): Promise<T> {
    if (!payload || typeof payload !== 'object') {
      return payload;
    }

    const key = this.getStoreKey(tenantId, sessionId);

    try {
      const store = await this.cacheService.get<SessionPiiStore>(key, {
        namespace: CacheNamespace.PII_RESOLUTION,
      });

      if (!store || store.mappings.length === 0) {
        this.logger.warn(`[PII-DEBUG] resolvePayload: no store/mappings for key=${key}`);
        return payload;
      }

      this.logger.log(
        `[PII-DEBUG] resolvePayload: ${store.mappings.length} mapping(s), payload keys=${Object.keys(payload).join(',')}`,
      );

      const stats = { resolutionCount: 0 };
      const resolved = this.resolveWithMappings(
        payload,
        store.mappings,
        stats,
      ) as T;

      if (stats.resolutionCount > 0) {
        this.logger.debug(
          `Resolved ${stats.resolutionCount} PII placeholders in payload for session ${sessionId}`,
        );
      }

      return resolved;
    } catch (error) {
      this.logger.error(`Failed to resolve PII in payload: ${error}`);
      return payload;
    }
  }

  /**
   * Resolve placeholders in any string / object / array value with a single store lookup.
   * Shared by streaming, persistence, and conversation history readback.
   */
  async resolveValue<T>(
    tenantId: string,
    sessionId: string,
    value: T,
  ): Promise<T> {
    if (value == null || (typeof value !== 'string' && typeof value !== 'object')) {
      return value;
    }

    const key = this.getStoreKey(tenantId, sessionId);

    try {
      const store = await this.cacheService.get<SessionPiiStore>(key, {
        namespace: CacheNamespace.PII_RESOLUTION,
      });

      if (!store || store.mappings.length === 0) {
        return value;
      }

      const stats = { resolutionCount: 0 };
      const resolved = this.resolveWithMappings(value, store.mappings, stats);

      if (stats.resolutionCount > 0) {
        this.logger.debug(
          `Resolved ${stats.resolutionCount} PII placeholders in value for session ${sessionId}`,
        );
      }

      return resolved;
    } catch (error) {
      this.logger.error(`Failed to resolve PII in value: ${error}`);
      return value;
    }
  }

  /**
   * Get all stored PII types for a session.
   * Useful for debugging and auditing.
   */
  async getStoredTypes(
    tenantId: string,
    sessionId: string,
  ): Promise<PiiType[]> {
    const key = this.getStoreKey(tenantId, sessionId);

    try {
      const store = await this.cacheService.get<SessionPiiStore>(key, {
        namespace: CacheNamespace.PII_RESOLUTION,
      });

      if (!store) {
        return [];
      }

      return [...new Set(store.mappings.map((m) => m.type))];
    } catch (error) {
      this.logger.error(`Failed to get stored PII types: ${error}`);
      return [];
    }
  }

  /**
   * Clean up PII mappings for a session.
   * Call this when a conversation ends or is deleted.
   */
  async cleanup(tenantId: string, sessionId: string): Promise<void> {
    const key = this.getStoreKey(tenantId, sessionId);

    try {
      await this.cacheService.del(key, {
        namespace: CacheNamespace.PII_RESOLUTION,
      });
      this.logger.debug(`Cleaned up PII mappings for session ${sessionId}`);
    } catch (error) {
      this.logger.error(`Failed to cleanup PII mappings: ${error}`);
    }
  }

  /**
   * Check if a text contains PII placeholders.
   */
  containsPlaceholders(text: string): boolean {
    if (!text) return false;
    return /\[?[A-Z_]+_REDACTED(?::[a-f0-9]+)?\]?/.test(text);
  }

  /**
   * Fetch mappings for a session (without resolving).
   * Useful for streaming rehydration without repeated Redis calls.
   */
  async getMappings(
    tenantId: string,
    sessionId: string,
  ): Promise<PiiMapping[]> {
    const key = this.getStoreKey(tenantId, sessionId);

    try {
      const store = await this.cacheService.get<SessionPiiStore>(key, {
        namespace: CacheNamespace.PII_RESOLUTION,
      });
      return store?.mappings ?? [];
    } catch (error) {
      this.logger.error(`Failed to load PII mappings: ${error}`);
      return [];
    }
  }
}
