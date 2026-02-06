/**
 * Tool Utility Functions
 *
 * Shared utilities for VoltAgent tools including timeout handling,
 * error normalization, and result standardization.
 *
 * VOLT-05: Tool timeout handling to prevent indefinite blocking.
 * VOLT-07: Standardized tool result types.
 */

import { Logger } from '@nestjs/common';

const logger = new Logger('ToolUtils');

/** Default tool execution timeout (30 seconds) */
export const DEFAULT_TOOL_TIMEOUT_MS = 30000;

/**
 * Standardized tool result type (VOLT-07)
 *
 * All tools should return this structure for consistency.
 */
export interface ToolResult<T = unknown> {
  /** Whether the operation succeeded */
  success: boolean;
  /** Result data on success */
  data?: T;
  /** Error message on failure */
  error?: string;
  /** Whether the error is retryable */
  retryable?: boolean;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Create a successful tool result
 */
export function toolSuccess<T>(data: T, metadata?: Record<string, unknown>): ToolResult<T> {
  return { success: true, data, metadata };
}

/**
 * Create a failed tool result
 */
export function toolError(error: string, retryable = false, metadata?: Record<string, unknown>): ToolResult<never> {
  return { success: false, error, retryable, metadata };
}

/**
 * Tool timeout error class
 */
export class ToolTimeoutError extends Error {
  constructor(
    public readonly toolName: string,
    public readonly timeoutMs: number,
  ) {
    super(`Tool '${toolName}' timed out after ${timeoutMs}ms`);
    this.name = 'ToolTimeoutError';
  }
}

/**
 * Wrap a tool execution function with a timeout (VOLT-05).
 *
 * Prevents tool execution from blocking indefinitely when external services
 * (databases, APIs) are slow or unresponsive.
 *
 * @param fn - The async function to execute
 * @param timeoutMs - Timeout in milliseconds (default: 30000)
 * @param toolName - Name of the tool for error messages
 * @returns Promise that resolves with fn result or rejects on timeout
 *
 * @example
 * ```typescript
 * execute: async ({ query }) => {
 *   return withToolTimeout(
 *     async () => {
 *       const results = await prisma.email.findMany({ ... });
 *       return { success: true, data: results };
 *     },
 *     30000,
 *     'search_emails'
 *   );
 * }
 * ```
 */
export async function withToolTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number = DEFAULT_TOOL_TIMEOUT_MS,
  toolName = 'unknown_tool',
): Promise<T> {
  // Create an abort controller for cleanup
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      logger.warn(`Tool '${toolName}' exceeded timeout of ${timeoutMs}ms`);
      reject(new ToolTimeoutError(toolName, timeoutMs));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([fn(), timeoutPromise]);
    return result;
  } finally {
    // Clear timeout to prevent memory leaks
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Wrap a tool execution with timeout and standardized error handling (VOLT-05 + VOLT-07).
 *
 * Combines timeout protection with consistent error formatting.
 * On timeout, returns a ToolResult with retryable=true.
 *
 * @param fn - The async function to execute (should return ToolResult)
 * @param timeoutMs - Timeout in milliseconds
 * @param toolName - Name of the tool for error messages
 * @returns ToolResult with either success data or formatted error
 *
 * @example
 * ```typescript
 * execute: async ({ query }) => {
 *   return executeWithTimeout(
 *     async () => {
 *       const results = await fetchData(query);
 *       return toolSuccess(results);
 *     },
 *     30000,
 *     'fetch_data_tool'
 *   );
 * }
 * ```
 */
export async function executeWithTimeout<T>(
  fn: () => Promise<ToolResult<T>>,
  timeoutMs: number = DEFAULT_TOOL_TIMEOUT_MS,
  toolName = 'unknown_tool',
): Promise<ToolResult<T>> {
  try {
    return await withToolTimeout(fn, timeoutMs, toolName);
  } catch (error) {
    if (error instanceof ToolTimeoutError) {
      return toolError(
        `Operation timed out after ${timeoutMs}ms. Please try again or simplify your request.`,
        true, // Timeout errors are retryable
        { toolName, timeoutMs },
      );
    }

    // Handle other errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Tool '${toolName}' failed: ${errorMessage}`);

    return toolError(
      `Tool execution failed: ${errorMessage}`,
      false,
      { toolName },
    );
  }
}

/**
 * Normalize various error types into a consistent error message
 */
export function normalizeToolError(error: unknown): string {
  if (error instanceof ToolTimeoutError) {
    return `Operation timed out after ${error.timeoutMs}ms`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unexpected error occurred';
}

/**
 * Check if an error is considered retryable
 */
export function isRetryableError(error: unknown): boolean {
  // Timeout errors are retryable
  if (error instanceof ToolTimeoutError) {
    return true;
  }

  // Check for common transient error patterns
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('rate limit') ||
      message.includes('429') ||
      message.includes('503') ||
      message.includes('504')
    );
  }

  return false;
}
