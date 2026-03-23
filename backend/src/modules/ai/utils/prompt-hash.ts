import { createHash } from 'crypto';

/**
 * Generate a short hash of a prompt string for version tracking.
 * Used by AI services to populate `promptVersion` in AiRunLedger.
 */
export function promptHash(prompt: string): string {
  return createHash('sha256').update(prompt).digest('hex').slice(0, 12);
}
