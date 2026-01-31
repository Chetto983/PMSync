/**
 * Consolidated LLM Sanitization Utilities
 *
 * This module provides two types of sanitization:
 * 1. Response sanitization: sanitizeLlmResponse - strips echoed internal context markers from LLM output
 * 2. Input sanitization: sanitizeForLLM, wrapUserContent, validatePromptLength - prevents prompt injection attacks
 *
 * Created: 2026-01-31 (Phase 1 Foundation - Plan 01-01)
 * Purpose: Consolidate duplicate sanitization functions before service splits
 */

/**
 * Sanitize LLM response to remove accidentally echoed internal context markers.
 *
 * When injecting context into prompts (e.g., "[User Memory]" sections), LLMs sometimes
 * echo these markers back in their responses. This function strips them out.
 *
 * Removes:
 * - [User Memory] sections
 * - ## Learned Constraints sections
 * - Excessive newlines (3+ → 2)
 *
 * @param text - Raw LLM response text
 * @returns Sanitized response with internal markers removed
 *
 * @example
 * ```typescript
 * const response = await llm.chat(promptWithContext);
 * const clean = sanitizeLlmResponse(response);
 * // "[User Memory]\nJohn prefers...\n---\n\nHello!" → "Hello!"
 * ```
 */
export function sanitizeLlmResponse(text: string): string {
  if (!text) return text;

  return text
    .replace(/\[User Memory\][\s\S]*?---\s*/gi, '')
    .replace(/## Learned Constraints[\s\S]*?(?=\n\n## |$)/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Re-export input sanitization utilities from prompt-sanitizer
// These handle preventing prompt injection attacks on user-provided input
export { sanitizeForLLM, wrapUserContent, validatePromptLength } from '../../utils/prompt-sanitizer';
