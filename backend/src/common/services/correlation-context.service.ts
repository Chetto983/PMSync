/**
 * Correlation Context Service
 *
 * Provides request-scoped correlation IDs for tracing operations across
 * services and logs. Uses Node.js AsyncLocalStorage for context propagation.
 *
 * Benefits:
 * - Trace requests across multiple services
 * - Link related log entries for debugging
 * - Support distributed tracing
 * - Debug AI agent workflows end-to-end
 *
 * Usage:
 * - In controllers/interceptors: call setContext() at request start
 * - In services: call getCorrelationId() to include in logs
 * - In AI services: context flows through AgentContext.correlationId
 */
import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { nanoid } from 'nanoid';

/**
 * Context data stored per request/operation
 */
export interface CorrelationData {
  /** Unique correlation ID for this request/operation */
  correlationId: string;
  /** Tenant ID for multi-tenancy */
  tenantId?: string;
  /** User ID */
  userId?: string;
  /** Session ID (for chat/AI operations) */
  sessionId?: string;
  /** Parent span ID (for distributed tracing) */
  parentSpanId?: string;
  /** Timestamp when context was created */
  createdAt: number;
}

/**
 * Global AsyncLocalStorage instance for correlation context
 */
const correlationStorage = new AsyncLocalStorage<CorrelationData>();

@Injectable()
export class CorrelationContextService {
  /**
   * Run a function within a correlation context.
   * All code executed within the callback will have access to the context.
   */
  runWithContext<T>(data: Partial<CorrelationData>, fn: () => T): T {
    const context: CorrelationData = {
      correlationId: data.correlationId || nanoid(),
      tenantId: data.tenantId,
      userId: data.userId,
      sessionId: data.sessionId,
      parentSpanId: data.parentSpanId,
      createdAt: Date.now(),
    };

    return correlationStorage.run(context, fn);
  }

  /**
   * Run an async function within a correlation context.
   */
  async runWithContextAsync<T>(
    data: Partial<CorrelationData>,
    fn: () => Promise<T>,
  ): Promise<T> {
    const context: CorrelationData = {
      correlationId: data.correlationId || nanoid(),
      tenantId: data.tenantId,
      userId: data.userId,
      sessionId: data.sessionId,
      parentSpanId: data.parentSpanId,
      createdAt: Date.now(),
    };

    return correlationStorage.run(context, fn);
  }

  /**
   * Get the current correlation context.
   * Returns undefined if called outside of a context.
   */
  getContext(): CorrelationData | undefined {
    return correlationStorage.getStore();
  }

  /**
   * Get the current correlation ID.
   * Returns 'no-context' if called outside of a context.
   */
  getCorrelationId(): string {
    return correlationStorage.getStore()?.correlationId || 'no-context';
  }

  /**
   * Get tenant ID from current context.
   */
  getTenantId(): string | undefined {
    return correlationStorage.getStore()?.tenantId;
  }

  /**
   * Get user ID from current context.
   */
  getUserId(): string | undefined {
    return correlationStorage.getStore()?.userId;
  }

  /**
   * Get session ID from current context.
   */
  getSessionId(): string | undefined {
    return correlationStorage.getStore()?.sessionId;
  }

  /**
   * Create a log context object for structured logging.
   * Includes all available correlation data.
   */
  getLogContext(): Record<string, string | number | undefined> {
    const ctx = correlationStorage.getStore();
    if (!ctx) {
      return { correlationId: 'no-context' };
    }

    return {
      correlationId: ctx.correlationId,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      sessionId: ctx.sessionId,
      parentSpanId: ctx.parentSpanId,
    };
  }

  /**
   * Format a log message with correlation context prefix.
   * Useful for NestJS Logger which doesn't support structured logging natively.
   */
  formatLogMessage(message: string): string {
    const correlationId = this.getCorrelationId();
    return `[${correlationId}] ${message}`;
  }
}

/**
 * Static helper functions for use outside of DI context.
 * Useful for utility functions and low-level code.
 */
export const CorrelationContext = {
  /**
   * Get the current correlation ID.
   */
  getCorrelationId(): string {
    return correlationStorage.getStore()?.correlationId || 'no-context';
  },

  /**
   * Get the full correlation context.
   */
  getContext(): CorrelationData | undefined {
    return correlationStorage.getStore();
  },

  /**
   * Run a function within a correlation context.
   */
  run<T>(data: Partial<CorrelationData>, fn: () => T): T {
    const context: CorrelationData = {
      correlationId: data.correlationId || nanoid(),
      tenantId: data.tenantId,
      userId: data.userId,
      sessionId: data.sessionId,
      parentSpanId: data.parentSpanId,
      createdAt: Date.now(),
    };

    return correlationStorage.run(context, fn);
  },

  /**
   * Format a log message with correlation ID prefix.
   */
  formatLog(message: string): string {
    const correlationId = correlationStorage.getStore()?.correlationId || 'no-context';
    return `[${correlationId}] ${message}`;
  },

  /**
   * Get log context for structured logging.
   */
  getLogContext(): Record<string, string | number | undefined> {
    const ctx = correlationStorage.getStore();
    if (!ctx) {
      return { correlationId: 'no-context' };
    }

    return {
      correlationId: ctx.correlationId,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      sessionId: ctx.sessionId,
    };
  },
};
