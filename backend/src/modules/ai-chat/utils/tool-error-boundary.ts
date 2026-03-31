/**
 * T-0205: Centralized tool error boundary wrapper.
 *
 * Wraps every tool's execute function with try/catch so that runtime
 * errors are returned as structured `{ error: message }` objects
 * instead of propagating as unhandled exceptions that crash the
 * ToolLoopAgent step.
 *
 * Applied once in createToolSet() — no need to modify individual tools.
 */

import { Logger } from '@nestjs/common';
import type { ToolSet } from 'ai';

const logger = new Logger('ToolErrorBoundary');

/**
 * Wrap all tool execute functions with error boundaries.
 * Tools that already catch their own errors will still work —
 * the outer catch only triggers on unhandled throws.
 */
export function wrapToolsWithErrorBoundary<T extends ToolSet>(tools: T): T {
  const result: Record<string, unknown> = {};

  for (const [name, tool] of Object.entries(tools)) {
    const t = tool as { execute?: (...args: unknown[]) => Promise<unknown> };
    if (typeof t?.execute !== 'function') {
      result[name] = tool;
      continue;
    }

    const originalExecute = t.execute;
    result[name] = {
      ...t,
      execute: async (...args: unknown[]) => {
        try {
          return await originalExecute(...args);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          logger.warn(`Tool "${name}" threw: ${message}`);
          return { error: `Tool error: ${message}` };
        }
      },
    };
  }

  return result as T;
}
