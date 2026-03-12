/**
 * Tool result truncation utility.
 *
 * Caps tool results at MAX_TOOL_RESULT_CHARS to prevent context window
 * exhaustion. Based on nanobot pattern (16K cap per tool result).
 *
 * Phase AI-AUDIT: New utility for context window safety.
 */

const MAX_TOOL_RESULT_CHARS = 16_000;

/**
 * Truncate a tool result to fit within the context budget.
 *
 * Strategy:
 * 1. If already under limit, return as-is (fast path).
 * 2. If result has an array field (results, emails, events, contacts, folders),
 *    trim items from the end until under limit.
 * 3. If result has bodyText, truncate the body.
 * 4. Fallback: truncate the serialized JSON.
 *
 * @param result - The tool execution result
 * @returns Truncated result with `truncated: true` flag if modified
 */
export function truncateToolResult<T extends Record<string, unknown>>(
  result: T,
): T {
  const serialized = JSON.stringify(result);
  if (serialized.length <= MAX_TOOL_RESULT_CHARS) return result;

  // Strategy 1: Trim array fields (results, emails, events, contacts, folders)
  const arrayKeys = ['results', 'emails', 'events', 'contacts', 'folders'];
  for (const key of arrayKeys) {
    if (Array.isArray(result[key])) {
      const copy = { ...result, [key]: [...(result[key] as unknown[])] };
      const originalCount = (copy[key] as unknown[]).length;

      while (
        JSON.stringify(copy).length > MAX_TOOL_RESULT_CHARS &&
        (copy[key] as unknown[]).length > 1
      ) {
        (copy[key] as unknown[]).pop();
      }

      (copy as Record<string, unknown>).truncated = true;
      (copy as Record<string, unknown>).originalCount = originalCount;
      return copy as T;
    }
  }

  // Strategy 2: Truncate bodyText field
  if (typeof result.bodyText === 'string') {
    const copy = { ...result };
    const bodyLen = (copy.bodyText as string).length;
    const overhead = serialized.length - bodyLen;
    const maxBody = Math.max(200, MAX_TOOL_RESULT_CHARS - overhead - 100);
    (copy as Record<string, unknown>).bodyText = (
      copy.bodyText as string
    ).slice(0, maxBody);
    (copy as Record<string, unknown>).bodyTruncated = true;
    return copy as T;
  }

  // Strategy 3: Fallback — return a truncation notice
  return {
    ...result,
    truncated: true,
    truncationNote: `Result exceeded ${MAX_TOOL_RESULT_CHARS} characters and was truncated.`,
  } as T;
}
