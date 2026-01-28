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
 * - Tool Execution: Resolves [EMAIL_REDACTED:abcd1234] → john@example.com
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
      // Get existing store or create new one
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

      // Add new mappings (deduplicate by placeholder)
      const existingPlaceholders = new Set(store.mappings.map((m) => m.placeholder));

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

      // Store with TTL
      await this.cacheService.set(key, store, {
        namespace: CacheNamespace.PII_RESOLUTION,
        ttl: PII_MAPPING_TTL_SECONDS,
      });

      this.logger.debug(
        `Stored ${matches.length} PII mappings for session ${sessionId}, total: ${store.mappings.length}`,
      );
    } catch (error) {
      this.logger.error(`Failed to store PII mapping: ${error}`);
      // Don't throw - PII resolution is best-effort, don't break chat flow
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

      let resolved = text;
      let resolutionCount = 0;

      for (const mapping of store.mappings) {
        if (resolved.includes(mapping.placeholder)) {
          resolved = resolved.replaceAll(mapping.placeholder, mapping.originalValue);
          resolutionCount++;
        }
      }

      if (resolutionCount > 0) {
        this.logger.debug(
          `Resolved ${resolutionCount} PII placeholders in text for session ${sessionId}`,
        );
      }

      return resolved;
    } catch (error) {
      this.logger.error(`Failed to resolve PII in text: ${error}`);
      return text; // Return original on error
    }
  }

  /**
   * Resolve PII in an object's string values (shallow).
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
        return payload;
      }

      let resolutionCount = 0;

      // Recursive resolver for nested structures
      const resolveValue = (value: unknown): unknown => {
        if (typeof value === 'string') {
          let resolved = value;
          for (const mapping of store.mappings) {
            if (resolved.includes(mapping.placeholder)) {
              resolved = resolved.replaceAll(mapping.placeholder, mapping.originalValue);
              resolutionCount++;
            }
          }
          return resolved;
        }

        if (Array.isArray(value)) {
          return value.map((item) => resolveValue(item));
        }

        if (value && typeof value === 'object') {
          const resolved: Record<string, unknown> = {};
          for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
            resolved[key] = resolveValue(val);
          }
          return resolved;
        }

        return value;
      };

      const resolved = resolveValue(payload) as T;

      if (resolutionCount > 0) {
        this.logger.debug(
          `Resolved ${resolutionCount} PII placeholders in payload for session ${sessionId}`,
        );
      }

      return resolved;
    } catch (error) {
      this.logger.error(`Failed to resolve PII in payload: ${error}`);
      return payload; // Return original on error
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
    // Match patterns like [EMAIL_REDACTED], [EMAIL_REDACTED:abcd1234], etc.
    return /\[[A-Z_]+_REDACTED(?::[a-f0-9]+)?\]/.test(text);
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
